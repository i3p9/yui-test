# Downloader handoff

Updated: 2026-11-25.

**Status: working; tested by the owner locally in Docker. Not used on the NAS yet.**
The downloader feature is done for now. Next session moves on to UI polish: see [docs/UI_PLAN.md](../../UI_PLAN.md).

## Current state

- Code is committed on `main` (`feat: add integrated YouTube downloader`).
- The owner ran the Docker test setup on their Mac and downloaded a small channel
  successfully: files landed in the expected layout, were scanned, and played back.
- An agent review on the same day fixed the issues below and verified them in Docker:
  real download, publish, scan and streaming; re-run publishes nothing; a scan runs while
  a download is active; a container restart mid-download leaves no stray processes or
  partial files; `DOWNLOADS_ENABLED=false` hides the feature and everything else works.

## Design decisions to keep

- **Isolated.** If the downloader fails to start, the app still starts and only
  `/api/downloads` returns 503. `DOWNLOADS_ENABLED=false` turns it off entirely and
  hides the Downloads tab.
- **Never blocks other jobs.** Downloads don't take the shared background-job lock.
  yt-dlp writes to hidden `.yui-staging` (ignored by scans) and publishing is an atomic
  folder rename. Only cookie changes and import apply wait for an idle downloader.
- **yt-dlp is unpinned.** The image installs the latest `yt-dlp[default]` (includes the
  matching yt-dlp-ejs); the entrypoint upgrades it on every start and daily. A failed
  update keeps the installed version.
- **Same layout as the owner's old scripts.** Channel/liked output templates and the
  720p/1080p format rules match `download_videos.sh` / `download_liked.sh`.
- Scanner: an unreadable folder is reported and skipped; readable videos are still
  indexed, and missing-file reconciliation is skipped for that library.
- Keep it simple: one sequential worker, SQLite state, no extra infrastructure.

## NAS plan (owner's decision)

The owner already archives with their own yt-dlp scripts on a systemd timer, with their
own `archive.txt`. For now:

- Keep the systemd scripts as the only downloader on the NAS.
- Deploy YUI with the media mount read-only (`:ro`, the compose default) and optionally
  `DOWNLOADS_ENABLED=false`. Never run both downloaders against the same folders.

If the owner later wants YUI to take over: back up SQLite, config and `archive.txt`;
scan existing libraries; import channel lists and `archive.txt` (preview first; apply
starts nothing); disable the systemd timer; remove `:ro`; run one small source manually;
only then consider enabling the schedule.

## Not verified yet

- Liked Videos sync with real account cookies.
- A full channel download and large initial archives.
- Building and running the image on the NAS's CPU architecture.

## Testing

```bash
cd backend && pnpm test                     # 43 tests, isolated fixtures
docker compose -f docker-compose.yml -f docker-compose.test.yml up --build
```

The Docker test runs on port 3002 with throwaway data in `./test-data` (gitignored).
Libraries inside the container: `/media/channels` and `/media/liked`.

## Private data

`docs/feature/downloader/youtube/` holds the owner's old scripts, channel lists,
`archive.txt` and `cookies.txt`. It is gitignored and dockerignored. Don't read the
cookies, run the scripts, or commit anything from that folder.
