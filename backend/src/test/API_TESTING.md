# API Testing Guide

## Start the Server

```bash
pnpm dev
```

Server will start on `http://localhost:3001`

---

## Available Endpoints

### 1. Health Check
```bash
curl http://localhost:3001/api/health
```

**Response:**
```json
{
  "status": "ok",
  "message": "YUI Backend is running!",
  "timestamp": "2024-11-12T09:00:00.000Z"
}
```

---

### 2. Config Management

#### Get Current Config
```bash
curl http://localhost:3001/api/config
```

**Response:**
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

#### Get Libraries Only
```bash
curl http://localhost:3001/api/config/libraries
```

---

### 3. Scan Management

#### Trigger a New Scan
```bash
# Full scan of all libraries
curl -X POST http://localhost:3001/api/scan \
  -H "Content-Type: application/json" \
  -d '{"mode": "full"}'

# Incremental scan
curl -X POST http://localhost:3001/api/scan \
  -H "Content-Type: application/json" \
  -d '{"mode": "incremental"}'

# Scan specific library
curl -X POST http://localhost:3001/api/scan \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "full",
    "libraryPath": "/Users/fahim/codes/projects/yui/downloads"
  }'
```

**Response:**
```json
{
  "message": "Scan started",
  "mode": "full",
  "libraryPath": "all"
}
```

**If scan already running:**
```json
{
  "error": "Scan already in progress",
  "currentScan": {
    "isRunning": true,
    "videosScanned": 42,
    "videosAdded": 10,
    "videosUpdated": 32,
    "errors": []
  }
}
```

#### Get Scan Status (Live Progress)
```bash
curl http://localhost:3001/api/scan/status
```

**Response (while running):**
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

**Response (not running):**
```json
{
  "isRunning": false,
  "videosScanned": 0,
  "videosAdded": 0,
  "videosUpdated": 0,
  "errors": []
}
```

#### Get Scan History
```bash
curl http://localhost:3001/api/scan/history
```

**Response:**
```json
[
  {
    "id": 3,
    "startedAt": "2024-11-12T09:15:00.000Z",
    "endedAt": "2024-11-12T09:16:30.000Z",
    "status": "completed",
    "libraryPath": null,
    "mode": "full",
    "videosScanned": 156,
    "videosAdded": 12,
    "videosUpdated": 144,
    "videosRemoved": 0,
    "errors": null
  },
  {
    "id": 2,
    "startedAt": "2024-11-12T08:00:00.000Z",
    "endedAt": "2024-11-12T08:02:15.000Z",
    "status": "completed",
    "libraryPath": null,
    "mode": "full",
    "videosScanned": 144,
    "videosAdded": 144,
    "videosUpdated": 0,
    "videosRemoved": 0,
    "errors": null
  }
]
```

#### Get Latest Scan
```bash
curl http://localhost:3001/api/scan/latest
```

---

### 4. Video Management

#### List Videos (with pagination)
```bash
# Basic list
curl http://localhost:3001/api/videos

# With pagination
curl "http://localhost:3001/api/videos?page=1&limit=10"

# Filter by media type
curl "http://localhost:3001/api/videos?mediaType=channel_archive"

# Filter by uploader
curl "http://localhost:3001/api/videos?uploader=Danny%20Gonzalez"

# Sort options
curl "http://localhost:3001/api/videos?sort=uploadDate&order=desc"
curl "http://localhost:3001/api/videos?sort=title&order=asc"
```

**Response:**
```json
{
  "videos": [
    {
      "videoId": "dQw4w9WgXcQ",
      "title": "Never Gonna Give You Up",
      "uploader": "Rick Astley",
      "uploadDate": "2009-10-25",
      "durationSeconds": 212,
      "thumbnailPath": "/path/to/thumbnail.webp",
      "generatedThumbnail": null,
      "resolution": "1920x1080",
      "metadataSource": "info_json",
      "hasCompleteMetadata": true,
      "filesizeBytes": 45678900,
      "lastScannedAt": "2024-11-12T09:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "pages": 8
  }
}
```

#### Get Single Video
```bash
curl http://localhost:3001/api/videos/dQw4w9WgXcQ
```

**Response:**
```json
{
  "videoId": "dQw4w9WgXcQ",
  "title": "Never Gonna Give You Up",
  "uploader": "Rick Astley",
  "uploaderId": "UCuAXFkgsw1L7xaCfnd5JJOw",
  "uploadDate": "2009-10-25",
  "durationSeconds": 212,
  "filesizeBytes": 45678900,
  "description": "The official video for "Never Gonna Give You Up"...",
  "tags": "[\"pop\",\"80s\",\"music\"]",
  "mediaType": "channel_archive",
  "libraryPath": "/Users/fahim/codes/projects/yui/downloads",
  "videoPath": "/Users/fahim/codes/projects/yui/downloads/Rick Astley/video.mp4",
  "thumbnailPath": "/path/to/thumbnail.webp",
  "generatedThumbnail": null,
  "resolution": "1920x1080",
  "videoCodec": "h264",
  "audioCodec": "aac",
  "hasCompleteMetadata": true,
  "metadataSource": "info_json",
  "infoJsonMtime": "2024-11-12T08:00:00.000Z",
  "mediaMtime": "2024-11-12T08:00:00.000Z",
  "missingOnDisk": false,
  "firstSeenAt": "2024-11-12T08:00:00.000Z",
  "lastScannedAt": "2024-11-12T09:00:00.000Z",
  "subtitles": [
    {
      "id": 1,
      "videoId": "dQw4w9WgXcQ",
      "language": "en",
      "kind": "vtt",
      "path": "/path/to/subtitle.en.vtt",
      "filesizeBytes": 1234
    }
  ],
  "watchProgress": null
}
```

#### Get Video Statistics
```bash
curl http://localhost:3001/api/videos/stats/summary
```

**Response:**
```json
{
  "totalVideos": 156,
  "byType": [
    {
      "mediaType": "channel_archive",
      "count": 120
    },
    {
      "mediaType": "liked_videos",
      "count": 36
    }
  ],
  "totalSizeBytes": 45678900000
}
```

---

## Testing Workflow

1. **Start server**: `pnpm dev`
2. **Check health**: `curl http://localhost:3001/api/health`
3. **View config**: `curl http://localhost:3001/api/config`
4. **Trigger scan**:
   ```bash
   curl -X POST http://localhost:3001/api/scan \
     -H "Content-Type: application/json" \
     -d '{"mode": "full"}'
   ```
5. **Monitor progress** (poll this while scan runs):
   ```bash
   watch -n 2 'curl -s http://localhost:3001/api/scan/status | jq'
   ```
6. **View results**:
   ```bash
   curl http://localhost:3001/api/videos/stats/summary
   curl http://localhost:3001/api/videos?limit=5
   ```

---

## Common Errors

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::3001
```
**Solution:** Kill the process using port 3001:
```bash
lsof -ti:3001 | xargs kill -9
```

### Scan Already Running
```json
{
  "error": "Scan already in progress"
}
```
**Solution:** Wait for current scan to finish, or check status with `/api/scan/status`

---

## Pro Tips

1. **Use `jq` for pretty JSON**:
   ```bash
   curl http://localhost:3001/api/videos | jq
   ```

2. **Monitor scan in real-time**:
   ```bash
   watch -n 1 'curl -s http://localhost:3001/api/scan/status | jq'
   ```

3. **Check logs** in the terminal where you ran `pnpm dev` - all scan activity is logged there

4. **Use Prisma Studio** to browse the database:
   ```bash
   npx prisma studio
   ```
