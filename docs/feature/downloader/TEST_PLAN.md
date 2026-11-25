# Integrated YouTube Downloader — Test and Acceptance Plan

> **Historical design document** written before implementation and review. Some details
> are out of date: downloads no longer hold the shared background-job lock, and yt-dlp is
> unpinned and auto-updated. See [README.md](README.md) and [HANDOFF.md](HANDOFF.md) for
> current behavior.

Companion to [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md).
These are implementation requirements, not results from an implemented feature.

## 1. Test setup and evidence

Use the existing Node test runner and `tsx` for backend tests. Add a focused
`test:downloader` script; keep `test:scheduler` passing. Exercise services against real
temporary SQLite databases and directories, and routes through Fastify injection.
Do not introduce a second backend test framework.

Every test process must explicitly set isolated `DATABASE_URL`, `CONFIG_PATH`, and
`DOWNLOAD_STATE_DIR` values before initializing application singletons. Use generated
fixtures, never the owner's configured database, library, archive, or cookies. Separate
tests that change process environment/global reservations, or serialize them. Stop timers,
disconnect Prisma, reap children, and remove only owned temporary directories in cleanup.

Provide a small fake yt-dlp executable with selectable scenarios. It should receive real
argument arrays, write realistic media/sidecar/receipt fixtures, emit chunked output,
return selected exit codes, and optionally spawn a long-lived descendant. This exercises
the actual runner and filesystem protocol without contacting YouTube. Inject time for
scheduler tests; do not wait 24 hours or use timing-sensitive sleeps.

Use fault injection at persistence/publication boundaries. It should be a narrow test
seam, not a production workflow framework. At least one recovery test must restart a
real application/worker process against the same temporary database and work directory.

For each acceptance check, record the command or browser action, expected outcome,
actual outcome, and relevant artifact. Redact credentials and signed URLs. Mocked tests
prove application behavior; the Docker/live checks prove the shipped toolchain works.

## 2. Migration and existing library regression

| Case | Required assertion |
|---|---|
| Fresh database | All migrations apply; four new tables exist; download scheduling is off with a 24-hour default. |
| Existing database | Video IDs/paths, watch progress, channel rows, subtitles, and thumbnails remain intact. |
| Legacy liked rows | Membership is backfilled for liked media type and for non-null legacy order on channel rows. Null and numeric orders are preserved. |
| Migration restart | Restarting does not backfill repeatedly, reset ranks, or restore runtime reads/writes of the old order field. |
| Active-run uniqueness | SQLite rejects duplicate active runs for a source; finalized history does not prevent a new run. |
| Index reset | Browser-index reset preserves sources, settings, archive, liked memberships, and unresolved recovery work. A rescan restores browse results. |
| Scan-only installation | No downloader setup/cookies/writable media requirement is imposed on existing browsing or manual/scheduled scans. |

Use a minimal pre-feature database fixture and the real migration chain, not only
`prisma db push`. Account for the repository's existing runtime migration helper as
well as SQL migrations. Verify Prisma generation/build after retiring legacy order use.

## 3. Validation, imports, and argument construction

- Normalize watch URLs, `youtu.be`, Shorts, channel IDs/handles, Videos tabs, and ordinary
  playlists. Equivalent normalized URLs deduplicate; a second Liked source is rejected.
- Reject unsupported hosts, deceptive suffix hosts, credentials, nonstandard ports,
  file URLs, option-like input, invalid IDs, invalid dates, and unsupported source kinds.
  A one-off watch URL with playlist parameters still downloads just that video.
- Assert exact argument arrays for all three quality policies. A capped source never
  silently switches to an uncapped fallback. Best does not acquire a fixed height cap.
- Assert server-controlled output paths, attempt archive, ignored ambient config,
  JS runtime, sidecars, explicit real-download mode, and machine-readable receipts.
  URL/title metacharacters never execute a shell. Use a harmless sentinel file to prove it.
- All-history omits the date filter. A configured date is inclusive, remains on later
  runs, and filters by upload date. Missing dates with a cutoff are skipped and explained.
  Active/upcoming livestreams are skipped; completed recordings remain eligible.
- Source creation defaults, enum validation, interval bounds, and date/quality/destination
  errors return useful field errors without partially saving or enqueueing.
- Import preview changes no database, file, schedule, or queue state. Apply accepts
  comments/blank lines, rejects malformed archive entries, reports conflicts, unions
  archive IDs, and is repeatable without duplicate sources or archive lines.
- Conflicting quality/destination choices are explicitly resolved before import. Import
  failure cannot be reported as success; retry after a simulated archive-write failure
  converges without starting downloads or enabling the schedule.
- Do not hard-code the supplied channel names, source counts, or 4,022-entry archive.
  Use small generated fixtures, plus a larger generated import to catch accidental limits.

## 4. Process execution and publication

| Scenario | Required result |
|---|---|
| Normal completion | One finished folder and its sidecars appear in the destination; one archive entry is committed; a scan becomes pending. |
| Hidden in-progress output | `.part`, separate audio/video fragments, unfinished postprocessing, and staging info JSON are invisible to scans. |
| Chunked output | Split JSON lines and multibyte UTF-8 decode correctly; bounded long/malformed lines do not exhaust memory or crash the worker. |
| Exit zero, all archived | Successful run with zero published files and no unnecessary ingestion scan. |
| Nonzero after some successes | Completed receipts are published and archived; run is partial with the exit/error visible. |
| Nonzero with no successes | Failed run; no invented archive entries or playable database rows. |
| Missing executable/runtime | Useful setup error; reservation released; later work can run after configuration is fixed. |
| Missing required sidecar/media | Invalid receipt is not published/archived; run cannot report full success. |
| Truncated final receipt | Incomplete last line is ignored as an item; completed preceding receipts remain recoverable. |
| Existing identical video | Existing file wins regardless of requested quality; no overwrite or upgrade. |
| Conflicting destination | Error retains recovery information; existing bytes and metadata remain untouched. |
| Stale indexed file | Missing indexed media is not treated as present when constructing the local inventory skip set. |
| Imported missing-file ID | Historical archive still skips it; the app does not invent a playable row or repair it automatically. |
| Read-only/missing root | Fail before download where detectable; never create a replacement directory for a missing mount root. |
| ENOSPC/rename/archive-write failure | No false success; published files survive; unresolved receipts/work remain available for recovery. |
| Escaping/symlink path | Reject publication outside the validated destination and reject unsafe cleanup targets. |
| Large logs | Bound memory and disk usage; log endpoint remains bounded; secret redaction still works across chunk boundaries. |

Verify media and info JSON IDs agree. The archive must contain only imported history,
verified existing files, and successfully published files. Assert its actual content;
checking that an archive-write helper was called is insufficient.

Exercise these crash boundaries individually:

1. Child completed a file, but no complete receipt exists yet.
2. Complete receipt exists, but pending scan state has not been persisted.
3. Pending scan state persisted, but publication has not occurred.
4. Folder renamed, but authoritative archive update has not occurred.
5. Archive updated, but finalization state has not been committed.
6. Finalization committed, but ingestion has not started.
7. Ingestion started, but the process stops before recording its outcome.

On recovery, completed files with valid receipts are finalized idempotently. Files
without a valid receipt may require retry and must never be falsely archived. Replaying
recovery twice must not duplicate files, lose archive entries, or erase pending scans.

Cancellation tests must cover a queued job, active transfer, postprocessing descendant,
and finalization. Keep the reservation until the child/descendant is gone and completed
receipts are handled. Check for actual surviving PIDs in the Linux container test.
Repeated cancellation is safe. Explicit cancellation is shown as cancelled, and unexpected
process shutdown as interrupted; successful files remain accessible after either.

## 5. Liked membership and ordering

The principal end-to-end fixture is a channel video that is already archived and indexed,
with watch progress. A Liked discovery includes that ID. After the Liked run:

- There is still one physical media file and one `Video` row with the same path.
- The video appears in both Channel and Liked views, with the same watch progress.
- Download archive skipping does not suppress liked membership discovery.
- Home and Search do not gain duplicate results.

Also cover:

| Case | Expected behavior |
|---|---|
| Liked downloaded first, channel later | Channel source skips existing media and its uploader view can use the same video. |
| Liked membership before media | ID/order persists without a `Video` row; later ingestion makes it browseable. |
| Legacy liked-directory duplicate | Insert, update, and skipped physical-upsert paths all record membership without moving files. |
| Channel rescan | Existing likes/orders are retained. |
| Complete Liked snapshot | Prior absent IDs retain their relative order before current IDs, whose order is oldest-to-newest. |
| Removed/unliked/private item | Previously recorded membership and local media are retained. |
| Duplicate IDs/placeholders | Valid IDs deduplicate; invalid placeholders do not become records. |
| Empty successful snapshot | Historical likes are retained; no account-authentication failure is mistaken for an empty success. |
| Partial enumeration or cancellation | Existing membership/order remains unchanged; run fails/cancels visibly. |
| Discovery persisted, restart during apply | Transactional/idempotent replay does not lose or repeatedly append memberships. |
| Text order import | Valid not-yet-indexed IDs are accepted; a later complete account snapshot applies the documented ordering rule. |
| Paging/sorting/counts | Membership joins return stable pages/counts without a large SQL parameter list or stale media-type filtering. |
| Related/next navigation | All liked fallbacks use membership, including channel-stored videos. |

Test null orders, tied legacy orders, and repeated snapshots. Use ascending/descending
requests to catch accidental reversal. Verify live extractor order separately; do not
infer like order from video upload dates.

## 6. Queue, scheduling, and scan handoff

- Enabling or changing the interval sets now + interval; unchanged saves preserve the
  deadline; disabling clears it. Manual runs work while the schedule is disabled.
- A due tick atomically enqueues eligible enabled sources and advances the deadline.
  Multiple missed intervals produce one batch. Restart preserves the stored deadline.
- Concurrent Run now, Run all, and schedule ticks never create two active runs for the
  same source. Source order is deterministic; overlapping quality requests do not upgrade.
- Only one child download runs at a time. Existing scan/metadata/image jobs hold the
  reservation; queued downloads wait. Queued work alone does not block those jobs.
- Test one-off deduplication during active work and archive skipping after completion.
- Source edits leave queued snapshots unchanged. Disabling cancels queued attempts and
  lets an active attempt finish. Removal while active conflicts; history survives removal.
- Destination changes, skips, deletion, or missing mounts are revalidated at execution.
  Config edits cannot invalidate active/pending publication or scan work.
- Queue drain coalesces ingestion once per affected library, including files from partial
  or cancelled runs. A batch with no new files does not cause a scan.
- The internal awaited scan path and existing manual route share state/error cleanup.
  Assert no nested-lock deadlock and release after setup, execution, or finalization error.
- A resolved scan with nonempty `ScanResult.errors` is not reported as clean success.
  Transfer outcome remains distinct. Retry scan does not spawn yt-dlp.
- Restart processes unresolved publication and pending scans before new download claims.
  Skipped libraries leave an explained pending scan; enabling them allows reconciliation.
- Existing 48-hour scan settings/deadline remain independent. Manual/scheduled scans
  still work after downloader errors and cannot overlap active publication.
- Explicit retry creates new history with the same validated snapshot; old outcomes are
  retained. Resolve old publication first and revalidate destination/cookie availability.
- Shutdown stops timers/claims, terminates children, persists recoverable state, then exits.
  A forced kill followed by restart marks the old active attempt interrupted.

For scanner reconciliation, use existing indexed videos plus a traversal that encounters
an unreadable root or subtree. Ensure none of that library's unseen rows are marked
missing. Successfully traversed other libraries still reconcile normally. Retain skipped
library regression coverage. Inject `readdir` failure where permission tests are unreliable
under root, and also exercise a real disappearing/inaccessible directory in integration.

## 7. API, credentials, and maintenance

- Exercise every endpoint through Fastify: happy path, invalid body/ID, missing record,
  conflicting active operation, duplicate request, and unexpected service failure.
- Existing authentication protects download mutations, logs, and credentials. A config
  read/parse failure must fail closed. Intentional auth-disabled local use still works.
- Cookie upload validates size/format, writes privately and atomically, and never returns
  content. GET returns status only. Missing/expired cookies cause useful Liked job errors.
- Cookie replace/delete conflicts with relevant active work; yt-dlp's cookie-jar writes
  cannot race replacement. Test absence of cookie values in errors/logs/progress/history.
- Public-source cookies are optional; Liked always requires them. Upload status is not
  displayed as a verified login until an actual request has established authentication.
- Archive import and Danger Zone reset use the shared reservation. Reset refuses active
  jobs and preserves downloader/liked state as specified. History cleanup never removes
  unresolved runs, library media, shared archive, or cookies.
- Pagination/log limits cannot be bypassed with negative, huge, or malformed values.
  Neither endpoint accepts arbitrary filesystem paths.

## 8. Browser checks

Use a real browser against an isolated application and fake runner. Automate the core
flow with a small browser suite if tooling is added; otherwise record repeatable actions
and results. Component rendering snapshots alone do not satisfy these checks.

1. Fresh install: visit Downloads, follow library setup, create a source, choose quality
   and history, and Run now. Confirm queued, downloading, scanning, and final browse states.
2. Edit a source and toggle its schedule membership; change the shared interval and see
   the localized next run. Reload and confirm persistence.
3. Upload fake test cookies, preview/import lists/archive, and handle validation conflicts.
   Cookies never appear in page markup, copied logs, or network response bodies.
4. Submit a one-off URL with playlist parameters; exactly one video is queued.
5. Cancel/retry, partial source failure, and successful download with failed scan all show
   distinct actionable outcomes. Retry scan invokes ingestion only.
6. Inspect a channel-stored liked video in both views and confirm shared playback progress.
7. Simulate API failures: edited values remain, useful errors appear, polling recovers,
   and repeated clicks do not create duplicate attempts.
8. Check narrow mobile width, keyboard navigation, form labels, focus after validation,
   readable long source names/URLs, and bounded log display.
9. Recheck existing Configure, Home, Channel, Liked, Search, and Watch flows. Scan-only
   users can continue without completing any downloader setup.

## 9. Docker and bounded live acceptance

Build the actual final image from a clean dependency-install layer. The earlier pnpm
build-script failure makes a host-only build insufficient. Keep pinned package-manager
behavior and verify no secrets/reference cookies enter build context or image layers.

Use a separate Compose project/config with temporary database, runtime state, and library
volumes. Do not run destructive Compose commands against the owner's normal deployment.

Required checks:

- Fresh and pre-feature database startup, migration, health, frontend/API access, and
  schedule-disabled defaults in the final image.
- Actual Node, yt-dlp, EJS, and ffmpeg versions; no missing Python/JS components at runtime.
  Validate on the intended NAS architecture; do not claim other architectures were tested.
- Writable download destination works; a read-only scan-only destination remains browseable.
  Incorrect write permissions/missing roots produce a useful setup/job error.
- Container stop during a child/ffmpeg job leaves no orphan process; restart recovers valid
  receipts, pending scans, queue state, and archive data from persistent volumes.
- A forced termination after publication exercises real restart recovery, not only mocks.

Run small public live downloads in a disposable library: short, explicitly selected
videos and a tiny controlled playlist. Bound fixture size/count before starting, so an
acceptance check cannot launch a full channel archive. Test the actual app worker, not
only a handwritten yt-dlp command.

Validate 720p and 1080p caps with `ffprobe` on a video offering those resolutions;
validate Best against available formats. Lower resolutions are valid when the source
does not offer the cap. Confirm sidecars, final output paths, playable media, scan ingestion,
and the exact receipt format for the pinned yt-dlp version. A second run should publish
nothing. Changing quality then rerunning must leave the existing file unchanged.

Authenticated acceptance needs dedicated, explicitly supplied test credentials. Never use
the reference `cookies.txt` automatically. Verify Liked enumeration order, an already
downloaded channel video appearing in Liked without another transfer, and a missing/invalid
cookie failure. If credentials are unavailable, report this check as unverified; do not
substitute fake-runner success for live authenticated acceptance.

## 10. Completion report

At minimum, provide results for these commands (from their respective directories):

```text
backend:  pnpm exec prisma validate
backend:  pnpm exec prisma generate
backend:  pnpm build
backend:  pnpm test:scheduler
backend:  pnpm test:downloader       # add this script during implementation
frontend: pnpm build
```

Also provide migration-test results, browser-check evidence, the exact clean Docker build
and isolated startup commands, image/tool versions, live public results, and authenticated
results or the explicit missing prerequisite. The backend `pnpm test` now runs the combined automated suite. Old scanner/database
scripts alone are not proof of this feature.

The implementation handoff must include:

- What changed, including schema/migration and user-facing behavior.
- Automated pass/fail counts and any remaining failures.
- Crash/cancellation/scan-handoff evidence, including one real process restart.
- Docker/live checks actually performed; clearly separate unverified checks.
- NAS cutover instructions, including backup, initial scan, import, disabling old cron,
  small manual run, and only then enabling the schedule.

Do not declare all acceptance checks passed when Docker, browser, or authenticated checks
were skipped. State precisely what remains and why so the owner can finish verification.
