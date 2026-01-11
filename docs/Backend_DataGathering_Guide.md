# Backend & Data Gathering Implementation Guide

This guide details the backend ingest pipeline responsible for translating a filesystem of archived YouTube media into structured database records. It complements the high-level product specification in `YouTubeArchiveBrowser_Spec.md` and should guide a solution that remains simple, predictable, and free from unnecessary abstraction.

---

## Goals
- **Reliable scans** from user-registered root folders with minimal configuration.
- **Deterministic metadata** derived from local files; never fetch from the network.
- **Incremental updates** that reconcile the database with filesystem changes.
- **Extensible architecture** that can add new asset and library types without rewriting the scanner.
- **Simplicity first**—prefer straightforward data structures and small modules unless complexity is justified by clear requirements.

---

## Key Components
| Component | Responsibility |
|-----------|----------------|
| `ConfigService` | Read/write library config (JSON/YAML). Validates existence and permissions of root folders. |
| `ScanOrchestrator` | Coordinates scan jobs, maintains run state, throttles concurrency. |
| `LibraryWalker` | Recursively traverses a single library root, yielding candidate video containers. |
| `ContainerAnalyzer` | Given a directory (or loose file), detects video assets, metadata, and anomalies. |
| `MetadataNormalizer` | Produces canonical `VideoRecord` objects and completeness flags. |
| `PersistenceService` | Upserts videos/subtitles/channels, records scan logs, marks removed assets. |
| `MetadataBackfillQueue` (optional) | Queues YouTube API lookups for records missing critical metadata. |
| `EventBus` | Emits scan progress to REST API / WebSocket consumers. |

Each component should have a thin, synchronous API but can internally use async/await for filesystem and database operations.

---

## Configuration Schema
```json5
{
  "libraries": [
    {
      "path": "/Users/fahim/codes/projects/yui/downloads",
      "mediaType": "channel_archive",
      "name": "Default Channel Archive"
    },
    {
      "path": "/Users/fahim/codes/projects/yui/downloads/Liked",
      "mediaType": "liked_videos",
      "name": "Liked Videos"
    }
  ],
  "excludeGlobs": ["**/tmp/**"],
  "parallelism": 4,
  "followSymlinks": false
}
```
- Validate on load: paths must exist, be directories, and be readable.
- Resolve paths to absolute form to avoid duplicate entries.
- `parallelism` determines the number of directories processed concurrently.

---

## Scan Pipeline Overview
1. **Job creation**
   - User triggers via API or CLI; orchestrator records `scan_log` entry (`status = running`).
   - Load config, snapshot DB schema version.
2. **Library iteration**
   - For each library, instantiate a `LibraryWalker`.
   - Walker emits either `DirectoryCandidate` or `LooseFileCandidate`.
3. **Container analysis**
   - Analyzer classifies candidate into `VideoContainer` or `IgnoredEntry`.
   - Attach context: library type, root slug, relative path.
4. **Metadata normalization**
   - Combine info from files, filenames, and prior DB record.
   - Generate deterministic `scan_hash`.
5. **Persistence**
   - Upsert video/subtitles; update channel stats and `has_complete_metadata`.
   - Track seen IDs in-memory to detect duplicates and removals.
   - If `has_complete_metadata` is false and an API key exists, enqueue a metadata backfill task (rate-limited, runs post-scan).
6. **Completion**
   - Mark unseen videos as `missing_on_disk`.
   - Finalize `scan_log` with counts and errors.
   - Emit completion event.

---

## Directory Classification Algorithm
Use a queue-based depth-first traversal to minimize open file descriptors on large trees.

```ts
async function* walkLibrary(root: string): AsyncGenerator<Candidate> {
  const stack = [root];
  while (stack.length) {
    const current = stack.pop()!;
    if (await hasIgnoreMarker(current)) continue;
    const entries = await fs.promises.readdir(current, { withFileTypes: true });
    const files = entries.filter(e => e.isFile());
    const dirs = entries.filter(e => e.isDirectory());

    const hasMedia = files.some(f => isMediaFile(f.name));
    const youtubeIds = extractYoutubeIds(files.map(f => f.name).concat(path.basename(current)));

    if (hasMedia || youtubeIds.size === 1) {
      yield { kind: "directory", path: current, youtubeIds };
    }

    for (const dir of dirs) stack.push(path.join(current, dir.name));
    if (!hasMedia && youtubeIds.size === 0) {
      // still descend; might be channel > video > assets.
    }
  }
}
```

### Ignore Detection
- `hasIgnoreMarker(dir)` returns true if `.ignore` exists directly inside `dir`.
- Do not propagate ignore markers upward; only the containing directory is skipped.
- Cache results per directory to avoid redundant disk reads.

### Media File Detection
- Recognize extensions: `.mp4`, `.mkv`, `.webm`, `.m4v`, `.m4a`, `.mp3` (future).
- Guard against double extensions (e.g., `.mkv.part`); require exact match.
- `extractYoutubeIds` uses regex to match `[A-Za-z0-9_-]{11}`.

---

## Handling Canonical Video Folders (Case 1)
1. Identify `.info.json` file; parse JSON with streaming parser (`jsonc-parser` or native) to avoid loading huge descriptions into memory unnecessarily.
2. Collect companion files by stem matching (same prefix before extension).
3. Choose primary media file by preference order (`.mp4`, `.mkv`, `.webm`, `.m4a`).
4. Gather subtitles and thumbnails into arrays.
5. When channel metadata files exist at higher levels (e.g., `NA - Danny Gonzalez - Videos [...].info.json`), parse once and cache per channel key `uploader_id`.
6. Build `VideoRecord`:
   - Use info JSON fields when present.
   - Validate `video_id` matches folder suffix and file stems; log mismatch.
   - Compute `filesize_bytes` via `stat`.
7. Emit warnings for missing expected assets (no thumbnail, no info JSON, etc.).

---

## Handling Loose Files (Case 2)
1. Analyzer receives either a directory with mixed files or a single file.
2. Extract candidate ID from filename; if none found, mark as `IgnoredEntry` with reason `missing_video_id`.
3. Group files by extracted ID within the directory.
4. For each group:
   - Determine common stem (strip leading date/time tokens and separators like `" - "`).
   - Attempt to locate adjacent `*.info.json` or subtitle files; allow out-of-order stems.
   - If only media exists, fallback metadata:
     ```ts
     {
       title: inferredTitle(filename),
       upload_date: inferredDate(filename) ?? null,
       uploader: parentFolderName,
       metadata_source: "filename"
     }
     ```
   - Create synthetic container path (either the file path or a generated virtual folder).
5. Persist same as Case 1, but flag `metadata_source = "filename"` so UI can surface lower confidence.

---

## Metadata Normalization Pseudocode
```ts
function buildVideoRecord(ctx: ContainerContext): VideoRecord {
  const info = ctx.infoJson ?? {};
  const fallback = parseFromName(ctx.primaryStem);
  const mediaProbe = ctx.mediaProbe ?? {};
  const base: VideoRecord = {
    video_id: selectVideoId(ctx),
    title: info.title ?? fallback.title,
    uploader: info.uploader ?? ctx.channel?.name ?? fallback.uploader,
    uploader_id: info.channel_id ?? ctx.channel?.id ?? null,
    upload_date: normalizeDate(info.upload_date ?? fallback.upload_date),
    duration_seconds: info.duration ?? null,
    filesize_bytes: ctx.primaryFile?.stat.size ?? null,
    description: info.description ?? null,
    tags: info.tags ?? [],
    subtitle_tracks: ctx.subtitles.map(toSubtitleDescriptor),
    media_type: ctx.library.mediaType,
    library_path: ctx.library.path,
    video_path: ctx.primaryFile?.path ?? ctx.containerPath,
    audio_path: ctx.audioFile?.path ?? null,
    thumbnail_path: ctx.thumbnail?.path ?? null,
    resolution: mediaProbe.resolution ?? info.resolution ?? null,
    video_codec: mediaProbe.videoCodec ?? info.vcodec ?? null,
    audio_codec: mediaProbe.audioCodec ?? info.acodec ?? null,
    metadata_source: ctx.infoJson ? "info_json" : (ctx.priorRecord ? "database" : "filename"),
    has_complete_metadata: determineCompleteness({
      info,
      fallback,
      thumbnailPath: ctx.thumbnail?.path,
      mediaProbe
    }),
    scan_hash: computeScanHash(ctx),
    first_seen_at: ctx.priorRecord?.first_seen_at ?? nowISO(),
    last_scanned_at: nowISO()
  };
  return base;
}
```
- `computeScanHash` should include file paths, mtimes (or checksums), and metadata fields that affect UI. Example: `sha1(JSON.stringify({ video_id, video_path, infoMtime, fileSize, metadataSource, resolution, videoCodec }))`.
- `determineCompleteness` returns true when `title`, `uploader`, `upload_date`, `duration_seconds`, and either a thumbnail or resolution metadata are present without calling external services.
- If parsing fails (invalid JSON), fallback to filename and record an error entry referencing the file path. Mark `has_complete_metadata = false` in that scenario.

### Media Probe
- Invoke `ffprobe` (or similar) only when a media file is new or its mtime/size changed compared to the last scan.
- Cache probe results in the database so reruns can skip work.
- Limit concurrent probes (e.g., max 2) to avoid saturating I/O on large files.

### Metadata Backfill
- After the scan, a scheduler pulls queued YouTube IDs lacking complete metadata.
- Use the YouTube Data API (if configured) to fetch title, uploader, duration, and thumbnails.
- Apply updates only when local data is missing to preserve offline-first behavior.
- Respect rate limits by spacing requests and persisting last fetch timestamps.

---

## Database Persistence Flow
1. Look up existing record by `video_id`.
2. If not found → insert video, related subtitles, ensure channel row exists.
3. If found → compare `scan_hash`:
   - Same hash → update only `last_scanned_at` and, if needed, `filesize_bytes`; skip media probe reruns.
   - Different hash → update changed fields (including resolution/codec/completeness), replace subtitle rows.
4. Track `seenVideoIds` per scan job; after library traversal, mark unseen videos as `missing_on_disk = true` (add boolean column or separate table).
5. Channel aggregation:
   - Count videos per uploader.
   - Derive latest upload date.
   - Cache description and thumbnail path from channel-level info JSON if available.
6. Persist `has_complete_metadata` and enqueue IDs needing API backfill.

---

## Incremental Scan Strategy
- Each `scan_log` row stores `started_at`, `ended_at`, `videos_scanned`, `errors`, `library_path`.
- Support two scan modes:
  - `full`: rebuild directory manifests, recompute hashes, and re-run probes; use sparingly for audits.
  - `incremental`: reuse prior manifests/hashes to touch only new, changed, or missing entries.
- When a user requests an incremental scan, use prior `scan_hash` to skip directories whose contents are unchanged:
  - Maintain `directory_manifest` table keyed by absolute path with `content_hash` (e.g., hash of filenames + mtimes).
  - Before analyzing, compare stored hash; skip if equal.
- Provide CLI options:
  - `--force` to ignore manifests.
  - `--deep <level>` to limit traversal depth for quick audits.
- On completion, prune `missing_on_disk` videos older than configurable threshold or surface them in UI.

---

## Error Handling & Logging
- Distinguish between recoverable and fatal errors:
  - Recoverable: unreadable file, JSON parse errors, duplicate IDs. Log as `warn` and keep scanning.
  - Fatal: root path unavailable, database write failure. Abort scan, set `scan_log.status = failed`.
- Store structured error entries `{ level, message, path, video_id?, stack }`.
- Forward error summaries to frontend via `/api/scans/latest`.

---

## Testing Strategy
- **Unit tests** for helpers (`extractYoutubeIds`, `parseFromName`, hash builder).
- **Integration tests** using temporary directories mirroring:
  - Canonical channel folder (`downloads/Danny Gonzalez/...`).
  - Liked videos with mixed stems.
  - `random` folder with loose files.
  - `.ignore` directories to ensure skip behavior.
- **Property tests** for filename parser to guarantee it never fabricates invalid IDs.
- Provide fixture generator `test/fixtures/buildSampleArchive.ts` to assemble known directory layouts for CI.

---

## Future Extensions
- Hook into filesystem watchers (chokidar) for near-real-time updates.
- Support additional metadata sources (`ytarchive` XML, sponsorblock JSON).
- Add checksum validation to detect corrupted files.
- Pluggable analyzers per library type (e.g., podcasts vs. shorts).

---

Implementing the ingest pipeline with these guidelines ensures the backend can scale with diverse archive structures while keeping the database consistent and auditable.
