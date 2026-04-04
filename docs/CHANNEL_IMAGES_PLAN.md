# Channel Images & Banners - Implementation Plan

## Problem

Channel images (avatars and banners) are currently discovered passively during library scanning by matching filename patterns in the directory tree. This is inconsistent - it depends on what yt-dlp happened to download alongside videos, and there's only a single `thumbnailPath` field on the channel model with no distinction between avatar and banner.

## Goal

Actively download channel avatars and banners using yt-dlp, store them in a known location, and serve them properly on the frontend with separate avatar and banner images per channel.

## How yt-dlp Channel Image Download Works

```bash
yt-dlp --playlist-items 0 --skip-download --write-all-thumbnails "https://www.youtube.com/channel/UC..."
```

This downloads multiple thumbnail files. The two we care about:
- `Channel Name [UC...].avatar_uncropped.jpg` - channel avatar/profile picture
- `Channel Name [UC...].banner_uncropped.jpg` - channel banner/header image

Empirical note: current probes also produce numbered extras like `.0.jpg`, `.1.jpg`, `.2.jpg`, `.3.jpg`, `.4.jpg`, `.5.jpg`, `.7.jpg`, which should be discarded.

## Constraints

- **Minimum video threshold**: Only download images for channels with `videoCount >= 5`. This filters out noise from liked videos libraries where there may be thousands of one-off channels.
- Channels need a YouTube URL to download from. We can construct this from the `uploaderId` (the UC... channel ID): `https://www.youtube.com/channel/{uploaderId}`

## Implementation

### 1. Database Schema Changes

**File**: `backend/prisma/schema.prisma` - `channel` model

Add two new fields:
```prisma
avatarPath    String?
bannerPath    String?
```

The existing `thumbnailPath` field can remain for backwards compatibility (it's used by the current passive detection system). Over time, the frontend should prefer `avatarPath` over `thumbnailPath` for the avatar.

Run a normal Prisma migration after the schema change, and keep a startup safety migration in `MigrationService` so older local/dev SQLite databases can still boot even if Prisma migrations were not applied manually.

### 2. Storage Location

Reuse the existing thumbnails volume (already mounted in Docker as `./thumbnails:/app/.thumbnails`) to avoid adding a new volume. Store channel images in a `channels/` subdirectory:
```
{config.thumbnailDir}/channels/{uploaderId}/avatar.<ext>
{config.thumbnailDir}/channels/{uploaderId}/banner.<ext>
```

In Docker, this resolves to `/app/.thumbnails/channels/{uploaderId}/avatar.<ext>` etc.

This gives us a predictable, consistent path structure rather than relying on yt-dlp's naming. Preserve the original file extension returned by yt-dlp instead of converting formats in V1.

### 3. Backend Service: `ChannelImageDownloader`

**New file**: `backend/src/services/channel-image-downloader.ts`

Responsibilities:
- Query all qualifying channels with `videoCount >= 5`
- For each qualifying channel, run:
  ```bash
  yt-dlp --playlist-items 0 --skip-download --write-all-thumbnails "https://www.youtube.com/channel/{uploaderId}"
  ```
- Parse the output directory for `*.avatar_uncropped.*` and `*.banner_uncropped.*` files
- Move/rename them to the standard storage location
- Clean up the other downloaded files (numbered thumbnails we don't need)
- Update the channel DB record with `avatarPath` and `bannerPath`

Key considerations:
- Run yt-dlp in a temp directory to avoid polluting the library
- Process channels sequentially or with limited concurrency to avoid hammering YouTube
- Track progress for the frontend (similar to how scan progress works)
- **V1 rerun policy**: fill missing only. Skip channels that already have both avatar and banner downloaded. Do not refresh or archive changed images in V1.

### 4. Backend API Endpoints

**File**: `backend/src/routes/config.ts` (or new route file)

New endpoints:
- `POST /api/config/channel-images/download` - Trigger channel image download for all qualifying channels
- `GET /api/config/channel-images/status` - Get download progress (running, completed, counts)

**File**: `backend/src/routes/library.ts`

Update or add endpoints:
- `GET /api/library/channels/:uploaderId/avatar` - Serve the avatar image
- `GET /api/library/channels/:uploaderId/banner` - Serve the banner image

The existing `/thumbnail` endpoint can fall back to `avatarPath` if `thumbnailPath` is not set.
The new `/avatar` endpoint should prefer `avatarPath` and fall back to legacy `thumbnailPath`.

### 5. Frontend Config Section

**New component**: `frontend/src/components/ChannelImageManager.tsx`

Add to the Configure page (`ConfigurePage.tsx`) as a new section between existing sections.

UI:
- Section title: "Channel Images"
- Description: explains what this does and the minimum 5 video threshold
- "Download Channel Images" button
- Progress indicator when running (channels processed / total qualifying)
- Status message when complete (X avatars downloaded, X banners downloaded)
- Explicit copy that V1 is fill-missing-only, not refresh/versioning

### 6. Frontend Channel Page Updates

**File**: `frontend/src/pages/ChannelVideosPage.tsx`
- Display banner image at the top of the channel page (full-width header)
- Display avatar alongside channel name

**File**: `frontend/src/pages/ChannelsPage.tsx`
- Use the new avatar endpoint instead of the generic thumbnail endpoint

**Files**: `frontend/src/pages/SearchPage.tsx`, `frontend/src/components/SearchInput.tsx`, `frontend/src/pages/WatchPage.tsx`
- Use the new avatar endpoint anywhere a channel avatar appears

**File**: `frontend/src/lib/api.ts`
- Add helper functions: `getChannelAvatarUrl(uploaderId)`, `getChannelBannerUrl(uploaderId)`

### 7. Frontend Types

**File**: `frontend/src/types/index.ts`

Update Channel interface to include `avatarPath` and `bannerPath` (or just boolean flags like `hasAvatar`, `hasBanner`).

## Implementation Order

1. Database schema migration (add `avatarPath`, `bannerPath`)
2. Backend service (`ChannelImageDownloader`)
3. Backend API endpoints (trigger download + serve images)
4. Frontend config section (trigger + progress)
5. Frontend channel page updates (display avatar + banner)

## Files to Modify

### Backend
- `backend/prisma/schema.prisma` - add fields to channel model
- `backend/src/services/channel-image-downloader.ts` - **new** - download logic
- `backend/src/routes/config.ts` - add download trigger/status endpoints
- `backend/src/routes/library.ts` - add/update avatar and banner serving endpoints
- `backend/src/types/index.ts` - update types if needed

### Frontend
- `frontend/src/components/ChannelImageManager.tsx` - **new** - config UI
- `frontend/src/pages/ConfigurePage.tsx` - add new section
- `frontend/src/pages/ChannelsPage.tsx` - use new avatar
- `frontend/src/pages/ChannelVideosPage.tsx` - add banner display
- `frontend/src/lib/api.ts` - add helper functions
- `frontend/src/types/index.ts` - update Channel type
