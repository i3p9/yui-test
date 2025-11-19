# Library UI Implementation Plan

## Overview
Transform YUI into a YouTube-like video library browser with homepage, channels, liked videos, and watch page functionality. The current scanner management UI will be moved to `/configure`.

---

## 1. Backend APIs (New Routes)

### 1.1 Library Routes (`/api/library`)
- **GET /api/library/latest** - Get latest videos (all types)
  - Query params: `page`, `limit` (default: 20)
  - Returns: Videos sorted by `uploadDate` desc or `lastScannedAt` desc
  - Include thumbnail paths

- **GET /api/library/channels** - Get all channels with video counts
  - Returns: List of channels from Channel table
  - Include: uploaderId, name, thumbnailPath, videoCount, lastUploadDate

- **GET /api/library/channels/:uploaderId/videos** - Get videos for a specific channel
  - Query params: `page`, `limit`, `sort` (uploadDate/title)
  - Returns: Videos from this channel only

- **GET /api/library/liked** - Get liked videos
  - Query params: `page`, `limit`
  - Filter: `mediaType = 'liked_videos'`
  - Returns: Liked videos sorted by uploadDate desc

- **GET /api/library/video/:videoId/related** - Get related videos
  - For channel videos: Return other videos from same channel
  - For liked videos: Return other liked videos
  - Query params: `limit` (default: 20)
  - Exclude current video from results

- **GET /api/library/video/:videoId/navigation** - Get prev/next video
  - For channel videos: prev/next within same channel (by uploadDate)
  - For liked videos: prev/next within liked videos
  - Returns: `{ prev: Video | null, next: Video | null }`

### 1.2 Streaming Route (`/api/stream`)
- **GET /api/stream/:videoId** - Stream video file
  - Support range requests for seeking
  - Return proper Content-Type headers
  - Stream from `videoPath` in database

- **GET /api/thumbnails/:filename** - Serve thumbnail images
  - Stream from configured thumbnail directory
  - Support both original and generated thumbnails

### 1.3 Watch Progress Routes (`/api/progress`)
- **POST /api/progress/:videoId** - Update watch progress
  - Body: `{ positionSeconds, durationSeconds }`
  - Upsert WatchProgress record
  - Mark completed if >95% watched

- **GET /api/progress/:videoId** - Get watch progress
  - Returns current position or null

---

## 2. Frontend Routes & Components

### 2.1 Routing Setup
Add `react-router-dom` to handle navigation:
- `/` - Homepage (Latest Videos)
- `/channels` - Channels List
- `/channels/:uploaderId` - Channel Videos
- `/liked` - Liked Videos
- `/watch/:videoId` - Watch Page
- `/configure` - Scanner Management (current UI)

### 2.2 Layout Component
**`src/components/Layout.tsx`**
- YouTube-like header with logo and search (search can be placeholder for now)
- Sidebar with navigation:
  - Home (Latest)
  - Channels
  - Liked Videos
  - Settings (link to /configure)
- Main content area

### 2.3 Homepage Component
**`src/pages/HomePage.tsx`**
- Display latest videos in grid (4 columns on desktop, responsive)
- Video thumbnail card component:
  - Thumbnail image
  - Title
  - Uploader name
  - Upload date
  - Duration badge
  - Watch progress indicator (if exists)
- Infinite scroll or pagination
- Click video → navigate to `/watch/:videoId`

### 2.4 Channels Page
**`src/pages/ChannelsPage.tsx`**
- Grid of channel cards
- Each card shows:
  - Channel thumbnail/avatar
  - Channel name
  - Video count
  - Last upload date
- Click → navigate to `/channels/:uploaderId`

### 2.5 Channel Videos Page
**`src/pages/ChannelVideosPage.tsx`**
- Channel header with name and stats
- Video grid (same as homepage)
- Sort options: Latest, Title A-Z
- Filter videos from this channel only

### 2.6 Liked Videos Page
**`src/pages/LikedVideosPage.tsx`**
- Similar to homepage but filtered to liked_videos only
- Video grid layout
- Sorted by upload date

### 2.7 Watch Page
**`src/pages/WatchPage.tsx`**
- **Layout**: Video player (left/main), Related sidebar (right)
- **Video Player**:
  - HTML5 `<video>` element with controls
  - Source: `/api/stream/:videoId`
  - Track watch progress (every 5 seconds)
  - Save progress on pause/unmount
  - Resume from saved position on load
  - Prev/Next buttons below player
- **Video Info Section** (below player):
  - Title
  - Uploader
  - Upload date
  - Description (expandable)
  - View count (if available)
- **Related Videos Sidebar**:
  - If from channel: Show other videos from same channel
  - If from liked: Show other liked videos
  - Vertical list with small thumbnails
  - Click → navigate to that video's watch page
- **Navigation**:
  - Previous/Next buttons based on context
  - Use `/api/library/video/:videoId/navigation` endpoint

### 2.8 Configure Page (existing UI)
**`src/pages/ConfigurePage.tsx`**
- Move all existing scanner management components here:
  - LibraryManager
  - ScanControls
  - ScanProgress
  - ScanHistory
  - VideoStats
- Accessible via gear icon in sidebar

### 2.9 Shared Components
**`src/components/VideoCard.tsx`**
- Reusable video thumbnail card
- Props: video data, onClick handler
- Display: thumbnail, title, uploader, duration, progress bar

**`src/components/VideoGrid.tsx`**
- Reusable grid container for video cards
- Responsive columns (1/2/3/4 based on screen size)

**`src/components/VideoPlayer.tsx`**
- Video player with controls
- Progress tracking
- Range request support

---

## 3. API Client Updates

### `src/lib/api.ts`
Add new API functions:
```typescript
// Library APIs
fetchLatestVideos(page, limit)
fetchChannels()
fetchChannelVideos(uploaderId, page, limit, sort)
fetchLikedVideos(page, limit)
fetchRelatedVideos(videoId, limit)
fetchVideoNavigation(videoId)

// Streaming
getStreamUrl(videoId)
getThumbnailUrl(filename)

// Progress
updateWatchProgress(videoId, position, duration)
getWatchProgress(videoId)
```

---

## 4. Type Definitions

### Update `src/types/index.ts`
```typescript
interface Channel {
  uploaderId: string
  name: string
  description?: string
  thumbnailPath?: string
  videoCount: number
  lastUploadDate?: string
  lastScannedAt: string
}

interface VideoNavigation {
  prev: Video | null
  next: Video | null
}

interface WatchProgressData {
  videoId: string
  positionSeconds: number
  durationSeconds?: number
  lastWatchedAt: string
  completed: boolean
}
```

---

## 5. Styling & UI

### YouTube-like Design Elements
- Dark theme (bg-gray-900, bg-gray-800)
- Red accent color for branding (#FF0000 or similar)
- Video cards with hover effects
- Thumbnail aspect ratio: 16:9
- Duration badges on thumbnails (bottom-right)
- Progress bars (red, bottom of thumbnail)
- Responsive grid layouts
- Smooth transitions

---

## 6. Implementation Order

### Phase 1: Backend APIs
1. Create `/api/library` routes
2. Create `/api/stream` route for video streaming
3. Create `/api/progress` routes
4. Test all endpoints

### Phase 2: Frontend Routing & Layout
1. Install `react-router-dom`
2. Create Layout component with sidebar
3. Set up routes in App.tsx
4. Move existing UI to `/configure` route

### Phase 3: Core Pages
1. Create HomePage with latest videos
2. Create VideoCard and VideoGrid components
3. Create ChannelsPage
4. Create ChannelVideosPage
5. Create LikedVideosPage

### Phase 4: Watch Page
1. Create WatchPage layout
2. Implement VideoPlayer component with progress tracking
3. Add related videos sidebar
4. Implement prev/next navigation
5. Wire up watch progress API

### Phase 5: Polish
1. Loading states
2. Error handling
3. Empty states (no videos, no channels)
4. Responsive design refinements
5. Thumbnail lazy loading
6. Infinite scroll or pagination

---

## 7. Key Features Checklist

- [ ] Backend: Latest videos API
- [ ] Backend: Channels list API
- [ ] Backend: Channel videos API
- [ ] Backend: Liked videos API
- [ ] Backend: Video streaming endpoint
- [ ] Backend: Thumbnail serving
- [ ] Backend: Watch progress APIs
- [ ] Backend: Video navigation (prev/next)
- [ ] Frontend: React Router setup
- [ ] Frontend: Layout with sidebar
- [ ] Frontend: Homepage with video grid
- [ ] Frontend: Channels page
- [ ] Frontend: Channel videos page
- [ ] Frontend: Liked videos page
- [ ] Frontend: Watch page with player
- [ ] Frontend: Related videos sidebar
- [ ] Frontend: Prev/Next navigation
- [ ] Frontend: Watch progress tracking
- [ ] Frontend: Move scanner UI to /configure
- [ ] Frontend: YouTube-like styling
- [ ] Frontend: Responsive design
- [ ] Frontend: Loading & error states

---

## 8. Technical Considerations

### Video Streaming
- Use HTTP range requests for seeking support
- Proper MIME type detection based on file extension
- Handle large files efficiently (stream, don't load into memory)

### Performance
- Pagination for video lists (20-50 per page)
- Lazy load thumbnails
- Cache channel data on frontend
- Index database queries properly (already done in schema)

### User Experience
- Resume playback from last position
- Mark videos as watched (>95% completion)
- Smooth navigation between videos
- Keyboard shortcuts (space for play/pause, arrow keys for seek)
- Fullscreen support

---

## 9. Future Enhancements (Out of Scope for Now)
- Search functionality
- Playlists
- Video ratings/favorites
- Comments (if archived)
- Subtitle support in player
- Playback speed controls
- Theater mode / fullscreen
- Queue/Up Next feature
- Channel sorting/filtering
