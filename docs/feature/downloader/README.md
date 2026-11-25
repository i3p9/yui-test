# Downloads

Status: working and tested locally in Docker; not yet used on the NAS. Current state and
next steps are in [HANDOFF.md](HANDOFF.md).

YUI can download channel Videos tabs, ordinary playlists, your account's Liked Videos,
and individual video URLs. Open **Downloads** in the navigation. The downloader is
optional and isolated: set `DOWNLOADS_ENABLED=false` to turn it off, and if it fails to
start, only the Downloads page is affected. Browsing and scanning keep working.

## Setup

1. Configure an existing destination in **Configure → Libraries**. Use its container
   path when running Docker. Download destinations must be writable; scan-only libraries
   can stay read-only. YUI does not create a missing destination root.
2. For an existing archive, run a successful scan before adding download work.
3. Add a source with its type, URL, destination, quality, and history choice.
4. Upload an exported Netscape-format cookie file for Liked Videos or other authenticated
   sources. Public sources can run without cookies. One account is supported.
5. Click **Run now**, verify playback and the scan result, then enable the shared schedule
   if desired. Its default interval is **24 hours**, and it starts disabled.

Choose **Up to 720p**, **Up to 1080p**, or **Best available**. Lower resolutions are valid
when a video does not offer the requested cap. Existing videos are kept when a quality
setting changes; YUI does not upgrade, replace, relocate, or delete them. Lower source
run-order numbers go first; the first successful download of an overlapping video wins.

History choices are **All available videos** or **Uploaded on or after a date**. The
cutoff is inclusive and remains active for future runs. It uses the video's upload date,
so an old video newly added to a playlist can be excluded. Videos with unknown dates
are skipped when a cutoff is set. Liked Videos always discovers all available likes.
Active/upcoming streams are excluded; completed livestream recordings are eligible.

The download schedule is separate from the optional **48-hour automatic scan** schedule
in Configure. Completed downloads trigger ingestion when their queue drains, coalesced
by destination library. The periodic scanner is still useful for files added externally.
An overdue download schedule queues one batch on restart rather than replaying every
missed interval. Manual runs remain available when scheduling is off.

## Activity and recovery

Only one source downloads at a time. Downloads do not block scans, metadata fetching,
channel images, or index reset: files are written to a hidden `.yui-staging` folder that
scans ignore, then moved into the library in one step. Cookie changes and import apply
wait until no download is running, since running downloads use those files.

The Activity list separates the transfer result from the library scan result. A run can
show downloaded files with a failed scan. **Retry scan** repeats ingestion without another
transfer. **Retry** creates a new attempt using the old settings snapshot; completed IDs
are skipped. To apply edited settings to queued work, cancel it and queue a fresh run.
Disabling a source cancels its queued work and lets an active attempt finish.

**Cancel** stops yt-dlp and its postprocessing descendants, then publishes any valid
completed output. Failed/partial/cancelled attempts keep already published files.
After a restart, the worker marks active attempts interrupted, replays completion receipts,
and reconciles pending scans. Interrupted attempts remain visible and retryable.

If publication fails, YUI retains its receipts/staging files and pauses further transfers
with an explanation. Correct the filesystem/permission/collision problem and retry the
affected run. Existing destination files are never overwritten to resolve a conflict.
A missing or skipped library keeps ingestion pending until it is restored/enabled.

## Channels and Liked share files

A video can appear in both views while using one physical playback record and one watch
progress record. Liked discovery runs independently of the download archive, so an
already archived channel video can become liked without downloading another copy.
Scanning a legacy liked directory also records membership.

This is an archive: removing a like on YouTube does not remove its recorded membership
or local media. Historical IDs absent from a new complete account snapshot retain their
relative order before the current likes; current likes follow oldest-to-newest playlist
order. A failed/partial discovery does not replace that order.

The existing Config text order import can record IDs before their media is downloaded.
A later complete account sync applies the ordering rule above. Resetting the browser
index preserves downloader settings, sources, archive, memberships, and recovery work;
rescan afterward. Watch progress is still cleared by that reset.

## Importing an existing NAS setup

1. Back up SQLite, config, and the existing yt-dlp archive. Keep the download schedule off.
2. Mount existing libraries writable where downloads are intended, configure their
   container paths, and scan them successfully.
3. Upload each quality group's URL list under **Import existing setup**. Blank lines and
   `#` comments are accepted. The preview lists duplicates/conflicts for correction.
   Import order is Best, 1080p, 720p, then the optional Liked source.
4. Upload `archive.txt`. V1 accepts `youtube <11-character-video-id>` lines. Imports union
   history rather than replacing it. An imported ID remains skipped even when its file
   is absent; it does not become an invented playable record.
5. Preview, resolve conflicts/invalid lines, then apply. Importing does not start work
   or enable the schedule. Upload cookies separately through the private cookie control.
6. Disable the external download cron jobs before the first YUI download. Run a small
   source and Liked manually, check overlap/playback, then enable scheduling.

Import files are parsed as data; YUI never executes the supplied shell scripts. There
is no automatic missing-file repair or account-cookie refresh. Replace cookies when
YouTube rejects authentication; an uploaded file alone does not prove a working login.

## Persistent files and deployment

Downloader state defaults to `.downloads` beside `CONFIG_PATH` (`/config/.downloads`
in the standard container). `DOWNLOAD_STATE_DIR` can override it. Back up this directory
along with SQLite/config; it contains the shared archive, private cookies, and unresolved
run receipts/logs. Keep it out of static serving and source control.

Downloads stage under `<library>/.yui-staging/<run-id>` on the destination filesystem.
The scanner ignores this hidden directory. A completed video folder and its sidecars
are renamed into place together, then committed to the shared history. Do not configure
staging as a library or manually delete unresolved staging/receipt files.

Finalized history/logs are pruned to 100 eligible runs, with a 10 MiB log cap per run.
Unresolved publication, failed scans, and pending scan records are retained.

The image uses Node 24, ffmpeg, and a Python virtual environment with
the latest `yt-dlp[default]` (which brings the matching `yt-dlp-ejs`). It is intentionally
unpinned: the container entrypoint upgrades it on every start and daily while running.
Node is explicitly selected for JS challenges. Tool versions appear on Downloads. Local installations need the
same tools on PATH; `YTDLP_PATH` can select a trusted server-configured executable.
The JS/EJS setup follows the [official yt-dlp guide](https://github.com/yt-dlp/yt-dlp/wiki/EJS).

Apply the SQL migration chain with `pnpm exec prisma migrate deploy` before starting a
local installation, then generate Prisma and build. Docker's entrypoint applies pending
migrations automatically. The downloader migration is additive and backfills existing
liked memberships/orders without moving media or modifying watch progress.

## API

All paths below are relative to `/api/downloads` and use YUI's existing authentication.

| Method and path | Operation |
|---|---|
| `GET /settings`, `PUT /settings` | Schedule state; update `{scheduleEnabled, intervalHours}`. |
| `GET /sources`, `POST /sources`, `PATCH /sources/:id`, `DELETE /sources/:id` | Source management. |
| `POST /sources/:id/run`, `POST /run` | Queue one source or all enabled sources. |
| `POST /videos` | Queue `{url, quality, libraryPath, useCookies}` for one video. |
| `GET /runs?page=1&limit=25`, `GET /runs/:id` | Paginated history, active work, progress, and separate scan outcomes. |
| `GET /runs/:id/log?limit=16384` | Bounded log tail (maximum 65,536 bytes). |
| `POST /runs/:id/cancel`, `POST /runs/:id/retry`, `POST /runs/:id/retry-scan` | Control/recovery actions. |
| `GET /cookies`, `PUT /cookies`, `DELETE /cookies` | Status, private `{content}` upload, removal. GET never returns contents. |
| `POST /import/preview`, `POST /import` | Validate then apply lists/archive; no download is started. |
| `GET /tools` | Actual Node/yt-dlp/EJS/ffmpeg status. |

Saved source fields: `name`, `url`, `kind` (`channel`, `playlist`, `liked`), `quality`
(`720p`, `1080p`, `best`), `libraryPath`, `enabled`, `useCookies`, nullable
`uploadedAfter` (`YYYY-MM-DD`), and `position`. Liked forces cookies and rejects a cutoff.
Source URLs are normalized; a repeated active enqueue returns the existing run.
New queued work returns 202. Invalid input returns 400, absent records 404, and active
operation/library-reference conflicts 409. Credentials and signed query strings are
excluded from returned logs/progress/history.

Import body shape:

```json
{
  "groups": [
    { "quality": "720p", "libraryPath": "/media/channels", "useCookies": false,
      "content": "https://www.youtube.com/@example/videos\n" }
  ],
  "liked": { "libraryPath": "/media/channels", "quality": "best" },
  "archive": "youtube aaaaaaaaaaa\n"
}
```

Omit `liked` when not importing an account source. Archive-only imports can omit groups.
Cookie text uploads are limited to 1 MiB; the import HTTP body is limited to 10 MiB.

[IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md), [TEST_PLAN.md](TEST_PLAN.md), and
[VALIDATION.md](VALIDATION.md) are the original design-time documents and are partly
out of date; this page and the code are the current reference.
