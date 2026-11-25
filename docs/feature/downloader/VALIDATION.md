# Downloader validation report

Status updated: 2026-10-31. **Unfinished; awaiting the owner's personal testing and acceptance.**
The check results below were recorded by the agent in the preceding implementation session
(report dated 2026-10-23); they were not rerun for this handoff. The owner has not tested
the feature in person. Container and authenticated live validation also remain outstanding.
See [HANDOFF.md](HANDOFF.md) for next-session instructions. This report does not mark
all requirements in [TEST_PLAN.md](TEST_PLAN.md) passed.

## Implemented

- Downloads page/navigation, source CRUD, quality/history controls, one-off videos,
  schedule/setup, cookies, import preview/apply, activity, bounded logs, cancel/retry,
  and scan-only retry.
- Four additive tables and SQL migration: settings, sources, runs, liked membership.
  Legacy liked order is backfilled once and ignored by runtime video writes.
- Persistent sequential queue, initially disabled 24-hour schedule, immutable attempt
  snapshots, active-run deduplication, process-group cancellation, shutdown/restart recovery.
- Hidden staging, validated completion receipts, folder publication, authoritative archive
  commit, and coalesced ingestion through the existing scan pipeline/reservation.
- Shared channel/liked playback records and independent membership/order. Existing files
  are not upgraded, relocated, overwritten, or deleted when quality or likes change.
- Common shell-free yt-dlp runner for downloads, metadata, and channel images; bundled
  Docker runtime changes, writable destination example, init/stop grace period, secret exclusions.
- Scanner read-failure propagation, safe index-reset reservation/state preservation,
  fail-closed authentication on configuration errors, and row-ID-preserving bulk FTS rebuild.

## Main implementation files

- [Queue, schedule, worker, recovery, and scan handoff](../../../backend/src/services/download-service.ts)
- [Process runner](../../../backend/src/services/yt-dlp-runner.ts) and [publication/archive storage](../../../backend/src/services/download-storage.ts)
- [API routes](../../../backend/src/routes/downloads.ts) and [Downloads page](../../../frontend/src/pages/DownloadsPage.tsx)
- [Liked membership service](../../../backend/src/services/liked-video-order-service.ts)
- [Additive SQL migration](../../../backend/prisma/migrations/20261016120000_add_downloader/migration.sql)
- [Docker runtime](../../../Dockerfile) and [Compose mounts/lifecycle](../../../docker-compose.yml)

## Checks executed

| Check | Result |
|---|---|
| Prisma schema validation and client generation | Passed with Prisma 6.19.0. |
| Backend TypeScript build | Passed. |
| Frontend TypeScript + Vite production build | Passed; existing Browserslist/baseline freshness notices remain. |
| Combined backend test suite | **42 passed, 0 failed, 0 skipped**. |
| Real process recovery | Six publication/scan checkpoints, each recovered twice in new processes. |
| Desktop/mobile Chrome | Passed core source/download/setup flows, error recovery, and mobile layout/navigation; see browser script for exact assertions. |
| Real yt-dlp/ffmpeg, localhost fixtures | Passed 720p, 1080p, Best, inclusive cutoff, excluded older date, and excluded missing date. |
| Public live worker smoke | Passed a 19-second video, merge/playback streams, publication, scan, archive commit, and no replacement on a Best-quality rerun. |
| Documentation relative links / Git whitespace | Checked. |

The 42 automated tests include the existing 16 scan/scheduler tests. Downloader coverage
includes fresh and legacy migrations, schedule persistence/coalescing, active deduplication,
immutable snapshots, one shared channel/liked file, membership/order retention, partial
transfer success, independent scan failure/retry, cancellation and descendant process
cleanup, import repeatability/conflicts, cookie privacy/permissions, auth configuration
failure, reset preservation, skipped/missing destinations, traversal failures, symlink
rejection, chunked UTF-8/progress, truncated receipts, archive failure after rename,
removed-source retry, and the 10 MiB log / bounded-tail limits.

Fixtures use generated media/IDs/cookies, temporary databases/configs/libraries, and fake
child executables. No owner's database, configured NAS libraries, supplied cookie file,
or reference download script was used for test execution.

### Real toolchain evidence

Host: macOS arm64; Node **24.15.0**, yt-dlp **2026.08.19**, EJS **0.8.0**, ffmpeg
**9.0.2**. The localhost test exercises the actual app worker with the real tools; only
extraction metadata is redirected to generated localhost media. Three available video
formats plus a separate audio stream exercise selection and ffmpeg merging:

| Requested quality | Verified final video height |
|---|---|
| 720p | 720 |
| 1080p | 1080 |
| Best | 1440 |

Each completed video was published and indexed. A cutoff equal to the upload date
published one video; a later cutoff and an unknown upload date published none.

This test caught a real integration defect: yt-dlp's default `NA` placeholder made
explicit progress JSON invalid. Per-field `null` defaults corrected it, and the actual
runner now consumes those records successfully. Compilation/fake process tests alone
would not have detected this.

The bounded public fixture was `jNQXAC9IVRw` (19 seconds). The worker downloaded a
**240p** file of **474,478 bytes**, with video/audio streams verified by ffprobe. Its
available formats were below the 720p cap; this public check alone does not prove high
resolution caps. The localhost formats above provide that evidence. A second attempt
at Best published **0** files, required no scan, and preserved the existing file's mtime.
The original upstream sample `BaW_jenozKc` was unavailable and was not used as a success.

Local artifacts (ignored by Git):

- `test-results/downloader-toolchain.json`
- `test-results/downloader-live.json`
- `test-results/downloads-desktop.png`
- `test-results/downloads-mobile.png`

## Reproduce

Apply migrations only to isolated fixture databases when testing. The automated suite
creates those itself; it must not be pointed at the owner's environment.

From `backend` with the project's dependencies installed:

```bash
pnpm exec prisma validate
pnpm exec prisma generate
pnpm build
pnpm test                 # all 42 automated tests
pnpm test:scheduler       # existing 16-test subset
pnpm test:downloader      # downloader/recovery subset
pnpm test:downloader:tools
```

The executed low-level equivalents were the installed `prisma`/`tsc` binaries and:

```bash
node --import tsx --test tests/downloads.test.ts tests/download-recovery.test.ts tests/scan-scheduler.test.ts tests/scan-api.test.ts
YUI_RUN_TOOL_TESTS=1 node --import tsx tests/download-toolchain.ts
```

The toolchain test requires ffmpeg/ffprobe, yt-dlp, a supported Node runtime, and permission
to bind an ephemeral localhost port. It creates and removes a disposable local media server.
For the opt-in public smoke test (outbound network, no cookies):

```bash
YUI_RUN_LIVE_TESTS=1 pnpm test:downloader:live
```

The live script checks the fixture's duration/estimated size before downloading, uses a
fresh temporary application environment, and cleans up its media/database afterward.
It is intentionally excluded from normal `pnpm test`.

From `frontend`, `pnpm build` compiles TypeScript and produces the production UI.
To reproduce browser checks, build the frontend first, install temporary Playwright
tooling, and run from the repository root:

```bash
npm install --prefix /tmp/yui-browser-tooling playwright --no-audit --no-fund
node backend/tests/download-browser.mjs
```

The script uses installed Google Chrome and starts its own temporary Fastify/database
fixture. `PLAYWRIGHT_MODULE` can point to another Playwright module installation.
It can also be invoked as `pnpm test:downloader:browser` from `backend`.

## Remaining acceptance work

**Personal acceptance is pending:** the owner has not tested the feature in person.
Collect their manual results and resolve issues before declaring the feature done.

1. **Clean Docker image build and isolated startup:** Docker is not installed in this
   workspace. The Dockerfile/Compose changes have not been built or run. Verify the
   pinned Python/EJS installation on the NAS architecture, fresh/legacy startup, health,
   writable/read-only mounts, persistent volumes, and stop/forced-kill recovery in Linux.
   Host process tests do not substitute for container lifecycle verification.
2. **Authenticated live Liked discovery:** no dedicated test credentials were available.
   Fake authenticated discovery, overlap, failure, and ordering are covered; actual cookie
   validity and current YouTube playlist order still need a small dedicated-account check.
   The supplied NAS cookies were deliberately not used.
3. **Live channel/ordinary-playlist enumeration and NAS scale:** the public live acceptance
   downloaded one explicitly selected short video. Full channel/playlist network behavior,
   large first-time archives, and the owner's NAS permissions/performance were not exercised.
4. **Physical disk exhaustion:** archive commit failure was exercised using a real filesystem
   obstruction; actual ENOSPC/device loss/power-loss durability was not induced.

Keep scheduling disabled during cutover. Back up SQLite/config/archive, deploy/migrate,
scan existing libraries, preview/apply source/archive imports, upload cookies, disable old
cron, and perform small manual Channel/Liked checks before enabling automatic downloads.
See [README.md](README.md) for the full setup and API contract.
