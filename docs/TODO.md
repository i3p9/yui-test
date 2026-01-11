# YUI - YouTube Archive Browser TODO

## Current Status
**Last Updated:** 2025-01-11  
**Current Milestone:** Post-Milestone 2.5 (Scanner + REST API + Channel Images)

---

## ✅ Completed Features

### Backend Core
- [x] Fastify server with TypeScript
- [x] SQLite database with Prisma ORM
- [x] Video scanning (canonical folders + loose files)
- [x] Metadata parsing (info.json + filename fallback)
- [x] Change detection using file mtimes
- [x] Duplicate video handling (keep larger file)
- [x] Channel statistics aggregation
- [x] Real-time scan progress tracking
- [x] **Channel image detection and serving** ✨ *Just Added*

### REST API
- [x] Video endpoints (`/api/videos/*`)
- [x] Library endpoints (`/api/library/*`)
- [x] Scan management (`/api/scan/*`)
- [x] Config management (`/api/config/*`)
- [x] **Channel thumbnail serving** (`/api/library/channels/:id/thumbnail`) ✨ *Just Added*

### Frontend Basic
- [x] **Channels page with profile images** ✨ *Just Added*

---

## 🚧 In Progress / Next Up

### High Priority
- [ ] **Frontend video streaming page** (video player with controls)
- [ ] **Thumbnail generation service** (ffmpeg integration)
- [ ] **Search functionality** (title, uploader, tags)

### Medium Priority
- [ ] **Watch progress tracking** (resume playback, progress bars)
- [ ] **Frontend polish** (loading states, error boundaries, dark mode)

---

## 💡 Future Enhancements

### Channel Management
- [ ] **Missing Channel Images Service** 
  - Detect channels without `thumbnailPath`
  - Queue channel images for fetching via YouTube Data API
  - Batch download channel profile pictures
  - Similar architecture to existing `MetadataFetcher` service
  - Integration into scan orchestrator as optional phase
  - Respect API rate limits and add progress tracking

### Video Features
- [ ] **Video chapters support** (parse info.json chapters)
- [ ] **Subtitle display and search** (full-text search in VTT/SRT)
- [ ] **Video bookmarks/favorites** system
- [ ] **Playlist support** (custom user playlists)

### Quality of Life
- [ ] **Auto-scan on filesystem changes** (chokidar integration)
- [ ] **Bulk video operations** (bulk delete, move, tag)
- [ ] **Statistics dashboard** (storage usage, watch time, etc.)
- [ ] **Export functionality** (watch history, playlists)

### Advanced
- [ ] **Multi-user support** with accounts
- [ ] **Remote streaming** (DLNA, Jellyfin integration)
- [ ] **Mobile PWA** version
- [ ] **Video transcoding** for compatibility
- [ ] **AI-powered features** (auto-tagging, content detection)

### Technical Improvements
- [ ] **Database optimization** for large libraries (100k+ videos)
- [ ] **Horizontal scaling** (multiple workers, Redis cache)
- [ ] **Docker deployment** configuration
- [ ] **Backup/restore** functionality

---

## 🐛 Known Issues

- [ ] Single video per ID limitation (duplicates across libraries)
- [ ] No file move detection (appears as remove + add)
- [ ] Channel name parsing could be more robust for edge cases

---

## 🎯 Milestone Targets

### Milestone 3: Core Video Experience
**Target:** Complete basic YouTube-like experience
- [ ] Video streaming with HTTP range requests
- [ ] Thumbnail generation (two sizes)
- [ ] Basic search functionality
- [ ] Watch progress tracking

### Milestone 4: Polish & Features  
**Target:** Production-ready application
- [ ] Dark mode toggle
- [ ] Keyboard shortcuts (space, arrows)
- [ ] Error boundaries and loading states
- [ ] Missing channel images service
- [ ] Statistics and health dashboard

### Milestone 5: Advanced Features
**Target:** Power user features
- [ ] Playlist support
- [ ] Full-text subtitle search
- [ ] Auto-scan filesystem changes
- [ ] Export/import functionality

---

## 📋 Implementation Notes

### Channel Images Service Design
```typescript
interface ChannelImageFetcher {
  // Similar to MetadataFetcher pattern
  fetchBatch(jobs: ChannelImageJob[]): Promise<Map<string, ChannelImageResult>>;
  downloadChannelImage(channelId: string): Promise<string>; // returns local path
}

interface ChannelImageJob {
  channelId: string;
  channelName: string;
  // Optional: preferred image size, format
}
```

**Integration:**
- Add to `ScanOrchestrator` as Phase 4 (after metadata fetching)
- Store images in `.channel-images/` directory
- Update `channel.thumbnailPath` after successful download
- Include in scan progress tracking

---

*This TODO list is maintained alongside the project development.*