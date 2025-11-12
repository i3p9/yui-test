# YUI Frontend - Scanner Management UI

React-based web interface for managing YUI's video scanner.

## Tech Stack

- **Vite** - Fast build tool and dev server
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling

## Development

```bash
# Install dependencies
pnpm install

# Start dev server (with backend proxy)
pnpm dev
```

The dev server runs on `http://localhost:3000` and proxies API requests to `http://localhost:3001`.

## Building for Production

```bash
# Build static files
pnpm build

# Preview production build
pnpm preview
```

Built files are output to `dist/` and can be served by the Fastify backend.

## Features

### Scanner Management
- **Scan Controls** - Trigger full or incremental scans
- **Real-time Progress** - Live updates via polling (1s interval)
- **Scan History** - View past scan logs with stats
- **Library List** - View configured libraries

### Video Statistics
- Total video count
- Total storage size
- Videos by media type

## Project Structure

```
src/
├── components/          # React components
│   ├── LibraryList.tsx
│   ├── ScanControls.tsx
│   ├── ScanProgress.tsx
│   ├── ScanHistory.tsx
│   └── VideoStats.tsx
├── lib/
│   └── api.ts          # API client
├── types/
│   └── index.ts        # TypeScript types
├── App.tsx             # Main app component
├── main.tsx            # Entry point
└── index.css           # Global styles
```

## API Client

The `lib/api.ts` module provides typed functions for all backend endpoints:

```typescript
// Health
getHealth()

// Config
getConfig()
getLibraries()
updateConfig(config)

// Scan
startScan({ mode, libraryPath })
getScanStatus()
getScanHistory()
getLatestScan()

// Videos
getVideos(params)
getVideo(id)
getVideoStats()
```

## Environment

The Vite dev server is configured to proxy `/api/*` requests to the backend at `http://localhost:3001`.

For production, the backend serves the built frontend files and handles API requests on the same port (3001).
