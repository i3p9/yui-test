# Downloader session handoff

Updated: 2026-10-31.

**Status: unfinished; awaiting the owner's personal testing and acceptance.**
The owner explicitly said they have not tested the feature in person yet. Code being
present and agent-run checks passing do not mean the feature is done, accepted, or
ready for the NAS cutover. Resume from this state rather than rebuilding it from scratch.

## Start here next session

1. Read this handoff, [VALIDATION.md](VALIDATION.md), and [README.md](README.md).
2. Check `git status --short` and the current diff before editing. The implementation
   is still in the working tree, with modified tracked files and untracked feature files.
   No commit or deployment was made in this work. Preserve the owner's other changes.
3. Establish whether the owner has since tried it and collect their actual observations.
   If they have not, help them start a small manual test in their chosen environment.
4. Reproduce and fix issues from that test, run checks appropriate to each fix, and update
   this handoff/report with actual results. Do not treat previous test results as a fresh run.
5. Keep the feature pending acceptance until the owner has tested it and the remaining
   deployment/authentication checks below have concrete results.

## Review session 2026-11-25 (agent review, still not owner acceptance)

- **Isolation:** a downloader startup failure no longer exits the app; `/api/downloads`
  returns 503 with the reason and everything else keeps serving (verified by dropping
  `download_settings` in a scratch DB). `DOWNLOADS_ENABLED=false` disables the worker,
  schedule and API entirely, and skips the downloader's library-edit guard in config.
  A failing schedule tick at startup is now non-fatal.
- **Scanner:** an unreadable subfolder no longer drops every video in that library.
  The walk continues, readable videos are indexed, the error is reported, and
  missing-file reconciliation is skipped for that library. Covered by a new test.
- Checks: 43/43 backend tests, backend and frontend builds, server smoke with downloader
  on/off/broken, and a live metadata info-json fetch through the new runner.
- **Downloads no longer take the shared background-job lock** (owner's decision). Scans,
  metadata, channel images and index reset run normally during downloads; staging is
  hidden from the scanner and publishing is an atomic rename. Only cookie changes and
  import apply wait for an idle downloader, since running downloads use those files.
- **yt-dlp is unpinned** (owner's decision): latest at build, upgraded on start and daily.

## Product direction to preserve

- Integrate the external NAS yt-dlp workflow into the existing app/container, with a
  Downloads page. External downloading previously ran every 24 hours.
- One sequential worker, ordinary SQLite persistence, shared background reservation.
  Follow DRY/KISS; no Redis, parallel worker fleet, or generic workflow framework.
- Per source: 720p, 1080p, or Best. Existing files are not upgraded, replaced, moved,
  or deleted when quality settings change. First successful overlapping download wins.
- A channel video may also be liked using one physical file and one playback/progress
  record. Liked membership/order is separate from physical library type.
- Shared configurable download interval: default 24 hours, initially disabled. The
  existing optional 48-hour scan schedule remains independent.
- Download history: all available videos, or an inclusive upload-date cutoff. Liked
  discovery uses the whole available account playlist without a cutoff/archive filter.
- Finished downloads are ingested through the existing scanner. Download and scan
  outcomes are separate; retry-scan must not download again.
- One account/cookie file in V1. No OAuth, quality-upgrade workflow, or auto-deletion.

The full contract is [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md), with intended
acceptance coverage in [TEST_PLAN.md](TEST_PLAN.md).

## Implementation already in the working tree

| Area | Main files / behavior |
|---|---|
| Data | `backend/prisma/schema.prisma`; migration `20261016120000_add_downloader`. Adds DownloadSettings, DownloadSource, DownloadRun, LikedVideo. Backfills legacy likes/orders; keeps the old video column ignored by runtime client code. |
| Queue/schedule/recovery | `backend/src/services/download-service.ts`. Persistent attempts, immutable snapshots, deduplication, cancellation/retry, restart replay, coalesced scan handoff. |
| Files/history | `backend/src/services/download-storage.ts`. Hidden staging, completion receipts, validated publication, archive union, private cookies, atomic state writes. |
| Tool execution | `backend/src/services/yt-dlp-runner.ts`. Argument-array spawning, bounded/redacted logs, progress parsing, process-group stop, tool status. Existing metadata/channel-image code now uses this runner. |
| Validation/import | `download-validation.ts`, `download-import.ts` in the same services directory. YouTube URL/quality/date validation and preview/apply imports. |
| API | `backend/src/routes/downloads.ts`, registered at `/api/downloads`. Uses existing auth. |
| UI | `frontend/src/pages/DownloadsPage.tsx`, `frontend/src/lib/download-api.ts`, route/navigation changes. Sources, activity, setup/schedule, cookies, one-off URL, imports. |
| Likes | `liked-video-order-service.ts`, database ingest, library/video routes. Membership works before media exists and survives an index reset. |
| Existing services | Awaitable shared scan lifecycle; traversal errors no longer reconcile a partial library inventory; bulk FTS rebuild preserves row IDs. Auth config errors fail closed. Index reset reserves the background job and preserves downloader/membership state. |
| Docker | Node 24; Python venv with unpinned latest yt-dlp[default] (updated on start and daily); ffmpeg retained. Compose init/30-second grace period and writable destination mount example. **Not built/tested here.** |

Runtime state defaults to `.downloads` beside the active config (`/config/.downloads`
in Compose), overridable with `DOWNLOAD_STATE_DIR`. Staging is inside each destination
at `.yui-staging/<run-id>`. Preserve unresolved receipts/staging and the shared archive;
do not clear them as a troubleshooting shortcut.

Important behavior: removing a like on YouTube retains its archived membership/file.
A complete account sync keeps absent historical IDs before the current playlist order.
A failed enumeration must not replace existing order. A missing/blocked publication can
pause transfers for explicit recovery; a skipped library can keep a scan pending.

## Previous agent-run checks, not personal acceptance

The previous session recorded:

- 42 backend tests passed, including the existing 16 scan/scheduler tests.
- Prisma validation/generation and backend/frontend builds passed.
- Desktop/mobile Chrome flows passed, including shared Channel/Liked results, partial
  downloads, cancellation, imports, cookies, schedule persistence, logs, and error recovery.
- Six real process-exit checkpoints replayed twice without duplicate files/archive loss.
- Actual yt-dlp/ffmpeg against generated localhost media selected 720p, 1080p, and
  1440p for Best; inclusive/older/missing upload-date cases passed.
- One public 19-second video (`jNQXAC9IVRw`) downloaded at its available 240p, merged,
  published, and scanned. Rerunning at Best published nothing and preserved the file.

A real toolchain defect was found and fixed: yt-dlp's missing progress fields use `NA`
by default, which is invalid in JSON. Keep the per-field `null` defaults in the progress
output template. This is covered by the actual-tool test, beyond the fake executable.

See [VALIDATION.md](VALIDATION.md) for exact evidence/limits. Artifacts under
`test-results/` are ignored and may remain locally; `/tmp` tooling/logs can disappear
between sessions. Reinstall temporary browser tooling if needed.

## Work still outstanding

- **Owner's personal end-to-end test and feedback.** No such test or acceptance has
  been recorded. The next session should prioritize this, then fix discovered issues.
- **Clean Docker build/startup on the target architecture.** Docker/compatible runtime
  was unavailable in this workspace. Verify dependencies, migrations, health, persistent
  volumes, permissions, writable download mounts, read-only scan-only mounts, and Linux
  child-process cleanup/stop/restart behavior. Host checks do not cover these.
- **Live authenticated Liked discovery and order.** No dedicated test credentials were
  supplied. Fake discovery/overlap/failure tests pass; actual account behavior is unverified.
- **Live channel/ordinary-playlist runs and NAS operation.** Only one explicit public
  video was downloaded live. Full-source enumeration, large initial archives, and NAS
  performance/permissions have not been validated.
- Physical disk exhaustion/device/power failure were not induced. A real archive-write
  obstruction and multiple process-crash boundaries were exercised instead.

There was no recorded failing automated test at the end of the implementation session.
That does not establish that the pending manual or deployment cases will pass.

## Suggested personal test sequence

Use a disposable writable library and a separate database/config first. Do not run reset
or migration test fixtures against the owner's actual archive/database.

1. Start the app or an isolated Docker deployment; verify the Downloads page and Tools
   status. Confirm scheduling starts off and existing browsing/scanning still works.
2. Add a small public source or one video, select a quality/destination, and Run now.
   Inspect progress, final files/sidecars, scan status, browse entry, and playback.
3. Rerun it, then change quality and rerun. Verify no extra copy or replacement appears.
4. Try a small channel/playlist with a date cutoff. Verify source enable/disable, edits,
   run order, and the distinction between queued and active work.
5. With intentionally supplied account cookies, run Liked for a video already stored
   under a channel. Confirm it appears in both views with one file and shared progress.
6. Exercise cancel/retry, a scan failure/retry-scan, and container restart during work.
   Verify completed files survive and pending ingestion/recovery remains visible.
7. Preview imports, resolve conflicts, apply, and repeat the same import. Confirm no work
   starts automatically. Test schedule settings/persistence without enabling broad work.
8. Record exact results/issues and fix regressions before the NAS cutover or acceptance.

For a real NAS cutover: back up SQLite/config/archive, deploy/migrate, scan existing
libraries, import lists/history, upload cookies intentionally, disable the old cron
before YUI writes to the same destinations, run small manual checks, and only then
consider enabling automatic downloads. Do not silently enable scheduling or switch
production ownership as part of preparing the next session.

## Useful commands

From `backend` (project pins pnpm 10.15.1; Node 24 was used):

```bash
pnpm exec prisma validate
pnpm exec prisma generate
pnpm build
pnpm test
pnpm test:downloader:tools
```

The normal test suite uses isolated fixture databases/configs. The tools test requires
actual yt-dlp/ffmpeg/ffprobe and localhost binding. To run browser checks, build the
frontend (`pnpm build` from `frontend`), then from the repo root:

```bash
npm install --prefix /tmp/yui-browser-tooling playwright --no-audit --no-fund
node backend/tests/download-browser.mjs
```

The browser script uses installed Chrome and its own isolated app fixture. The opt-in
public smoke test is `YUI_RUN_LIVE_TESTS=1 pnpm test:downloader:live` from `backend`;
it makes network requests and downloads only its bounded public fixture, without cookies.
Do not rerun these automatically just to create a handoff; rerun when validating the
current checkout/environment or a relevant change.

The global pnpm launcher previously tried to verify/download a package-manager version
through the registry in the sandbox. The existing pinned pnpm binary or installed project
binaries were used when necessary. Do not replace lockfiles or dependency policy merely
to bypass an environment-specific launcher problem.

## Workspace/secret notes

All implementation work is uncommitted. There are also pre-existing untracked docs such
as `docs/AUTOMATIC_SCANS.md`, `docs/CODEBASE_UNDERSTANDING.md`, and
`docs/CONFIG_PAGE_REDESIGN.md`; do not delete or bundle unrelated work inadvertently.

The reference scripts/lists/archive under `docs/feature/downloader/youtube/` are input
material. Do not execute the scripts during tests. That folder contains a private cookie
file: it was not read/used for tests and must not be printed, staged, or copied into an
image. Git/Docker exclusions were added. Review staging explicitly if a commit is later
requested; do not blindly add the whole reference directory.

## Next-session prompt

> Read docs/feature/downloader/HANDOFF.md and check the working-tree diff. The integrated
> downloader is implemented but unfinished and not personally tested/accepted by me.
> Continue with my manual testing and remaining Docker/authenticated validation, fix any
> issues we find, and update the validation report. Preserve existing files, keep the
> download schedule off until intentionally enabled, and do not use the reference cookies
> or declare completion based solely on previous automated results.
