# Simplified Implementation Plan

## Architecture Overview

**Two-Server Approach** (Clean Separation of Concerns)

```
┌─────────────────────────────────────────────────┐
│       Frontend (Next.js) - Port 3000            │
│                                                 │
│  • React UI (App Router)                       │
│  • Server Components for initial data          │
│  • Video Player                                │
│  • Client-side routing                         │
│  • Tailwind CSS                                │
│                                                 │
└────────────┬────────────────────────────────────┘
             │ HTTP/REST API
             │
┌────────────▼────────────────────────────────────┐
│       Backend (Fastify) - Port 3001             │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │          REST API Routes                 │  │
│  │  • /api/videos                           │  │
│  │  • /api/channels                         │  │
│  │  • /api/scan                             │  │
│  │  • /api/search                           │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │          Core Services                   │  │
│  │  • Scanner                               │  │
│  │  • MetadataParser                        │  │
│  │  • ThumbnailGenerator                    │  │
│  │  • Database (Prisma)                     │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
└────────────┬────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────┐
│            SQLite Database                      │
└─────────────────────────────────────────────────┘
```

---

## Revised Database Schema

```prisma
// schema.prisma

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Video {
  videoId                String      @id @map("video_id")
  title                  String
  uploader               String?
  uploaderId             String?     @map("uploader_id")
  uploadDate             String?     @map("upload_date")
  durationSeconds        Int?        @map("duration_seconds")
  filesizeBytes          BigInt?     @map("filesize_bytes")
  description            String?
  tags                   String?     // JSON array as string

  mediaType              String      @map("media_type") // 'channel_archive' | 'liked_videos'
  libraryPath            String      @map("library_path")
  videoPath              String      @map("video_path")
  thumbnailPath          String?     @map("thumbnail_path")
  generatedThumbnail     String?     @map("generated_thumbnail") // path to ffmpeg-generated thumbnail

  resolution             String?
  videoCodec             String?     @map("video_codec")
  audioCodec             String?     @map("audio_codec")

  hasCompleteMetadata    Boolean     @default(false) @map("has_complete_metadata")
  metadataSource         String      @map("metadata_source") // 'info_json' | 'filename' | 'database'

  infoJsonMtime          String?     @map("info_json_mtime") // ISO timestamp
  mediaMtime             String?     @map("media_mtime") // ISO timestamp

  missingOnDisk          Boolean     @default(false) @map("missing_on_disk")

  firstSeenAt            String      @map("first_seen_at")
  lastScannedAt          String      @map("last_scanned_at")

  subtitles              Subtitle[]
  watchProgress          WatchProgress?

  @@index([uploader])
  @@index([uploadDate])
  @@index([mediaType])
  @@index([missingOnDisk])
  @@map("video")
}

model Subtitle {
  id                Int         @id @default(autoincrement())
  videoId           String      @map("video_id")
  language          String?
  kind              String?     // 'vtt' | 'srt' | 'ass'
  path              String
  filesizeBytes     Int?        @map("filesize_bytes")

  video             Video       @relation(fields: [videoId], references: [videoId], onDelete: Cascade)

  @@index([videoId])
  @@map("subtitle")
}

model Channel {
  uploaderId        String      @id @map("uploader_id")
  name              String
  description       String?
  thumbnailPath     String?     @map("thumbnail_path")
  videoCount        Int         @default(0) @map("video_count")
  lastUploadDate    String?     @map("last_upload_date")
  lastScannedAt     String      @map("last_scanned_at")

  @@map("channel")
}

model WatchProgress {
  videoId           String      @id @map("video_id")
  positionSeconds   Int         @map("position_seconds")
  durationSeconds   Int?        @map("duration_seconds")
  lastWatchedAt     String      @map("last_watched_at")
  completed         Boolean     @default(false)

  video             Video       @relation(fields: [videoId], references: [videoId], onDelete: Cascade)

  @@map("watch_progress")
}

model ScanLog {
  id                Int         @id @default(autoincrement())
  startedAt         String      @map("started_at")
  endedAt           String?     @map("ended_at")
  status            String      // 'running' | 'completed' | 'failed'
  libraryPath       String?     @map("library_path") // null = all libraries
  mode              String      // 'full' | 'incremental'

  videosScanned     Int         @default(0) @map("videos_scanned")
  videosAdded       Int         @default(0) @map("videos_added")
  videosUpdated     Int         @default(0) @map("videos_updated")
  videosRemoved     Int         @default(0) @map("videos_removed")
  errors            String?     // JSON array of error objects

  @@map("scan_log")
}

// Full-text search support (optional, add later)
// CREATE VIRTUAL TABLE video_fts USING fts5(video_id, title, description, uploader);
```

### Key Schema Changes:
1. **Removed `scan_hash`** - using `info_json_mtime` and `media_mtime` instead
2. **Added `generated_thumbnail`** - separate from original thumbnail
3. **Added `WatchProgress`** - essential for media browser
4. **Added `missing_on_disk`** flag - cleaner than separate table
5. **Added indexes** - for common queries
6. **Simplified to single video per ID** - duplicates handled by choosing larger file

---

## Core Module Specifications

### 1. Scanner Module (`backend/src/services/scanner.ts`)

**Responsibilities:**
- Walk directory trees
- Detect video containers
- Handle `.ignore` files
- Manage scan lifecycle

**Key Functions:**
```ts
interface ScanOptions {
  libraryPath?: string;  // null = scan all
  mode: 'full' | 'incremental';
  onProgress?: (status: ScanProgress) => void;
}

interface ScanProgress {
  phase: 'walking' | 'analyzing' | 'persisting' | 'thumbnails';
  current: number;
  total: number;
  currentPath?: string;
}

class Scanner {
  async scan(options: ScanOptions): Promise<ScanResult>
  async *walkLibrary(rootPath: string): AsyncGenerator<VideoCandidate>
  private hasIgnoreMarker(dirPath: string): Promise<boolean>
  private isMediaFile(filename: string): boolean
  private extractYouTubeId(text: string): string | null
}
```

**YouTube ID Extraction:**
```ts
// ONLY match IDs in square brackets to avoid false positives
const YOUTUBE_ID_REGEX = /\[([A-Za-z0-9_-]{11})\]/;

function extractYouTubeId(text: string): string | null {
  const match = text.match(YOUTUBE_ID_REGEX);
  return match ? match[1] : null;
}
```

**Walker Algorithm:**
```ts
async function* walkLibrary(root: string): AsyncGenerator<VideoCandidate> {
  const stack: string[] = [root];

  while (stack.length > 0) {
    const current = stack.pop()!;

    // Check for .ignore marker
    if (await hasIgnoreMarker(current)) continue;

    const entries = await fs.readdir(current, { withFileTypes: true });
    const files = entries.filter(e => e.isFile() && !e.name.startsWith('.'));
    const dirs = entries.filter(e => e.isDirectory());

    // Check if this directory contains media
    const mediaFiles = files.filter(f => isMediaFile(f.name));

    if (mediaFiles.length > 0) {
      // This is a video container - don't descend further
      yield {
        type: 'directory',
        path: current,
        files: files.map(f => f.name)
      };
      continue; // Don't descend into video folders
    }

    // Check for loose media files with YouTube IDs
    const looseVideos = new Map<string, string[]>();
    for (const file of files) {
      const id = extractYouTubeId(file.name);
      if (id && isMediaFile(file.name)) {
        if (!looseVideos.has(id)) looseVideos.set(id, []);
        looseVideos.get(id)!.push(file.name);
      }
    }

    // Yield loose video candidates
    for (const [id, files] of looseVideos) {
      yield {
        type: 'loose',
        path: current,
        videoId: id,
        files
      };
    }

    // Continue traversing subdirectories
    for (const dir of dirs) {
      stack.push(path.join(current, dir.name));
    }
  }
}
```

---

### 2. MetadataParser Module (`backend/src/services/metadata-parser.ts`)

**Responsibilities:**
- Parse `info.json` files
- Extract metadata from filenames
- Normalize dates and formats
- Determine metadata completeness

**Key Functions:**
```ts
interface ParsedMetadata {
  videoId: string;
  title: string;
  uploader?: string;
  uploaderId?: string;
  uploadDate?: string;
  durationSeconds?: number;
  description?: string;
  tags?: string[];
  resolution?: string;
  videoCodec?: string;
  audioCodec?: string;
  metadataSource: 'info_json' | 'filename';
  hasCompleteMetadata: boolean;
}

class MetadataParser {
  async parseContainer(
    containerPath: string,
    files: string[],
    libraryType: string
  ): Promise<ParsedMetadata>

  private parseInfoJson(jsonPath: string): Promise<InfoJson | null>
  private parseFromFilename(filename: string): Partial<ParsedMetadata>
  private determineCompleteness(metadata: ParsedMetadata): boolean
  private normalizeDate(dateString: string): string | null
}
```

**Filename Parsing:**
```ts
function parseFromFilename(filename: string): Partial<ParsedMetadata> {
  // Extract YouTube ID
  const id = extractYouTubeId(filename);
  if (!id) return {};

  // Remove extension and ID
  let cleaned = filename
    .replace(/\.[^.]+$/, '') // remove extension
    .replace(/\[[A-Za-z0-9_-]{11}\]/, '') // remove [ID]
    .trim();

  // Try to extract date prefix (YYYY-MM-DD or YYYYMMDD)
  const dateMatch = cleaned.match(/^(\d{4}-\d{2}-\d{2}|\d{8})/);
  let uploadDate: string | null = null;

  if (dateMatch) {
    uploadDate = normalizeDate(dateMatch[1]);
    cleaned = cleaned.substring(dateMatch[0].length).replace(/^[\s-]+/, '');
  }

  return {
    videoId: id,
    title: cleaned || `Video ${id}`,
    uploadDate,
    metadataSource: 'filename'
  };
}
```

**Completeness Check:**
```ts
function determineCompleteness(metadata: ParsedMetadata): boolean {
  return !!(
    metadata.title &&
    metadata.uploader &&
    metadata.uploadDate &&
    metadata.durationSeconds &&
    (metadata.resolution || metadata.videoCodec)
  );
}
```

---

### 3. ThumbnailGenerator Module (`backend/src/services/thumbnail-generator.ts`)

**Strategy:**
- First, check for existing thumbnail files (`.webp`, `.jpg`, `.png`)
- If missing, generate using ffmpeg at 10% into the video (or 5 seconds, whichever is greater)
- Generate two sizes: `thumb_small` (320x180) and `thumb_large` (640x360)
- Store in `<projectRoot>/.thumbnails/<videoId>/` directory
- Run thumbnail generation in batches, separate from main scan to avoid blocking

**Key Functions:**
```ts
interface ThumbnailResult {
  smallPath: string;   // 320x180
  largePath: string;   // 640x360
}

class ThumbnailGenerator {
  private thumbnailDir: string;
  private concurrency: number = 2; // Max 2 ffmpeg processes at once

  async generateForVideo(
    videoId: string,
    videoPath: string,
    durationSeconds?: number
  ): Promise<ThumbnailResult | null>

  async generateBatch(
    videos: Array<{ videoId: string; videoPath: string; durationSeconds?: number }>
  ): Promise<Map<string, ThumbnailResult>>

  private getTimestamp(durationSeconds?: number): number {
    // 10% into video, or 5 seconds, whichever is greater
    if (!durationSeconds) return 5;
    return Math.max(5, Math.floor(durationSeconds * 0.1));
  }

  private async extractFrame(
    videoPath: string,
    timestamp: number,
    outputPath: string,
    size: { width: number; height: number }
  ): Promise<void>
}
```

**Implementation:**
```ts
async function extractFrame(
  videoPath: string,
  timestamp: number,
  outputPath: string,
  size: { width: number; height: number }
): Promise<void> {
  const { width, height } = size;

  // Use ffmpeg to extract frame
  await execPromise(
    `ffmpeg -ss ${timestamp} -i "${videoPath}" ` +
    `-vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2" ` +
    `-frames:v 1 -q:v 2 "${outputPath}" -y`
  );
}

async function generateForVideo(
  videoId: string,
  videoPath: string,
  durationSeconds?: number
): Promise<ThumbnailResult | null> {
  try {
    const videoDir = path.join(this.thumbnailDir, videoId);
    await fs.mkdir(videoDir, { recursive: true });

    const timestamp = this.getTimestamp(durationSeconds);

    const smallPath = path.join(videoDir, 'thumb_small.jpg');
    const largePath = path.join(videoDir, 'thumb_large.jpg');

    // Generate both sizes
    await Promise.all([
      this.extractFrame(videoPath, timestamp, smallPath, { width: 320, height: 180 }),
      this.extractFrame(videoPath, timestamp, largePath, { width: 640, height: 360 })
    ]);

    return { smallPath, largePath };
  } catch (error) {
    console.error(`Failed to generate thumbnail for ${videoId}:`, error);
    return null;
  }
}
```

**Directory Structure:**
```
.thumbnails/
├── dQw4w9WgXcQ/
│   ├── thumb_small.jpg  (320x180)
│   └── thumb_large.jpg  (640x360)
├── jNQXAC9IVRw/
│   ├── thumb_small.jpg
│   └── thumb_large.jpg
```

---

### 4. Database Module (`backend/src/lib/database.ts`)

**Responsibilities:**
- Video CRUD operations
- Handle duplicate video strategy (choose larger file)
- Update channel statistics
- Manage scan logs
- Track watch progress

**Key Functions:**
```ts
class Database {
  private prisma: PrismaClient;

  async upsertVideo(metadata: ParsedMetadata, scanId: number): Promise<void>
  async handleDuplicate(existingVideo: Video, newVideo: ParsedMetadata): Promise<void>
  async markMissingVideos(seenIds: Set<string>, libraryPath?: string): Promise<number>
  async updateChannelStats(uploaderId: string): Promise<void>
  async createScanLog(options: ScanOptions): Promise<number>
  async completeScanLog(scanId: number, stats: ScanStats): Promise<void>

  // Watch progress
  async updateWatchProgress(videoId: string, positionSeconds: number): Promise<void>
  async getWatchProgress(videoId: string): Promise<WatchProgress | null>
}
```

**Duplicate Handling:**
```ts
async function handleDuplicate(
  existingVideo: Video,
  newCandidate: ParsedMetadata
): Promise<void> {
  const existingSize = existingVideo.filesizeBytes || 0n;
  const newSize = await this.getFileSize(newCandidate.videoPath);

  if (newSize > existingSize) {
    // New file is bigger, replace
    await this.prisma.video.update({
      where: { videoId: existingVideo.videoId },
      data: {
        videoPath: newCandidate.videoPath,
        filesizeBytes: newSize,
        libraryPath: newCandidate.libraryPath,
        // Update other fields as needed
        lastScannedAt: new Date().toISOString()
      }
    });
    console.log(`Replaced ${existingVideo.videoId} with larger file: ${newCandidate.videoPath}`);
  } else {
    // Keep existing, just update scan timestamp
    await this.prisma.video.update({
      where: { videoId: existingVideo.videoId },
      data: { lastScannedAt: new Date().toISOString() }
    });
    console.log(`Kept existing ${existingVideo.videoId} (larger file)`);
  }
}
```

**Incremental Scan Logic:**
```ts
async function shouldRescan(video: Video, metadata: ParsedMetadata): Promise<boolean> {
  // Check if info.json changed
  if (metadata.infoJsonPath) {
    const infoStat = await fs.stat(metadata.infoJsonPath);
    const infoMtime = infoStat.mtime.toISOString();
    if (video.infoJsonMtime !== infoMtime) return true;
  }

  // Check if media file changed
  const mediaStat = await fs.stat(metadata.videoPath);
  const mediaMtime = mediaStat.mtime.toISOString();
  if (video.mediaMtime !== mediaMtime) return true;

  return false;
}
```

---

## Configuration File

**Location:** `config.json` (root of project)

```json
{
  "libraries": [
    {
      "path": "/Users/fahim/codes/projects/yui/downloads",
      "mediaType": "channel_archive",
      "name": "Main Archive"
    },
    {
      "path": "/Users/fahim/codes/projects/yui/downloads/Liked",
      "mediaType": "liked_videos",
      "name": "Liked Videos"
    }
  ],
  "thumbnailDir": ".thumbnails",
  "databaseUrl": "file:./yui.db",
  "scanOptions": {
    "parallelism": 4,
    "followSymlinks": false,
    "generateThumbnails": true,
    "thumbnailConcurrency": 2
  }
}
```

---

## Fastify API Implementation

### Server Setup (`backend/src/index.ts`)

```ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';

// Import routes
import videoRoutes from './routes/videos';
import channelRoutes from './routes/channels';
import scanRoutes from './routes/scan';
import searchRoutes from './routes/search';
import configRoutes from './routes/config';

const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  }
});

// Enable CORS for frontend
await fastify.register(cors, {
  origin: 'http://localhost:3000', // Next.js frontend
  credentials: true
});

// Serve static thumbnail files
await fastify.register(fastifyStatic, {
  root: path.join(process.cwd(), '.thumbnails'),
  prefix: '/thumbnails/'
});

// Register API routes
await fastify.register(videoRoutes, { prefix: '/api/videos' });
await fastify.register(channelRoutes, { prefix: '/api/channels' });
await fastify.register(scanRoutes, { prefix: '/api/scan' });
await fastify.register(searchRoutes, { prefix: '/api/search' });
await fastify.register(configRoutes, { prefix: '/api/config' });

// Health check
fastify.get('/api/health', async (request, reply) => {
  const db = request.server.db; // Prisma instance
  const stats = await db.video.count();
  const lastScan = await db.scanLog.findFirst({
    orderBy: { startedAt: 'desc' }
  });

  return {
    status: 'ok',
    database: 'connected',
    totalVideos: stats,
    lastScan: lastScan?.startedAt
  };
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    console.log('🚀 Backend running on http://localhost:3001');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
```

### Example Routes

**Video Streaming (`backend/src/routes/videos.ts`):**
```ts
import { FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import { stat } from 'fs/promises';

const videoRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all videos with pagination
  fastify.get('/', async (request, reply) => {
    const { page = 1, limit = 20, mediaType, uploader } = request.query;

    const videos = await fastify.db.video.findMany({
      where: {
        mediaType: mediaType || undefined,
        uploader: uploader || undefined,
        missingOnDisk: false
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { uploadDate: 'desc' }
    });

    return { videos, page, limit };
  });

  // Get single video
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params;

    const video = await fastify.db.video.findUnique({
      where: { videoId: id },
      include: { subtitles: true, watchProgress: true }
    });

    if (!video) {
      return reply.code(404).send({ error: 'Video not found' });
    }

    return video;
  });

  // Stream video with range support
  fastify.get('/:id/stream', async (request, reply) => {
    const { id } = request.params;
    const range = request.headers.range;

    const video = await fastify.db.video.findUnique({
      where: { videoId: id }
    });

    if (!video) {
      return reply.code(404).send({ error: 'Video not found' });
    }

    const videoPath = video.videoPath;
    const videoStat = await stat(videoPath);
    const fileSize = videoStat.size;

    if (range) {
      // Parse Range header
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const stream = fs.createReadStream(videoPath, { start, end });

      reply.code(206).headers({
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4'
      });

      return reply.send(stream);
    } else {
      // No range, send entire file
      const stream = fs.createReadStream(videoPath);

      reply.headers({
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4'
      });

      return reply.send(stream);
    }
  });

  // Update watch progress
  fastify.post('/:id/progress', async (request, reply) => {
    const { id } = request.params;
    const { positionSeconds, durationSeconds } = request.body;

    const progress = await fastify.db.watchProgress.upsert({
      where: { videoId: id },
      create: {
        videoId: id,
        positionSeconds,
        durationSeconds,
        lastWatchedAt: new Date().toISOString(),
        completed: positionSeconds >= durationSeconds * 0.95
      },
      update: {
        positionSeconds,
        lastWatchedAt: new Date().toISOString(),
        completed: positionSeconds >= durationSeconds * 0.95
      }
    });

    return progress;
  });
};

export default videoRoutes;
```

**Scan Routes (`backend/src/routes/scan.ts`):**
```ts
import { FastifyPluginAsync } from 'fastify';
import { Scanner } from '../services/scanner';

const scanRoutes: FastifyPluginAsync = async (fastify) => {
  let currentScan: Promise<any> | null = null;

  // Trigger scan
  fastify.post('/', async (request, reply) => {
    const { libraryPath, mode = 'incremental' } = request.body;

    if (currentScan) {
      return reply.code(409).send({ error: 'Scan already in progress' });
    }

    const scanner = new Scanner(fastify.db, fastify.config);

    currentScan = scanner.scan({ libraryPath, mode })
      .finally(() => { currentScan = null; });

    return { status: 'started', mode, libraryPath };
  });

  // Get scan status
  fastify.get('/status', async (request, reply) => {
    return {
      running: !!currentScan
    };
  });

  // Get scan history
  fastify.get('/history', async (request, reply) => {
    const logs = await fastify.db.scanLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10
    });

    return logs;
  });
};

export default scanRoutes;
```

---

## REST API Endpoints Summary

```
Backend: http://localhost:3001

// Scan Management
POST   /api/scan                    // Trigger scan
GET    /api/scan/status             // Current scan status
GET    /api/scan/history            // Past scan logs

// Videos
GET    /api/videos                  // List with filters/pagination
GET    /api/videos/:id              // Single video details
GET    /api/videos/:id/stream       // Stream video file (range support)
GET    /api/videos/:id/thumbnail    // Serve thumbnail (small or large)
POST   /api/videos/:id/progress     // Update watch progress
GET    /api/videos/:id/subtitles    // List subtitle tracks
GET    /api/videos/random           // Random video

// Channels
GET    /api/channels                // List all channels with stats
GET    /api/channels/:id            // Channel details
GET    /api/channels/:id/videos     // Videos by channel

// Search
GET    /api/search?q=<query>        // Search videos by title/uploader/tags

// Config
GET    /api/config                  // Get current config
POST   /api/config                  // Update config (libraries)

// Health
GET    /api/health                  // DB status, last scan, total videos
```

---

## Implementation Milestones

### Milestone 1: Project Setup & Database (Week 1)
**Goal:** Get the foundation running

**Tasks:**
- [ ] Create project structure with `backend/` and `frontend/` folders
- [ ] Initialize backend: `npm init` + TypeScript setup
- [ ] Install backend dependencies: `fastify`, `@fastify/cors`, `@fastify/static`, `prisma`, `@prisma/client`, `zod`, `p-limit`
- [ ] Create `prisma/schema.prisma` with full schema
- [ ] Run initial migration: `npx prisma migrate dev --name init`
- [ ] Create `config.json` with your library paths
- [ ] Build `ConfigService` to load and validate config
- [ ] Set up Fastify server with basic structure
- [ ] Create `/api/health` endpoint
- [ ] Initialize Next.js 14 frontend with App Router
- [ ] Configure frontend to call backend API (port 3001)

**Deliverable:** Backend running on port 3001, frontend on port 3000, can fetch health status

---

### Milestone 2: Scanner Core (Week 2)
**Goal:** Can scan directories and extract metadata

**Tasks:**
- [ ] Implement `Scanner` class with `walkLibrary` generator
- [ ] Add `.ignore` file detection
- [ ] Implement `extractYouTubeId` with bracket-only matching
- [ ] Create `MetadataParser` class
- [ ] Add `info.json` parsing with error handling
- [ ] Add filename parsing fallback
- [ ] Implement duplicate detection (choose larger file)
- [ ] Create `Database.upsertVideo` method
- [ ] Add basic logging with timestamps
- [ ] Test with your actual `downloads/` folder

**Deliverable:** CLI command that scans a directory and populates the database

```bash
npm run scan -- --library "/Users/fahim/codes/projects/yui/downloads"
```

---

### Milestone 3: Thumbnail Generation (Week 2-3)
**Goal:** Generate missing thumbnails automatically

**Tasks:**
- [ ] Implement `ThumbnailGenerator` class
- [ ] Create `.thumbnails/` directory structure
- [ ] Add ffmpeg wrapper for frame extraction
- [ ] Generate both small (320x180) and large (640x360) sizes
- [ ] Implement batch processing with concurrency limit (2)
- [ ] Add thumbnail generation to scan pipeline (separate phase)
- [ ] Store `generated_thumbnail` path in database
- [ ] Create `/api/videos/:id/thumbnail` endpoint
- [ ] Handle missing thumbnails gracefully (serve placeholder)

**Deliverable:** Scan automatically generates thumbnails for videos without them

---

### Milestone 4: Basic Web UI (Week 3-4)
**Goal:** Browse and play videos

**Tasks:**
- [ ] Set up Tailwind CSS
- [ ] Create layout with navigation (Home, Channels, Liked)
- [ ] Build video grid component with thumbnails
- [ ] Implement `/api/videos` endpoint with pagination
- [ ] Create video detail page with player
- [ ] Implement `/api/videos/:id/stream` with HTTP range support
- [ ] Add subtitle track selector
- [ ] Display metadata (title, uploader, date, duration)
- [ ] Show "missing metadata" warnings when incomplete
- [ ] Basic responsive design

**Deliverable:** Functional YouTube-like browser for archived videos

**Key Pages:**
```
/                         → Recent videos grid
/channels                 → Channel list
/channels/:id             → Videos by channel
/videos/:id               → Video player page
/liked                    → Liked videos view
```

---

### Milestone 5: Incremental Scans & Watch Progress (Week 4-5)
**Goal:** Efficient rescans and video progress tracking

**Tasks:**
- [ ] Implement `mode: 'incremental'` using mtime checks
- [ ] Add `shouldRescan` logic to skip unchanged videos
- [ ] Implement `markMissingVideos` to flag removed files
- [ ] Create `WatchProgress` table operations
- [ ] Add progress update on video pause/seek
- [ ] Show progress bar on video thumbnails
- [ ] Resume playback from saved position
- [ ] Mark videos as "completed" at 95%
- [ ] Filter videos by "In Progress" / "Completed"

**Deliverable:** Scans run in seconds (not minutes), videos remember position

---

### Milestone 6: Search & Channel Management (Week 5-6)
**Goal:** Find videos quickly and organize by channel

**Tasks:**
- [ ] Implement `/api/search` with title/uploader/tag filters
- [ ] Add basic search UI with live results
- [ ] Build channel statistics aggregation
- [ ] Create channel detail page with video grid
- [ ] Show channel thumbnail (if available)
- [ ] Add "Latest Upload" and "Video Count" to channel cards
- [ ] Implement sorting: date, title, duration, filesize
- [ ] Add filters: media type, completeness, missing assets

**Deliverable:** Full search functionality and channel-based navigation

---

### Milestone 7: Polish & Quality of Life (Week 6-7)
**Goal:** Production-ready experience

**Tasks:**
- [ ] Add scan progress overlay (live updates)
- [ ] Implement scan history page
- [ ] Add config management UI (add/remove libraries)
- [ ] Create "Missing Assets" report (no thumbnail, no metadata)
- [ ] Add keyboard shortcuts (space = play/pause, arrows = seek)
- [ ] Implement dark mode
- [ ] Add video statistics dashboard (total size, count, etc.)
- [ ] Write basic documentation (README.md)
- [ ] Add error boundaries and loading states
- [ ] Optimize thumbnail serving (caching headers)

**Deliverable:** Polished, user-friendly application

---

## Testing Strategy

### Unit Tests
```ts
// tests/metadata-parser.test.ts
test('extracts YouTube ID from brackets only', () => {
  expect(extractYouTubeId('Video Title [dQw4w9WgXcQ].mp4')).toBe('dQw4w9WgXcQ');
  expect(extractYouTubeId('dQw4w9WgXcQ-random.mp4')).toBe(null); // no brackets
});

test('parses filename with date prefix', () => {
  const result = parseFromFilename('2024-08-02 - Cool Video [abc12345678].webm');
  expect(result.uploadDate).toBe('2024-08-02');
  expect(result.title).toBe('Cool Video');
  expect(result.videoId).toBe('abc12345678');
});
```

### Integration Tests
Create test fixtures:
```
tests/fixtures/
├── channel_archive/
│   └── Danny Gonzalez/
│       └── 2024-08-02 - Video Title [testid12345]/
│           ├── 2024-08-02 - Video Title [testid12345].mp4
│           ├── 2024-08-02 - Video Title [testid12345].info.json
│           └── 2024-08-02 - Video Title [testid12345].webp
├── liked_videos/
│   └── Random Video [anotherId11].mkv
└── ignored/
    └── .ignore
```

Test scan pipeline:
```ts
test('scans channel archive correctly', async () => {
  const scanner = new Scanner(db, config);
  const result = await scanner.scan({
    libraryPath: 'tests/fixtures/channel_archive',
    mode: 'full'
  });

  expect(result.videosAdded).toBe(1);
  expect(result.errors).toHaveLength(0);

  const video = await db.getVideo('testid12345');
  expect(video?.title).toBe('Video Title');
  expect(video?.metadataSource).toBe('info_json');
});
```

---

## Tech Stack Summary

**Backend (Fastify):**
- Node.js 18+ with TypeScript
- **Fastify** - Fast and low overhead web framework
- `@fastify/cors` - CORS support for frontend
- `@fastify/static` - Serve thumbnails and static files
- Prisma ORM with SQLite
- Zod for validation
- ffmpeg for thumbnail generation
- `p-limit` for concurrency control
- Pino logger (built-in with Fastify)

**Frontend (Next.js):**
- Next.js 14 (App Router)
- React Server Components for initial data
- Tailwind CSS for styling
- Radix UI or shadcn/ui for components
- Native `<video>` element for playback
- React Query or SWR for API data fetching
- Axios or Fetch API for backend communication

**Shared:**
- TypeScript throughout
- `date-fns` for date formatting
- `filesize` for human-readable sizes

---

## File Structure

```
yui/
├── backend/                       # Fastify API Server
│   ├── src/
│   │   ├── index.ts              # Server entry point
│   │   ├── routes/
│   │   │   ├── videos.ts         # Video endpoints
│   │   │   ├── channels.ts       # Channel endpoints
│   │   │   ├── scan.ts           # Scan triggers
│   │   │   ├── search.ts         # Search endpoint
│   │   │   └── config.ts         # Config management
│   │   ├── services/
│   │   │   ├── scanner.ts        # Directory walker
│   │   │   ├── metadata-parser.ts
│   │   │   └── thumbnail-generator.ts
│   │   ├── lib/
│   │   │   ├── database.ts       # Prisma client wrapper
│   │   │   ├── config.ts         # Config loader
│   │   │   └── utils.ts
│   │   └── types/
│   │       └── index.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── scripts/
│   │   └── scan-cli.ts           # CLI scanner
│   ├── tests/
│   │   ├── fixtures/
│   │   └── *.test.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── .env                      # DATABASE_URL
│
├── frontend/                      # Next.js App
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx          # Home page
│   │   │   ├── layout.tsx
│   │   │   ├── videos/
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx  # Video player
│   │   │   ├── channels/
│   │   │   │   ├── page.tsx      # Channel list
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx  # Channel detail
│   │   │   ├── liked/
│   │   │   │   └── page.tsx      # Liked videos
│   │   │   └── search/
│   │   │       └── page.tsx
│   │   ├── components/
│   │   │   ├── VideoGrid.tsx
│   │   │   ├── VideoCard.tsx
│   │   │   ├── VideoPlayer.tsx
│   │   │   ├── ChannelCard.tsx
│   │   │   └── SearchBar.tsx
│   │   ├── lib/
│   │   │   ├── api.ts            # Backend API client
│   │   │   └── utils.ts
│   │   └── types/
│   │       └── index.ts
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── next.config.js
│
├── .thumbnails/                   # Generated thumbnails (shared)
├── config.json                    # App configuration (shared)
├── yui.db                         # SQLite database (shared)
└── README.md
```

---

## Performance Considerations

1. **Scanning Large Libraries (10k+ videos):**
   - Use generator pattern to avoid loading all paths in memory
   - Batch database inserts (50-100 at a time)
   - Skip unchanged videos in incremental mode (99% speedup)

2. **Thumbnail Generation:**
   - Run in separate phase after metadata scan
   - Limit concurrency to 2 ffmpeg processes
   - Skip if thumbnail already exists and is newer than video file

3. **Video Streaming:**
   - Implement HTTP range requests properly
   - Set appropriate cache headers
   - Consider nginx/caddy for production serving

4. **Database:**
   - Indexes on common query fields
   - Keep SQLite for simplicity (handles 100k+ videos fine)
   - Use connection pooling if adding Postgres later

---

## Future Enhancements (Post-MVP)

- [ ] Full-text search using SQLite FTS5
- [ ] Playlist support (custom playlists)
- [ ] Export watch history / statistics
- [ ] Multi-user support with accounts
- [ ] Download queue integration (monitor yt-dlp output)
- [ ] Automatic metadata backfill via YouTube API
- [ ] Video tags and custom categorization
- [ ] Jellyfin/Plex integration
- [ ] Mobile-responsive PWA

---

## Getting Started

### Initial Setup

```bash
# 1. Create project directory
mkdir yui && cd yui

# 2. Initialize backend
mkdir backend && cd backend
npm init -y
npm install fastify @fastify/cors @fastify/static prisma @prisma/client zod p-limit pino pino-pretty
npm install -D typescript @types/node tsx nodemon
npx tsc --init

# 3. Set up Prisma
npx prisma init
# Copy schema.prisma content from this document
# Update DATABASE_URL in .env to: file:../yui.db
npx prisma migrate dev --name init
npx prisma generate

# 4. Create basic Fastify server structure
mkdir -p src/{routes,services,lib,types}
touch src/index.ts

# 5. Add scripts to package.json
# "dev": "nodemon --exec tsx src/index.ts"
# "build": "tsc"
# "start": "node dist/index.js"

cd ..

# 6. Initialize frontend
npx create-next-app@latest frontend
cd frontend
npm install @tanstack/react-query axios date-fns

# Configure next.config.js to proxy API requests to backend
# Or use NEXT_PUBLIC_API_URL=http://localhost:3001

cd ..

# 7. Create shared config
cat > config.json << EOF
{
  "libraries": [
    {
      "path": "/path/to/your/downloads",
      "mediaType": "channel_archive",
      "name": "Main Archive"
    }
  ],
  "thumbnailDir": ".thumbnails",
  "databaseUrl": "file:./yui.db",
  "scanOptions": {
    "parallelism": 4,
    "followSymlinks": false,
    "generateThumbnails": true,
    "thumbnailConcurrency": 2
  }
}
EOF

# 8. Start development
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

### Development Workflow

```bash
# Run backend (port 3001)
cd backend
npm run dev

# Run frontend (port 3000)
cd frontend
npm run dev

# Run database migrations
cd backend
npx prisma migrate dev

# Generate Prisma client after schema changes
npx prisma generate

# Run CLI scanner
cd backend
npx tsx scripts/scan-cli.ts --library "/path/to/downloads"
```

### Production Build

```bash
# Build backend
cd backend
npm run build

# Build frontend (static export)
cd frontend
npm run build

# Start production server
cd backend
npm start
# Serve frontend static files from Fastify using @fastify/static
```

---

## Summary

This simplified plan removes ~30% of complexity while keeping all essential features:

✅ **Fastify backend** - Fast, TypeScript-first, perfect for video streaming
✅ **Next.js frontend** - Modern React with Server Components
✅ **Simplified change detection** - mtime instead of hash computation
✅ **Smart duplicate handling** - Keep larger file automatically
✅ **Comprehensive thumbnail generation** - Two sizes, ffmpeg-based
✅ **Watch progress tracking** - Essential for media browser UX
✅ **Proper separation** - Backend and frontend in separate folders

Focus on getting **Milestones 1-3** working end-to-end (scanner + thumbnails) before building the UI. This ensures the data pipeline is solid before investing in the frontend.

Ready to start implementing?
