# Automatic Library Scans

YUI can periodically ingest videos downloaded by another service. Enable this under
**Configure → Scan Controls → Automatic scans**, set the interval, and save.
Existing installations keep manual scanning until scheduling is enabled.

## Configuration

The application config accepts this optional top-level field:

```json
{
  "scanSchedule": {
    "enabled": false,
    "intervalHours": 48
  }
}
```

If omitted, it defaults to disabled with a 48-hour interval. The interval must be a
whole number from 1 to 8760 hours. The UI applies changes immediately. If editing
the JSON file directly, restart YUI to reload it.

The config location is `CONFIG_PATH` when set, otherwise `config.json` in the
backend's working directory. Local development normally uses `backend/config.json`;
Docker uses `/config/config.json`.

## Timing and scan behavior

- Enabling scheduling starts a new countdown. The first scan runs after the selected interval.
- Changing the interval restarts that countdown. Saving unchanged settings preserves it.
- Each scheduled scan starts the next countdown from its actual start time.
- Manual scans do not change the scheduled deadline.
- The scheduler checks once per minute. A due scan waits while another scan,
  metadata fetch, or channel image download is running, then retries on a later check.
- Scheduled scans cover all active libraries and use `mode: "incremental"`.
  Skipped libraries are not walked or marked missing by availability reconciliation.
  With no active libraries, the scan remains due until a library becomes active.
- Scheduled scans use the existing thumbnail and metadata options. Incremental mode
  still walks the library and uses the existing file-change detection; it does not
  introduce a directory manifest or a new scan algorithm.
- Scheduled scans appear in the usual progress panel and scan history.
- Disabling scheduling cancels future starts. An already running scan finishes.
- A failed scan is reported through scan progress/history and server logs. The next
  attempt follows the configured interval; scheduling/storage errors are also shown
  under the automatic scan controls.

This schedule runs inside the backend process. Keep YUI running; an open browser is
not required. Scheduling coordinates jobs within a single backend instance.

## Restarts and Docker

YUI saves the next run time in `config.json.scan-schedule.json` alongside the active
config file. Both files belong in a persistent, writable directory. The existing
Docker Compose `/config` volume preserves them across container recreation.

On startup, YUI resumes the saved deadline after database initialization. If several
intervals passed while it was stopped, it starts one overdue scan and schedules the
next interval from that start. It does not run a backlog of missed scans.

Keep the state file when backing up configuration. If it is missing, YUI starts a
fresh countdown. If it cannot be read or written, the scheduler reports the error
and retries on subsequent checks. Manual scanning remains available.

## API

The normal API authentication applies to these routes. Add an authorization header
to the examples if authentication is enabled.

Enable a 48-hour interval without changing other configuration:

```bash
curl -X PUT http://localhost:3001/api/config/scan-schedule \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true,"intervalHours":48}'
```

Read scheduling status:

```bash
curl http://localhost:3001/api/scan/schedule
```

The status response contains `enabled`, `intervalHours`, `nextRunAt` (UTC ISO time or
`null`), `waitingForLibraries`, and `lastError`. Invalid settings return HTTP 400
without changing the config. `GET /api/config` also includes `scanSchedule`.
`POST /api/config` accepts it; if omitted, the current schedule is preserved.

## Implementation and validation

- `backend/src/services/scan-scheduler.ts`: timing, saved deadlines, and deferred starts.
- `backend/src/services/scan-service.ts`: shared entry point for manual and scheduled scans.
- `backend/src/lib/background-job.ts`: reservations across scan, metadata, and image jobs.
- `frontend/src/components/ScanScheduleControls.tsx`: settings and next-run status.

Run focused tests and production builds:

```bash
cd backend
pnpm exec prisma generate
pnpm test:scheduler
pnpm build
cd ../frontend
pnpm build
```

Tests use temporary configuration/database files and a simulated clock; they do not
scan the configured media libraries or wait for real scheduling intervals.
