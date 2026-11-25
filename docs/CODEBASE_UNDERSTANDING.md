# YUI Codebase Understanding

This document maps the current implementation as it exists in code, not the older planned architecture described in several legacy docs. Use this before adding features.

## Read This First

- The live stack is `Fastify + Prisma + SQLite` in `backend/` and `Vite + React + React Router` in `frontend/`.
- Several older docs still describe a planned `Next.js` frontend, milestone checklists, or fields that no longer exist. Treat the code as source of truth.
- Check `git status --short` before editing. The repo may contain local in-progress work.
- Verification for this note was mostly static inspection plus git history review. Full builds/tests were not runnable in this shell because `pnpm` was unavailable here, `backend/node_modules` and `frontend/node_modules` were absent, and the sandbox could not reach the npm registry.

## Which Docs Are Trustworthy

Mostly useful:

- `docs/CODEBASE_UNDERSTANDING.md` (this file)
- `docs/CHANNEL_IMAGES_PLAN.md` for why the avatar/banner system looks the way it does
- `docs/Backend_DataGathering_Guide.md` for scanner intent and ingest edge cases

Useful as historical context, but stale in important ways:

- `README.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/TODO.md`
- `docs/YouTubeArchiveBrowser_Spec.md`
- `docs/SEARCH_IMPLEMENTATION.md`
- `backend/src/test/API_TESTING.md`
- `docs/CHANNEL_IMAGES_CONTEXT.md` says "planned" even though the feature is already shipped

Common stale themes:

- They describe a planned `Next.js` frontend instead of the current Vite app.
- They mention milestones for features that already exist: streaming, watch progress, search, auth, thumbnails, channel images.
- Some still mention the removed `generated_thumbnail` field.

## Top-Level Layout

```text
yui/
  backend/
    prisma/                  Prisma schema + SQL migrations
    src/
      index.ts               Fastify bootstrap
      routes/                HTTP surface
      services/              Scanner, ingest, search, thumbnails, metadata fetch
      lib/                   Config, auth, DB singleton, in-memory job state
      test/                  Old scripts, not a reliable automated test suite
  frontend/
    src/
      App.tsx                Router + auth gate
      pages/                 Route-level screens
      components/            UI building blocks
      lib/api.ts             Frontend API client
  Dockerfile
  docker-compose.yml
  docker-entrypoint.sh
  Makefile
```

## Runtime Architecture

### Backend bootstrap

`backend/src/index.ts` is the real entrypoint.

Startup flow:

1. Create Fastify instance with pretty logging.
2. Register CORS for `http://localhost:3000`.
3. Install the global auth hook.
4. Register all API route groups.
5. Register the static frontend if `frontend/dist` exists.
6. Run `MigrationService.runMigrations()` before listening.
7. Listen on port `3001`.

### Route groups

- `/api/auth` - password gate, token session lifecycle
- `/api/scan` - scan trigger + current status + history
- `/api/config` - config file writes, liked-order import, channel image job
- `/api/videos` - generic video list, single video, summary stats
- `/api/library` - homepage feed, channels, liked videos, related/navigation
- `/api/stream` - video streaming and thumbnail serving
- `/api/progress` - watch progress CRUD
- `/api/metadata` - missing metadata stats + yt-dlp metadata fetch job
- `/api/danger` - destructive reset helpers
- `/api/search` - FTS-backed autocomplete and full search

### Frontend bootstrap

`frontend/src/App.tsx` wraps the app in:

- `BrowserRouter`
- `AuthGate`
- `Layout`

Routes:

- `/` -> `HomePage`
- `/channels` -> `ChannelsPage`
- `/channels/:uploaderId` -> `ChannelVideosPage`
- `/liked` -> `LikedVideosPage`
- `/search` -> `SearchPage`
- `/watch/:videoId` -> `WatchPage`
- `/configure` -> `ConfigurePage`

## Config, Paths, and Environment

This repo has some path semantics that are easy to misunderstand.

### Config path

`backend/src/lib/config.ts` resolves config like this:

- If `CONFIG_PATH` is set: use that exact path.
- Otherwise: `resolve(process.cwd(), "./config.json")`.

Implication:

- In local dev, the documented workflow is `cd backend && pnpm dev`.
- That means the default config file is `backend/config.json`, not repo-root `config.json`.
- Several docs still claim config lives in the project root. That is stale for the documented local dev workflow.

### Database URL

Important drift:

- Prisma reads `DATABASE_URL` from the environment (`schema.prisma` + `prisma.config.ts`).
- The `databaseUrl` field in the JSON config is validated and exposed to the UI, but it is not the runtime source of truth for Prisma.
- Treat `databaseUrl` in config as legacy or informational unless the code is refactored to actually wire it into Prisma.

### Relative output directories

`thumbnailDir` and `metadataDir` are usually resolved relative to `process.cwd()`:

- Scan pipeline thumbnail generation: `join(process.cwd(), config.thumbnailDir)`
- Scan pipeline metadata fetch: `join(process.cwd(), config.metadataDir)`
- Danger zone cleanup: `resolve(process.cwd(), config.thumbnailDir)` and `resolve(process.cwd(), config.metadataDir)`

In practice:

- Local dev from `backend/` means outputs live under `backend/.thumbnails` and `backend/.metadata` unless config uses absolute paths.
- Docker runs from `/app`, so the mounted paths under `/app/.thumbnails` and `/app/.metadata` line up correctly.

Small inconsistency to know about:

- `backend/src/routes/stream.ts` uses `path.join(config.thumbnailDir, ...)` for thumbnail serving instead of resolving from `process.cwd()`.
- It still works if the process cwd matches the intended root, but it is less explicit than the rest of the code.

### Auth config

Auth is enabled when either of these exists:

1. `AUTH_PASSWORD` env var
2. `config.auth.password`

If neither exists, the app is open.

## Data Model

Current Prisma models:

- `Video`
- `Subtitle`
- `Channel`
- `WatchProgress`
- `ScanLog`

### Video

Key fields beyond the obvious metadata:

- `mediaType` - currently only `channel_archive` or `liked_videos`
- `libraryPath`
- `videoPath`
- `thumbnailPath`
- `infoJsonPath`
- `hasThumbnails`
- `thumbnailSource` - `original` or `extracted`
- `hasCompleteMetadata`
- `metadataSource` - `info_json` or `filename`
- `missingOnDisk`
- `likedOrder`

### Channel

There are now three image-related fields:

- `thumbnailPath` - passive legacy image discovered during scan
- `avatarPath` - actively downloaded channel avatar
- `bannerPath` - actively downloaded channel banner

### Search tables outside Prisma

The app also maintains two SQLite FTS5 virtual tables:

- `videos_fts`
- `channels_fts`

These are created and maintained manually by `MigrationService` and `SearchService`, not by Prisma models.

## Backend Service Map

### `Scanner`

`backend/src/services/scanner.ts`

Responsibilities:

- Walk library trees with an explicit stack
- Skip directories containing `.ignore`
- Ignore dotfiles/dot-directories
- Detect canonical single-video folders
- Detect loose video groups by shared YouTube ID
- Read `overrides.txt` at channel-root level
- Collect passive channel image candidates during the same traversal

Important behavior:

- Canonical folder = directory with media files that resolve to exactly one YouTube ID.
- Loose files = multiple files in one folder grouped by `[videoId]`.
- Hidden directories are skipped because directory names starting with `.` are filtered out.
- `scanOptions.followSymlinks` exists in config/types but is not currently implemented in the scanner.

### `MetadataParser`

`backend/src/services/metadata-parser.ts`

Responsibilities:

- Find the video ID
- Prefer `*.info.json`
- Fall back to filename parsing
- Detect thumbnails and subtitles
- Read media stat and info.json in parallel
- Apply channel overrides

Completeness is currently judged from local metadata only:

- title
- uploader
- upload date
- duration
- resolution

### `DatabaseService`

`backend/src/services/database-service.ts`

Responsibilities:

- Insert/update `Video` + `Subtitle`
- Decide whether a new candidate replaces an existing one
- Mark unseen videos as `missingOnDisk`
- Update per-channel aggregates
- Maintain scan logs
- Rebuild FTS indexes

Replacement strategy:

- If `infoJsonMtime` or `mediaMtime` changed, replace.
- Otherwise keep the larger file.

Important liked-video behavior:

- Newly inserted `liked_videos` rows get `likedOrder = MAX(liked_order) + 1`.
- This makes newly discovered likes sort after historically imported ones.

### `ScanOrchestrator`

`backend/src/services/scan-orchestrator.ts`

This is the main ingest pipeline.

Flow:

1. Load config.
2. Pick all libraries or a targeted library.
3. Create a `ScanLog`.
4. Initialize `scanState`.
5. For each library:
   - skip if `library.skip`
   - run scanner
   - parse candidates in batches of 20 concurrently
   - write DB updates sequentially
6. Update channel stats.
7. Process passively collected channel thumbnails.
8. Mark unseen videos missing.
9. Rebuild FTS once.
10. Generate thumbnails if enabled.
11. Fetch missing metadata if enabled.
12. Complete the scan log.

Why it looks this way:

- `7c9f4d9` optimized the pipeline to reduce duplicate DB work and repeated traversal.
- `fdc1258` changed DB writes back to sequential to stop SQLite write contention.

Important caveat:

- `mode: "full"` and `mode: "incremental"` are accepted and logged, but there is no real manifest-based incremental short-circuit today. Both modes run through the same general scan pipeline.

Also important:

- `scanOptions.parallelism` is currently not used.

### `ThumbnailGenerator`

`backend/src/services/thumbnail-generator.ts`

Behavior:

- If an original thumbnail file exists, resize it into `thumb_small.jpg` and `thumb_large.jpg`.
- Otherwise extract a frame with `ffmpeg`.
- Stores results under `{thumbnailDir}/{videoId}/`.

### `MetadataFetcher`

`backend/src/services/metadata-fetcher.ts`

Behavior:

- Uses `yt-dlp --write-info-json --skip-download`
- Optionally `--write-thumbnail`
- Can save next to the original video (`with_video`) or under app data (`app_data`)
- Parses the resulting info JSON and returns normalized fields

This service is used both:

- manually via `/api/metadata/fetch`
- automatically after scans when `fetchMetadata` is enabled

### `SearchService`

`backend/src/services/search-service.ts`

Behavior:

- Uses SQLite FTS5, not `LIKE`
- Autocomplete searches both channels and videos
- Full search returns paginated videos and non-paginated channels
- Search query preparation tokenizes words and adds `*` prefix matching

### `ChannelImageDownloader`

`backend/src/services/channel-image-downloader.ts`

Behavior:

- Only operates on channels with `videoCount >= 5`
- Uses `yt-dlp --playlist-items 0 --skip-download --write-all-thumbnails`
- Looks for `*.avatar_uncropped.*` and `*.banner_uncropped.*`
- Stores normalized outputs under `{thumbnailDir}/channels/{uploaderId}/`
- Fill-missing-only in V1

## Deployment and Tooling Notes

### Docker

The Docker path is current and important:

- `Dockerfile` builds the frontend and backend separately, then ships a runtime image with:
  - `ffmpeg`
  - `yt-dlp`
  - `python3`
- `docker-entrypoint.sh` runs:
  1. `pnpm prisma migrate deploy`
  2. `pnpm prisma generate`
  3. `node dist/index.js`
- `docker-compose.yml` mounts:
  - `./config -> /config`
  - `./data -> /data`
  - `./thumbnails -> /app/.thumbnails`
  - `./metadata -> /app/.metadata`
  - media libraries read-only under `/media`

### Makefile

Useful targets exist, but they assume host-level `pnpm` and Docker tooling are already installed:

- `make dev`
- `make prod`
- `make logs`
- `make db-migrate`
- `make db-studio`

## Background Job Model

There are three main background-job categories:

- scan
- metadata fetch
- channel image download

They are coordinated with:

- route-local `currentScan`, `currentFetch`, `currentDownload` promises
- in-memory singletons `scanState` and `channelImageState`

Implications:

- This is single-process coordination only.
- Restarting the server loses live progress state.
- Jobs intentionally block each other.

Subtle implementation detail:

- Manual metadata fetch reuses `scanState`, including `isRunning`, even though it is not literally a library scan. Future agents should know that "scan status" can temporarily mean "metadata job status."

## Search and FTS Lifecycle

Startup:

- `MigrationService` ensures FTS tables exist.

During scans:

- The orchestrator skips per-video FTS syncs during the main ingest loop.
- It rebuilds the whole FTS index once at the end.

During targeted updates:

- `DatabaseService.updateChannelStats` syncs the affected channel.
- Passive channel thumbnail updates also sync the channel.

Why this matters:

- Search results are eventually correct after scans, but the app depends on FTS maintenance code outside Prisma.
- If search behaves strangely, inspect both the base tables and the FTS virtual tables.

## Frontend Feature Map

### Global shell

`frontend/src/components/Layout.tsx`

- brutalist black/red shell
- sticky header
- global autocomplete search
- collapsible desktop sidebar
- bottom mobile nav
- watch page hides the mobile nav and collapses the sidebar

### Auth

`frontend/src/App.tsx` + `frontend/src/pages/LoginPage.tsx`

- Calls `/api/auth/status` on load
- If auth is enabled, the UI requires a token in localStorage
- Any 401 from `lib/api.ts` clears the token and dispatches `yui:auth-expired`

### Home

`HomePage`

- latest mixed videos feed
- infinite scroll
- uses `/api/library/latest`

### Channels

`ChannelsPage`

- channel grid
- prefers the active avatar endpoint

### Channel detail

`ChannelVideosPage`

- banner header
- avatar + title block
- sort dropdown
- infinite scroll

### Liked

`LikedVideosPage`

- infinite scroll
- sort toggle for oldest/newest like order
- backed by `likedOrder`, not upload date

### Search

`SearchInput` + `SearchPage`

- debounced autocomplete in header
- full results page with channel/video split

### Watch

`WatchPage`

- `plyr-react` player
- range-streamed video from `/api/stream/:videoId`
- saves watch progress every ~5 seconds and on pause
- loads related videos + prev/next navigation

### Configure

`ConfigurePage`

Main operational dashboard containing:

- `LibraryManager`
- `ScanControls`
- `ScanProgress`
- `VideoStats`
- `ChannelImageManager`
- `MetadataManager`
- `LikedVideoOrderImport`
- hidden `DangerZone`

## Important Drift and Traps

These are the biggest implementation gotchas I found.

### 1. Frontend offers unsupported library types

`frontend/src/components/LibraryManager.tsx` lets the user choose:

- `channel_archive`
- `liked_videos`
- `watch_later`
- `playlist`

But backend config validation only accepts:

- `channel_archive`
- `liked_videos`

So the UI currently exposes two options that the backend will reject.

### 2. `databaseUrl` in config is not wired to Prisma

The UI edits it and the config schema validates it, but Prisma uses `DATABASE_URL` from env. A future feature touching storage should account for that mismatch.

### 3. Local config-path docs are misleading

Many docs say root `config.json`, but `process.cwd()` means local dev normally reads `backend/config.json`.

### 4. `incremental` mode is mostly a label today

There is no directory-manifest or hash-based skip layer like the older planning docs describe.

### 5. `parallelism` and `followSymlinks` are currently inert

They exist in config/types and older docs, but current runtime code does not use them.

### 6. Older test scripts are not a reliable test harness

Files under `backend/src/test/` import paths like `./services/scanner.js` from inside `src/test/`, which is almost certainly stale after the folder reorganization. Treat them as old ad-hoc scripts, not a maintained suite.

### 7. Some docs still refer to removed fields

Examples:

- `generated_thumbnail`
- old milestone plans
- "frontend planned"

### 8. Metadata stats and metadata fetching are slightly conflated

The metadata screen treats videos with non-original thumbnails as work items too, because the same flow also tries to upgrade extracted thumbnails by fetching original YouTube thumbnails.

## Recent Commits Worth Knowing

These commits explain most of the present shape:

- `cb08411` - search service, API, and frontend search UI
- `b163211` - auth system
- `6b23005` - infinite-scroll conversion
- `333906b` - liked video sort direction option
- `2723129` / `a23894e` - liked-order import and follow-up fixes
- `7c9f4d9` - scan pipeline performance rewrite
- `fdc1258` - sequential DB writes to avoid SQLite lockups
- `e6b294b` - safer FTS rebuild by dropping tables first
- `6750511` - active channel avatar/banner download
- `29e9943` - config page/dev-tools reorganization

## Suggested Reading Order Before Feature Work

If a future agent needs to get productive quickly, read in this order:

1. `backend/src/index.ts`
2. `backend/prisma/schema.prisma`
3. `backend/src/services/scan-orchestrator.ts`
4. `backend/src/services/scanner.ts`
5. `backend/src/services/metadata-parser.ts`
6. `backend/src/services/database-service.ts`
7. `backend/src/routes/library.ts`
8. `backend/src/routes/metadata.ts`
9. `backend/src/routes/config.ts`
10. `backend/src/services/search-service.ts`
11. `frontend/src/App.tsx`
12. `frontend/src/components/Layout.tsx`
13. `frontend/src/pages/ConfigurePage.tsx`
14. `frontend/src/pages/WatchPage.tsx`
15. `frontend/src/lib/api.ts`

## Bottom Line

YUI is already a working full-stack archive browser, not an early-stage scaffold. The current engineering center of gravity is:

- filesystem ingest
- SQLite/Prisma persistence
- FTS-backed search
- thumbnail and metadata post-processing
- a React UI that already covers the main browsing and admin flows

The main risk before adding features is not missing architecture. It is stale documentation, config-path ambiguity, and a few UI/backend drift points that can mislead the next change.
