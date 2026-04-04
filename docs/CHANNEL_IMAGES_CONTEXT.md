# Channel Images Feature - Context & Decisions

## Status
Planned, not yet implemented. Full implementation plan: `CHANNEL_IMAGES_PLAN.md`

## Key Decisions

- **Storage**: Reuse the existing thumbnails volume (`.thumbnails/channels/{uploaderId}/`). No new Docker volume needed.
- **Minimum video threshold**: Only channels with >= 5 videos get images downloaded. Filters out one-off channels from liked videos libraries.
- **yt-dlp command**: `yt-dlp --playlist-items 0 --skip-download --write-all-thumbnails "https://www.youtube.com/channel/{uploaderId}"`
- **Files we care about**: Match `*.avatar_uncropped.*` and `*.banner_uncropped.*` from the yt-dlp output. All other numbered thumbnails (0.jpg, 1.jpg, etc.) should be cleaned up.
- **Preserve original image format**: Store whatever extension yt-dlp gives us (`jpg`, `png`, `webp`, etc.) instead of converting everything to jpg.
- **DB changes**: Two new fields on the `channel` model — `avatarPath` and `bannerPath`. Existing `thumbnailPath` stays for backwards compat.
- **Migration path**: Use both a Prisma migration and a startup safety migration so Docker upgrades and older local/dev SQLite DBs both work cleanly.
- **V1 rerun policy**: Fill missing only. If a qualifying channel already has both images, skip it. No refresh/versioning in V1.
- **Trigger**: New section on the Config page. User clicks a button to start downloading images for all qualifying channels.

## Why

Current channel image detection is passive and inconsistent — it relies on whatever image files happen to exist in the library directories during scanning. File naming patterns vary. There's no distinction between avatar and banner (single `thumbnailPath` field). We want to actively fetch proper avatars and banners from YouTube.

## Files to Create
- `backend/src/services/channel-image-downloader.ts` — download logic
- `frontend/src/components/ChannelImageManager.tsx` — config UI component

## Files to Modify
- `backend/prisma/schema.prisma` — add `avatarPath`, `bannerPath` to channel model
- `backend/src/services/migration-service.ts` — startup safety migration for older DBs
- `backend/src/routes/config.ts` — download trigger + status endpoints
- `backend/src/routes/library.ts` — serve avatar/banner images
- `backend/src/types/index.ts` — update types
- `frontend/src/pages/ConfigurePage.tsx` — add new section
- `frontend/src/pages/ChannelsPage.tsx` — use new avatar
- `frontend/src/pages/ChannelVideosPage.tsx` — display banner
- `frontend/src/pages/WatchPage.tsx` — use new avatar endpoint
- `frontend/src/pages/SearchPage.tsx` — use new avatar endpoint
- `frontend/src/components/SearchInput.tsx` — use new avatar endpoint
- `frontend/src/lib/api.ts` — add helper functions
- `frontend/src/types/index.ts` — update Channel type
