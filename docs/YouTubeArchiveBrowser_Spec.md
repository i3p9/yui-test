# Project: Self-Hosted YouTube Archive Browser

## Vision
Host an offline-first YouTube library that feels familiar to browse, yet works entirely with local media produced by tools such as `yt-dlp`. The system should tolerate imperfect archives, surface missing assets, and keep metadata in sync with the filesystem while avoiding accidental network requests. Implementation should stay lean—prefer the simplest design that works over elaborate abstractions.

---

## Source Libraries & Input Assumptions
- Users can register multiple root folders. Each root is tagged as:
  - `channel_archive`: per-channel folders (e.g. `downloads/Danny Gonzalez/...`).
  - `liked_videos`: mixed channel content (e.g. `downloads/Liked/...`).
  - Future types (playlists, shorts, podcasts) remain optional.
- Recursively scan each root, honoring these rules:
  - Skip any directory that contains a `.ignore` file (case-sensitive). Do **not** descend further.
  - Support macOS artifacts (`.DS_Store`) and other junk files by filtering them out.
  - Treat directories or loose files beginning with `_` as hidden but still scannable unless `.ignore` is present.
- Case 1: Canonical archive per video
  ```
  /Channel Name/2024-08-02 - Video Title [2e5dcUNoxkY]/
      2024-08-02 - Video Title [2e5dcUNoxkY].webm
      2024-08-02 - Video Title [2e5dcUNoxkY].info.json
      2024-08-02 - Video Title [2e5dcUNoxkY].webp
      2024-08-02 - Video Title [2e5dcUNoxkY].en.vtt
  ```
- Case 2: Loose media files (e.g. `downloads/random/Ryan's Lore Corner - ... [lgmXwKhzCK0].mkv`).
  - Must infer metadata from the filename.
  - If multiple files share the same 11-char YouTube ID within a folder, treat the folder as a logical video container.
- Additional cases to capture later: partially downloaded videos, reuploads without IDs, split audio/video pairs, playlists.

---

## High-Level Requirements
- Support initial full scan plus incremental rescans that detect:
  - New videos
  - Removed videos
  - Metadata changes (`info.json` timestamp diff or hash)
- Tolerate missing assets:
  - Mark videos as playable if at least one media file (`.mp4`, `.mkv`, `.webm`, `.m4a`) exists.
  - Record missing thumbnail, subtitles, or metadata as flags for the UI.
- Provide a web UI with a YouTube-inspired layout covering channel browsing, search, liked videos, and individual playback.
- Enforce read-only operations on media files; modifications only touch the database and generated thumbnails/previews (future).
- Prefer straightforward implementations; avoid complex abstractions unless they directly reduce maintenance or improve performance.

---

## Metadata Extraction & Normalization
- Preferred metadata source hierarchy:
  1. `*.info.json`
  2. Folder/file naming pattern
  3. Previous database record (for rescans when files were pruned)
- Extract fields:
  | Field | Type | Notes |
  |-------|------|-------|
  | `video_id` | string (11 chars) | Primary key; validate via regex `[A-Za-z0-9_-]{11}`. |
  | `title` | string | Fallback to filename sans ID. |
  | `uploader` | string | Channel folder name or `info.json.uploader`. |
  | `uploader_id` | string | Optional; parse from channel folder `[UC...]`. |
  | `upload_date` | date | Accept `YYYYMMDD` from info.json or parse from prefix `YYYY-MM-DD`. |
  | `duration_seconds` | int | From `info.json.duration`. |
  | `filesize_bytes` | bigint | Derived from media file(s). |
  | `description` | text | `info.json.description`. |
  | `tags` | text array | `info.json.tags` JSON array, store serialized form. |
  | `subtitle_tracks` | JSON | Each subtitle file with language + path. |
  | `media_type` | enum | `channel_archive` or `liked_videos`. |
  | `library_path` | string | Absolute path to root library. |
  | `video_path` | string | Path to chosen primary media file. |
  | `audio_path` | string? | Optional separate audio asset. |
  | `thumbnail_path` | string? | Local image path. |
  | `resolution` | string? | Derive from media probe (e.g., `1920x1080`). |
  | `video_codec` | string? | From media probe or `info.json`. |
  | `audio_codec` | string? | From probe or `info.json`. |
  | `has_complete_metadata` | boolean | True when essential fields present without API fallback. |
  | `metadata_source` | enum | `info_json`, `filename`, `database`. |
  | `scan_hash` | string | Hash of metadata+paths used for change detection. |
  | `first_seen_at` | datetime | When the video entered the DB. |
  | `last_scanned_at` | datetime | Updated on every scan. |
- Optional: integrate a YouTube Data API client (configurable) to backfill metadata only when `has_complete_metadata = false` and a valid API key is provided.
- Normalize filenames:
  - Strip leading timestamps like `YYYYMMDD` or `YYYY-MM-DD`.
  - Support double spaces or separators introduced during download.
  - Treat file extensions case-insensitively.
- Subtitle detection:
  - Accept `.vtt`, `.srt`, `.ass`.
  - Derive language code from suffix (e.g., `.en.vtt`) when possible.
- Thumbnail preference order: `.webp`, `.jpg`, `.png`.

---

## Database Model (Initial Draft)
- Use SQLite for local deployments; allow PostgreSQL via configuration.
- Suggested tables:
  ```text
  video (
    video_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    uploader TEXT,
    uploader_id TEXT,
    upload_date TEXT,
    duration_seconds INTEGER,
    filesize_bytes INTEGER,
    description TEXT,
    tags TEXT,
    media_type TEXT NOT NULL CHECK (media_type IN ('channel_archive','liked_videos')),
    library_path TEXT NOT NULL,
    video_path TEXT NOT NULL,
    audio_path TEXT,
    thumbnail_path TEXT,
    resolution TEXT,
    video_codec TEXT,
    audio_codec TEXT,
    has_complete_metadata INTEGER NOT NULL DEFAULT 0,
    metadata_source TEXT NOT NULL,
    scan_hash TEXT,
    first_seen_at TEXT NOT NULL,
    last_scanned_at TEXT NOT NULL
  )

  channel (
    uploader_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    thumbnail_path TEXT,
    last_scanned_at TEXT NOT NULL
  )

  subtitle (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT NOT NULL REFERENCES video(video_id) ON DELETE CASCADE,
    language TEXT,
    kind TEXT,
    path TEXT NOT NULL,
    filesize_bytes INTEGER
  )
  ```
- Store arrays/JSON fields as JSON strings; Prisma can map them via `Json`.
- Maintain an audit table `scan_log` capturing start/end timestamps, counts, and errors for observability.

---

## System Architecture

### Backend Responsibilities
- Filesystem scan orchestration (full + incremental + targeted root scan).
- Metadata parsing and normalization (detailed in `Backend_DataGathering_Guide.md`).
- Lightweight media probes to capture resolution and codec when files change.
- Database migrations and integrity checks.
- Media streaming with HTTP range support.
- REST/GraphQL API for frontend and future automation.
- Config service (read/write JSON or YAML config stored on disk).
- Optional YouTube Data API backfill for records missing complete metadata.

### Suggested Stack
- **Language:** Node.js (18+) with TypeScript enabled.
- **Framework:** Fastify or Express for the API; worker threads or BullMQ for async jobs.
- **ORM:** Prisma for database portability.
- **Task scheduling:** `node-cron` or built-in timers for periodic scans.
- **Validation:** Zod or TypeScript types for runtime safety.
- **Logging:** Pino with structured JSON logs.

### API Surface (expanded)
| Method | Endpoint | Notes |
|--------|----------|-------|
| `POST` | `/api/scan` | Accept body: `{ scope: "all" | "library", libraryPath?: string, mode: "full" | "incremental" }`. |
| `GET` | `/api/scans/latest` | Returns scan summary + errors. |
| `GET` | `/api/videos` | Pagination, sort, filter by `media_type`, `uploader`, `missingAssets`. |
| `GET` | `/api/video/:id` | Includes related subtitles + file stats. |
| `GET` | `/api/video/:id/stream` | Range requests for playback. |
| `GET` | `/api/channels` | Aggregate stats per channel (video count, last upload date). |
| `GET` | `/api/search` | Query by title/tag/uploader/description. |
| `GET/POST` | `/api/config` | Manage library definitions and exclusions. |
| `GET` | `/api/health` | Report DB connectivity and last scan time. |

---

## Frontend Overview
- **Framework:** Next.js (App Router) with React Server Components for initial data fetch.
- **Styling:** Tailwind CSS + CSS variables for theming.
- **State/Data:** React Query or SWR; keep scan status in a lightweight global store (Zustand).
- **Player:** Native `<video>` tag; optionally integrate `hls.js`/`dash.js` for adaptive formats later.
- **Key Screens:**
  - Home: highlights recent scans, missing metadata warnings.
  - Channels index/detail: pivot around `channel` table.
  - Liked videos view: filter by `media_type`.
  - Video detail: player, metadata, subtitle picker, file diagnostics.
  - Config: manage libraries, trigger scan, view logs.
  - Health overlay: show ongoing scan progress.
- Accessibility: keyboard navigation, high-contrast theme, transcripts display.

---

## Scanning & Sync Strategy (Summary)
1. Fetch library list from config.
2. For each library invoke scanner with context (type, root path).
3. Traverse directories depth-first:
   - Before descending, check for `.ignore`.
   - Identify candidate video containers via pattern match or presence of media file.
   - Collect sibling assets (thumbnail, info JSON, subtitles).
4. Build a normalized `VideoRecord`.
5. Compute `scan_hash` (e.g., SHA1 over canonical JSON payload + file mtimes).
6. Upsert into DB:
   - New video → insert + mark `first_seen_at`.
   - Existing video with changed hash → update fields + `last_scanned_at`.
   - Tracks removed videos by storing the scan job ID; records missing since last successful scan can be marked `archived`.
   - Videos lacking essential metadata set `has_complete_metadata = false` and enqueue optional API backfill.
7. Emit scan progress events for the frontend.
8. After traversal, flag DB rows not seen in current scan as `missing_on_disk = true` until reconciled.
- Support two rescan modes:
  - `full`: rebuild manifests/hashes from scratch—use sparingly for audits.
  - `incremental`: rely on directory manifests and `scan_hash` to touch only new/changed/missing entries.
  Both modes should short-circuit work when nothing changed to conserve resources.

Detailed algorithms and edge-case handling are documented in `Backend_DataGathering_Guide.md`.

---

## Implementation Roadmap
1. **Milestone 0 – Project Skeleton**
   - Initialize monorepo (e.g., Turborepo) or single Next.js app with `/api`.
   - Set up Prisma schema, migrations, and database client.
2. **Milestone 1 – Scanner MVP**
   - Implement config management and CLI command `scan`.
   - Support Case 1 folders with `info.json`.
   - Persist videos to DB; expose scan summary API.
3. **Milestone 2 – Frontend Browser**
   - Basic pages for videos list, channel list, and playback.
   - Streaming endpoint to serve video files.
4. **Milestone 3 – Resilience & Edge Cases**
   - Handle Case 2 loose files.
   - Implement `.ignore`, duplicate ID resolution, missing asset flags.
   - Add liked videos filtering and UI cues.
   - Record media resolution/codec and populate `has_complete_metadata`.
5. **Milestone 4 – Quality of Life**
   - Full-text search, tagging filters, watch progress.
   - Scheduled scans, notifications.
   - Optional YouTube Data API backfill for incomplete metadata (configurable API key).

---

## Observability & Tooling
- Logging levels: `info` (scan start/stop), `debug` (per video), `warn` (missing assets), `error` (unreadable path).
- Optional metrics endpoint exporting scan durations, video counts.
- CLI utilities:
  - `yab scan --library <path>`
  - `yab resync --video <id>`
  - `yab doctor` to validate config and DB migrations.

---

## Future Enhancements
- Offline transcript search via SQLite FTS5.
- Auto-regenerate thumbnails when missing.
- Import/export playlists via CSV/JSON.
- Cross-device streaming with DLNA or Jellyfin integration.
- Background transcription or speech-to-text for search.
- User accounts with per-user watch history.

---

## Licensing & Usage Notes
- Intended strictly for privately archived content.
- Ensure downloads comply with YouTube Terms of Service and local laws.
