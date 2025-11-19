# YUI - YouTube Archive Browser

Self-hosted web application for browsing and managing offline YouTube archives created with yt-dlp.

## Features

- **File System Scanner** - Discovers videos from yt-dlp downloads
- **Metadata Parsing** - Extracts info from `.info.json` files and filenames
- **Web UI** - Scanner management interface with real-time progress
- **REST API** - Comprehensive API for video queries and scan management
- **SQLite Database** - Fast local storage with Prisma ORM
- **Docker Ready** - Easy deployment with Docker Compose

## Deployment (Docker - Recommended)

The easiest way to run YUI is with Docker Compose:

### 1. Clone and Configure

```bash
# Clone repository
git clone <repo-url>
cd yui

# Edit docker-compose.yml to mount your video directories
nano docker-compose.yml
```

Add your video library mounts:

```yaml
volumes:
  - ./config:/config            # Auto-generated config
  - ./data:/data                # Database
  - ./thumbnails:/app/.thumbnails

  # Add your video libraries (use :ro for read-only)
  - /path/to/youtube/archive:/media/archive:ro
  - /path/to/liked/videos:/media/liked:ro
```

### 2. Start YUI

```bash
# Build and start
docker-compose up -d --build

# View logs
docker-compose logs -f yui
```

### 3. First-Time Setup

The container will automatically:
- Run database migrations
- Create default configuration

Then you can add libraries:

1. Open `http://localhost:3001` in your browser
2. Navigate to **Library Management**
3. Click **"Add New Library"**
4. Add libraries using **container paths** (e.g., `/media/archive`)
5. Start scanning!

**No manual setup needed!** Everything is configured via the UI.

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment documentation.

---

## Development Setup

For local development without Docker:

### Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- yt-dlp archive folder (videos downloaded with `[videoId]` in filename)

### 1. Clone and Install

```bash
git clone <repo-url>
cd yui

# Install backend dependencies
cd backend
pnpm install

# Install frontend dependencies
cd ../frontend
pnpm install
```

### 2. Configure

Edit `config.json` in the project root:

```json
{
  "libraries": [
    {
      "path": "/path/to/your/youtube/archive",
      "mediaType": "channel_archive",
      "name": "My Archive"
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

### 3. Initialize Database

```bash
cd backend
pnpm prisma migrate dev
```

### 4. Run Development Servers

**Terminal 1 - Backend:**
```bash
cd backend
pnpm dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
pnpm dev
```

Visit `http://localhost:3000` to access the scanner UI.

## Production Deployment

Build the frontend and run the backend server:

```bash
# Build frontend
cd frontend
pnpm build

# Start backend (serves API + frontend)
cd ../backend
pnpm build
pnpm start
```

Visit `http://localhost:3001` for the complete application.

## Project Structure

```
yui/
├── backend/               # Fastify API server
│   ├── src/
│   │   ├── services/     # Scanner, parser, database
│   │   ├── routes/       # API endpoints
│   │   ├── lib/          # Utilities
│   │   └── types/        # TypeScript types
│   ├── prisma/           # Database schema
│   └── API_TESTING.md    # API documentation
├── frontend/             # Vite + React UI
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── lib/         # API client
│   │   └── types/       # TypeScript types
│   └── README.md
├── config.json           # Application configuration
└── IMPLEMENTATION_STATUS.md  # Technical reference
```

## Architecture

### Backend (Fastify + Prisma)

- **Scanner** - Stack-based filesystem walker
- **Metadata Parser** - Extracts video info from JSON and filenames
- **Database Service** - Video storage with duplicate handling
- **REST API** - Video queries, scan management, config
- **Real-time Progress** - In-memory scan state for live updates

### Frontend (Vite + React)

- **Scanner Management** - Trigger scans, view progress
- **Library List** - View configured libraries
- **Scan History** - Browse past scan logs
- **Video Statistics** - Dashboard with counts and sizes

### Database (SQLite + Prisma)

5 main tables:
- `Video` - Video metadata and file paths
- `Subtitle` - Subtitle tracks
- `Channel` - Channel/uploader info
- `WatchProgress` - Playback position (future)
- `ScanLog` - Scan history and stats

## API Endpoints

### Scan Management
- `POST /api/scan` - Start new scan
- `GET /api/scan/status` - Real-time progress
- `GET /api/scan/history` - Past scan logs
- `GET /api/scan/latest` - Most recent scan

### Videos
- `GET /api/videos` - List videos (with pagination/filters)
- `GET /api/videos/:id` - Get single video
- `GET /api/videos/stats/summary` - Statistics

### Config
- `GET /api/config` - Get configuration
- `POST /api/config` - Update configuration
- `GET /api/config/libraries` - List libraries

See `backend/API_TESTING.md` for detailed API documentation with curl examples.

## Development Commands

### Using Makefile (Recommended)

```bash
make help             # Show all available commands
make dev              # Start both backend and frontend dev servers
make prod             # Build and start Docker container
make logs             # View Docker logs
make stop             # Stop Docker container
make db-migrate       # Run database migrations
make db-studio        # Open Prisma Studio
make db-backup        # Backup database
```

### Manual Commands

#### Backend
```bash
cd backend
pnpm dev              # Start dev server with hot reload
pnpm build            # Compile TypeScript to dist/
pnpm start            # Run compiled production build
pnpm test:scanner     # Test scanner service
pnpm prisma studio    # Open database GUI
```

#### Frontend
```bash
cd frontend
pnpm dev              # Start dev server
pnpm build            # Build static files to dist/
pnpm preview          # Preview production build
```

## Technical Details

### YouTube ID Extraction

The scanner only extracts video IDs from brackets in filenames:
- ✅ `Video Title [dQw4w9WgXcQ].mp4`
- ❌ `dQw4w9WgXcQ.mp4` (no brackets, ignored)

This prevents false positives from random 11-character strings.

### Change Detection

Uses file modification time (`mtime`) comparison instead of hashing:
- Faster than computing hashes
- Detects both metadata and media file changes
- Works reliably for local filesystems

### Duplicate Handling

When the same video ID is found in multiple locations:
- Keeps the video with the larger file size
- Updates metadata if info.json or media file changed

### Folder Structure Support

Handles both organized and loose video files:
- **Canonical folders** - All files have same video ID (e.g., channel folders)
- **Container folders** - Mixed video IDs or loose files (e.g., "random" folder)

## Roadmap

- [x] Filesystem scanner with change detection
- [x] Metadata parsing (info.json + filename)
- [x] SQLite database with Prisma
- [x] REST API (scan, videos, config)
- [x] Scanner management UI
- [x] Library management UI
- [x] Docker deployment
- [ ] Thumbnail generation (Milestone 3)
- [ ] Video browsing UI (Milestone 4)
- [ ] Video streaming endpoint (Milestone 5)
- [ ] Watch progress tracking (Milestone 6)

## Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete Docker deployment guide
- **[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)** - Technical reference
- **[backend/API_TESTING.md](backend/API_TESTING.md)** - API documentation
- **[frontend/README.md](frontend/README.md)** - Frontend development guide

## License

MIT
