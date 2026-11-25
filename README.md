# YUI

A self-hosted browser for your offline YouTube archive. Point it at the folders where
yt-dlp saves your videos and watch them like you would on YouTube, with channels,
liked videos, search, and resume playback. It can also download new videos for you.

## Features

- **Browse** channels, liked videos, and the latest downloads, with thumbnails and channel art
- **Watch** in the browser and pick up where you left off
- **Search** titles, channels, and descriptions
- **Scan** your folders on demand or on a schedule; picks up yt-dlp `.info.json` metadata
- **Download** channels, playlists, liked videos, or single videos with yt-dlp (optional)
- **Password protection** for exposing it beyond your home network

## Quick start (Docker)

1. In `docker-compose.yml`, mount your video folders under `/media`:

   ```yaml
   volumes:
     - /path/to/youtube:/media:ro   # remove :ro to let YUI download here
   ```

2. Start it:

   ```bash
   docker compose up -d --build
   ```

3. Open `http://localhost:3001`, go to **Config**, add your libraries using the
   container paths (e.g. `/media/channels`), and run a scan.

Data lives in `./config`, `./data`, `./thumbnails`, and `./metadata`. See
[DEPLOYMENT.md](DEPLOYMENT.md) and [DOCKER.md](DOCKER.md) for details.

### Settings

| Environment variable | Purpose |
|---|---|
| `AUTH_PASSWORD` | Require a password to use YUI |
| `DOWNLOADS_ENABLED=false` | Turn the downloader off and hide the Downloads tab |
| `CONFIG_PATH`, `DATABASE_URL` | Config file and SQLite locations (set in compose) |

## Folder layout

YUI finds videos by the YouTube ID in brackets, as yt-dlp names them by default:

```
channels/Channel Name/20240101 - Title [dQw4w9WgXcQ]/20240101 - Title [dQw4w9WgXcQ].mp4
```

Each library is either a **Channel Archive** or **Liked Videos**. Folders starting with
`.` and folders containing a `.ignore` file are skipped.

## Downloads

The **Downloads** page runs yt-dlp inside the container. Add channel or playlist
sources, pick 720p, 1080p, or Best, and run them manually or on a schedule (off until
you enable it). Finished videos are scanned in automatically. Liked Videos needs an
exported cookies file. yt-dlp updates itself on every start and daily.

If you already download with your own yt-dlp scripts, you can import your channel
lists and `archive.txt`, but don't run both against the same folders. See the
[downloader guide](docs/feature/downloader/README.md).

## Development

Requires Node.js 24, pnpm 10, ffmpeg, and yt-dlp.

```bash
make install   # install backend and frontend dependencies
make dev       # backend on :3001, frontend on http://localhost:3000
```

Run `cd backend && pnpm exec prisma migrate deploy` once to set up the database.
Without Docker, the config file is `backend/config.json` unless `CONFIG_PATH` is set.

```bash
cd backend && pnpm test     # backend tests
make help                   # all other commands
```

To try the full app in Docker without touching your real data (port 3002,
throwaway data in `./test-data`):

```bash
docker compose -f docker-compose.yml -f docker-compose.test.yml up --build
```

## Project layout

```
backend/    Fastify + Prisma (SQLite) API, scanner, downloader
frontend/   React + Vite UI
docs/       Design notes and feature docs
```

## License

MIT
