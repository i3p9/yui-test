# YUI - YouTube Archive Browser
## Implementation Status & Technical Reference

**Last Updated:** 2024-11-12
**Current Milestone:** Milestone 2 Complete (Scanner Core + REST API)

---

## Project Overview

A self-hosted application for browsing and managing offline YouTube archives created by `yt-dlp`. Provides a YouTube-like interface for locally stored videos with full metadata support.

### Tech Stack

**Backend:**
- Node.js 18+ with TypeScript
- **Fastify** - Web framework (port 3001)
- **Prisma** - ORM with SQLite
- **Zod** - Runtime validation
- **Pino** - Logging

**Frontend (Planned):**
- Next.js 14 (App Router)
- Tailwind CSS
- React Query/SWR

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│       Backend (Fastify) - Port 3001             │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │          REST API Routes                 │  │
│  │  • /api/videos                           │  │
│  │  • /api/scan                             │  │
│  │  • /api/config                           │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │          Core Services                   │  │
│  │  • Scanner (filesystem walker)           │  │
│  │  • MetadataParser (info.json parser)     │  │
│  │  • DatabaseService (CRUD operations)     │  │
│  │  • ScanOrchestrator (coordinates all)    │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
└────────────┬────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────┐
│         SQLite Database (yui.db)                │
│  • video (main table)                           │
│  • subtitle, channel, watch_progress, scan_log  │
└─────────────────────────────────────────────────┘
```

---

## Database Schema

### Core Tables

#### `video` (26 columns)
Primary table storing all video metadata.

```typescript
{
  videoId: string           // PK: YouTube ID (11 chars)
  title: string
  uploader?: string
  uploaderId?: string       // Channel ID (UC...)
  uploadDate?: string       // YYYY-MM-DD
  durationSeconds?: number
  filesizeBytes?: BigInt
  description?: string
  tags?: string            // JSON array as string

  // Paths
  mediaType: string        // 'channel_archive' | 'liked_videos'
  libraryPath: string
  videoPath: string
  thumbnailPath?: string
  generatedThumbnail?: string

  // Technical
  resolution?: string
  videoCodec?: string
  audioCodec?: string

  // Metadata tracking
  hasCompleteMetadata: boolean
  metadataSource: string   // 'info_json' | 'filename' | 'database'
  infoJsonMtime?: string   // For change detection
  mediaMtime?: string      // For change detection

  // Status
  missingOnDisk: boolean   // File deleted?
  firstSeenAt: string
  lastScannedAt: string
}
```

**Indexes:** `uploader`, `uploadDate`, `mediaType`, `missingOnDisk`

#### `subtitle` (6 columns)
One-to-many relationship with videos.

```typescript
{
  id: number              // Auto-increment
  videoId: string         // FK to video
  language?: string       // 'en', 'es', etc.
  kind?: string          // 'vtt' | 'srt' | 'ass'
  path: string
  filesizeBytes?: number
}
```

#### `channel` (7 columns)
Aggregated channel statistics.

```typescript
{
  uploaderId: string      // PK: Channel ID
  name: string
  description?: string
  thumbnailPath?: string
  videoCount: number
  lastUploadDate?: string
  lastScannedAt: string
}
```

#### `watch_progress` (5 columns)
Tracks playback position (like Netflix).

```typescript
{
  videoId: string         // PK & FK
  positionSeconds: number
  durationSeconds?: number
  lastWatchedAt: string
  completed: boolean      // >95% watched
}
```

#### `scan_log` (10 columns)
Audit trail for all scans.

```typescript
{
  id: number              // Auto-increment
  startedAt: string
  endedAt?: string
  status: string          // 'running' | 'completed' | 'failed'
  libraryPath?: string
  mode: string           // 'full' | 'incremental'
  videosScanned: number
  videosAdded: number
  videosUpdated: number
  videosRemoved: number
  errors?: string        // JSON array
}
```

---

## Backend Implementation

### File Structure

```
backend/
├── src/
│   ├── index.ts                    # ✅ Server entry point
│   │
│   ├── routes/
│   │   ├── videos.ts              # ✅ Video query endpoints
│   │   ├── scan.ts                # ✅ Scan management
│   │   └── config.ts              # ✅ Config/library management
│   │
│   ├── services/
│   │   ├── scanner.ts             # ✅ Filesystem walker
│   │   ├── metadata-parser.ts     # ✅ Info.json parser
│   │   ├── database-service.ts    # ✅ Database operations
│   │   └── scan-orchestrator.ts   # ✅ Coordinates scanning
│   │
│   ├── lib/
│   │   ├── config.ts              # ✅ Config loader (Zod validation)
│   │   ├── database.ts            # ✅ Prisma client singleton
│   │   └── scan-state.ts          # ✅ In-memory scan progress
│   │
│   └── types/
│       └── index.ts               # ✅ TypeScript interfaces
│
├── prisma/
│   ├── schema.prisma              # ✅ Database schema
│   └── migrations/                # ✅ Migration history
│
├── yui.db                         # ✅ SQLite database
└── config.json                    # ✅ App configuration
```

### Core Services

#### 1. Scanner (`services/scanner.ts`)
**Responsibility:** Walk directory trees and find video files.

**Key Features:**
- ✅ Stack-based depth-first traversal (no recursion)
- ✅ Handles `.ignore` marker files
- ✅ Detects canonical video folders (all files same ID)
- ✅ Detects loose video files (mixed IDs in one folder)
- ✅ Async generator pattern (memory efficient)
- ✅ Extracts YouTube IDs from brackets only: `[dQw4w9WgXcQ]`

**Algorithm:**
```typescript
1. Push root to stack
2. While stack not empty:
   a. Pop directory
   b. Check for .ignore (skip if present)
   c. Read entries (files + subdirs)
   d. Extract media files
   e. If all media files have SAME YouTube ID:
      → Yield as canonical video folder (don't descend)
   f. Otherwise:
      → Process loose videos
      → Add subdirs to stack (continue descending)
```

#### 2. MetadataParser (`services/metadata-parser.ts`)
**Responsibility:** Extract metadata from info.json or filenames.

**Key Features:**
- ✅ Primary source: `*.info.json` files
- ✅ Fallback: filename parsing (date prefix, title, ID)
- ✅ Subtitle detection (`.vtt`, `.srt`, `.ass`)
- ✅ Thumbnail preference: `.webp` > `.jpg` > `.png`
- ✅ Date normalization (`YYYYMMDD` → `YYYY-MM-DD`)
- ✅ Completeness check (flags incomplete metadata)

**Metadata Sources:**
1. **info_json** - Full metadata from yt-dlp
2. **filename** - Parsed from file/folder names
3. **database** - Previous scan (for deleted files)

#### 3. DatabaseService (`services/database-service.ts`)
**Responsibility:** All database operations.

**Key Features:**
- ✅ Upsert videos (insert new, update existing)
- ✅ Duplicate handling (keeps larger file)
- ✅ Change detection (compare mtime of info.json and media files)
- ✅ Subtitle management (delete old, insert new)
- ✅ Channel stats aggregation
- ✅ Scan logging (create, complete, fail)
- ✅ Mark missing videos (not seen in scan)

**Duplicate Strategy:**
```typescript
If same video_id found:
  1. Check if metadata changed (mtime comparison)
  2. Check if new file is larger
  3. If yes to either → replace
  4. Otherwise → just update lastScannedAt
```

#### 4. ScanOrchestrator (`services/scan-orchestrator.ts`)
**Responsibility:** Coordinate scanner, parser, and database.

**Key Features:**
- ✅ Full vs incremental scan support
- ✅ Scan all libraries or specific path
- ✅ Real-time progress tracking (in-memory state)
- ✅ Error collection and logging
- ✅ Channel stats updates
- ✅ Scan log management

**Workflow:**
```typescript
1. Load config
2. Create scan log entry (status: 'running')
3. Initialize progress tracker
4. For each library:
   a. Walk directory tree (Scanner)
   b. For each candidate:
      - Parse metadata (MetadataParser)
      - Upsert to database (DatabaseService)
      - Update progress (ScanState)
5. Update channel statistics
6. Mark videos not seen as missing
7. Complete scan log
```

---

## REST API Endpoints

### Video Management

#### `GET /api/videos`
List videos with pagination and filters.

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20)
- `mediaType` - Filter by type ('channel_archive' | 'liked_videos')
- `uploader` - Filter by channel name
- `missingOnDisk` - Show deleted files ('true' | 'false')
- `sort` - Sort field (default: 'uploadDate')
- `order` - Sort order ('asc' | 'desc')

**Response:**
```json
{
  "videos": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "pages": 8
  }
}
```

#### `GET /api/videos/:id`
Get single video with full details (includes subtitles, watch progress).

#### `GET /api/videos/stats/summary`
Get overall statistics.

**Response:**
```json
{
  "totalVideos": 156,
  "byType": [
    { "mediaType": "channel_archive", "count": 120 },
    { "mediaType": "liked_videos", "count": 36 }
  ],
  "totalSizeBytes": 45678900000
}
```

---

### Scan Management

#### `POST /api/scan`
Trigger a new scan.

**Request Body:**
```json
{
  "mode": "full" | "incremental",
  "libraryPath": "/path/to/library" // optional
}
```

**Response:**
```json
{
  "message": "Scan started",
  "mode": "full",
  "libraryPath": "all"
}
```

**Error (409 if already running):**
```json
{
  "error": "Scan already in progress",
  "currentScan": { ... }
}
```

#### `GET /api/scan/status`
Get real-time scan progress (poll this endpoint).

**Response (running):**
```json
{
  "isRunning": true,
  "scanId": 1,
  "startedAt": "2024-11-12T09:00:00.000Z",
  "mode": "full",
  "currentLibrary": "Main Archive",
  "videosScanned": 42,
  "videosAdded": 10,
  "videosUpdated": 32,
  "errors": []
}
```

**Response (idle):**
```json
{
  "isRunning": false,
  "videosScanned": 0,
  "videosAdded": 0,
  "videosUpdated": 0,
  "errors": []
}
```

#### `GET /api/scan/history`
Get last 20 scan logs.

#### `GET /api/scan/latest`
Get most recent scan log.

---

### Config Management

#### `GET /api/config`
Get current configuration (entire config.json).

#### `POST /api/config`
Update configuration (writes to config.json).

**Request Body:** Full `Config` object

#### `GET /api/config/libraries`
Get just the libraries array.

---

## Configuration Format

**Location:** `<project-root>/config.json`

```json
{
  "libraries": [
    {
      "path": "/Users/fahim/codes/projects/yui/downloads",
      "mediaType": "channel_archive",
      "name": "Main Archive",
      "skip": false
    }
  ],
  "thumbnailDir": ".thumbnails",
  "databaseUrl": "file:./backend/yui.db",
  "scanOptions": {
    "parallelism": 4,
    "followSymlinks": false,
    "generateThumbnails": true,
    "thumbnailConcurrency": 2
  }
}
```

**Library Types:**
- `channel_archive` - Organized by channel folders
- `liked_videos` - Mixed/random videos

---

## Filesystem I/O Concepts

### Key Node.js APIs Used

**`readdir(path, { withFileTypes: true })`**
- Returns `Dirent` objects with type info
- More efficient than `stat()` for each file
- Methods: `.isFile()`, `.isDirectory()`, `.name`

**`stat(path)`**
- Returns `Stats` object with file metadata
- Properties: `.size`, `.mtime`, `.birthtime`
- Used for change detection and filesize

**`access(path)`**
- Checks if file/folder exists and is accessible
- Throws if not accessible
- Used for `.ignore` detection

**Async Generators (`async function*`)**
- Yields results one at a time
- Memory efficient for large directories
- Consumed with `for await...of`

---

## How Scanning Works

### Case 1: Canonical Video Folder
```
/Danny Gonzalez/2024-08-02 - Video Title [dQw4w9WgXcQ]/
    2024-08-02 - Video Title [dQw4w9WgXcQ].webm
    2024-08-02 - Video Title [dQw4w9WgXcQ].info.json
    2024-08-02 - Video Title [dQw4w9WgXcQ].webp
    2024-08-02 - Video Title [dQw4w9WgXcQ].en.vtt
```

**Detection:** All media files have the same YouTube ID
**Result:** Yield as single video, don't descend into folder

### Case 2: Loose Files (Container Folder)
```
/random/
    Loose Video 1 [abc12345678].mkv
    Loose Video 2 [def12345678].mp4
    Some Folder/
        Video [ghi12345678]/
            video.mp4
```

**Detection:** Multiple different YouTube IDs in same folder
**Result:** Yield each loose video separately, continue descending into subfolders

### Case 3: Ignored Folder
```
/do-not-scan/
    .ignore    ← Marker file
    (any content)
```

**Detection:** `.ignore` file exists
**Result:** Skip entire directory tree

---

## Change Detection (Incremental Scans)

Instead of computing hashes, we compare **file modification times**:

```typescript
Video record stores:
- infoJsonMtime: "2024-11-12T08:00:00.000Z"
- mediaMtime:    "2024-11-12T08:00:00.000Z"

On rescan:
1. Check if info.json mtime changed → re-parse metadata
2. Check if media file mtime changed → re-probe media
3. If neither changed → skip (just update lastScannedAt)
```

**Benefits:**
- Fast (no hashing large video files)
- Accurate (catches file edits)
- Simple (just compare timestamps)

---

## Implementation Checklist

### ✅ Milestone 1: Project Setup (Complete)
- [x] Backend folder structure
- [x] TypeScript configuration
- [x] Prisma schema + migrations
- [x] Database created (SQLite)
- [x] Fastify server running
- [x] CORS configured
- [x] Health check endpoint

### ✅ Milestone 2: Scanner Core (Complete)
- [x] Scanner service (filesystem walker)
- [x] MetadataParser service
- [x] DatabaseService (CRUD operations)
- [x] ScanOrchestrator
- [x] Canonical folder detection
- [x] Loose file detection
- [x] `.ignore` support
- [x] Duplicate handling (keep larger file)
- [x] Change detection (mtime comparison)
- [x] Channel stats aggregation
- [x] Scan logging

### ✅ Milestone 2.5: REST API (Complete)
- [x] Video query endpoints
- [x] Scan management endpoints
- [x] Config management endpoints
- [x] Real-time scan progress
- [x] BigInt serialization fix

### ⏳ Milestone 3: Thumbnail Generation (Planned)
- [ ] ThumbnailGenerator service
- [ ] ffmpeg integration
- [ ] Two sizes (320x180, 640x360)
- [ ] Extract frame at 10% or 5s
- [ ] Batch processing (max 2 concurrent)
- [ ] Store in `.thumbnails/<videoId>/`

### ⏳ Milestone 4: Frontend (Planned)
- [ ] Next.js 14 setup
- [ ] Video grid component
- [ ] Video player page
- [ ] Channel list/detail pages
- [ ] Search functionality
- [ ] Scan trigger UI
- [ ] Live progress display

### ⏳ Milestone 5: Video Streaming (Planned)
- [ ] HTTP range request support
- [ ] Stream endpoint `/api/videos/:id/stream`
- [ ] Proper MIME types
- [ ] Cache headers

### ⏳ Milestone 6: Watch Progress (Planned)
- [ ] Progress bar on thumbnails
- [ ] Resume playback
- [ ] Mark as completed (>95%)
- [ ] "Continue Watching" view

### ⏳ Milestone 7: Polish (Planned)
- [ ] Dark mode
- [ ] Keyboard shortcuts
- [ ] Error boundaries
- [ ] Loading states
- [ ] Statistics dashboard

---

## Known Limitations

1. **Single video per ID** - If same YouTube ID in multiple libraries, keeps larger file
2. **No file move detection** - Moving files appears as "removed" + "new"
3. **No playlist support** - Individual videos only (for now)
4. **No automatic API backfill** - Relies on existing metadata
5. **No thumbnail generation yet** - Uses existing thumbnails only

---

## Performance Characteristics

**Scan Performance (tested with ~150 videos):**
- Full scan: ~2-3 seconds
- Incremental scan: <1 second (if no changes)
- Memory usage: ~50MB (generator pattern)

**Database:**
- SQLite handles 100k+ videos easily
- Indexes on common queries
- Connection pooling ready

**API Response Times:**
- List videos: <50ms
- Single video: <10ms
- Stats summary: <20ms

---

## Development Commands

```bash
# Start backend server (port 3001)
pnpm dev

# Run full database scan
pnpm test:db

# Run scanner test (no database)
pnpm test:scanner

# Build for production
pnpm build

# Start production server
pnpm start

# Database management
npx prisma studio           # Browse database in browser
npx prisma migrate dev      # Create new migration
npx prisma generate         # Generate Prisma client
```

---

## Testing Workflow

1. **Start server:** `pnpm dev`
2. **Check health:** `curl http://localhost:3001/api/health`
3. **Trigger scan:** `curl -X POST http://localhost:3001/api/scan -H "Content-Type: application/json" -d '{"mode":"full"}'`
4. **Monitor progress:** `watch -n 2 'curl -s http://localhost:3001/api/scan/status | jq'`
5. **View results:** `curl http://localhost:3001/api/videos | jq`
6. **Browse database:** `npx prisma studio`

---

## Next Steps

**Immediate priorities:**
1. ~~Build REST API for scan management~~ ✅ Complete
2. Add video streaming endpoint
3. Build frontend video grid
4. Implement thumbnail generation

**Future enhancements:**
- Full-text search (SQLite FTS5)
- Playlist support
- Multi-user accounts
- YouTube API backfill
- Mobile PWA

---

## References

- [Fastify Documentation](https://www.fastify.io/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [yt-dlp Documentation](https://github.com/yt-dlp/yt-dlp)
- [Node.js fs/promises API](https://nodejs.org/api/fs.html#promises-api)

---

**Status:** Production-ready backend with full scan functionality and REST API. Ready for frontend development.
