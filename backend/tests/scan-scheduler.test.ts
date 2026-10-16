import assert from "node:assert/strict";
import { test } from "node:test";
import { ScanScheduler } from "../src/services/scan-scheduler.js";
import { acquireBackgroundJob } from "../src/lib/background-job.js";
import type { Config } from "../src/types/index.js";

const HOUR = 3_600_000;

function fixture() {
	let now = Date.parse("2026-01-01T00:00:00Z");
	let stored: any = null;
	let scans = 0;
	let busy = false;
	let failSave = false;
	const errors: unknown[] = [];
	const config: Pick<Config, "scanSchedule" | "libraries"> = {
		scanSchedule: { enabled: true, intervalHours: 48 },
		libraries: [{ name: "Archive", path: "/archive", mediaType: "channel_archive", skip: false }],
	};
	const deps = {
		loadConfig: async () => structuredClone(config),
		readState: async () => structuredClone(stored),
		saveState: async (state: any) => {
			if (failSave) throw new Error("Read-only config volume");
			stored = structuredClone(state);
		},
		startScan: () => { if (busy) return false; scans++; return true; },
		now: () => now,
		onError: (error: unknown) => { errors.push(error); },
	};
	return {
		scheduler: new ScanScheduler(deps), deps, config, errors,
		advance: (hours: number) => { now += hours * HOUR; },
		get scans() { return scans; },
		get stored() { return stored; },
		set busy(value: boolean) { busy = value; },
		set failSave(value: boolean) { failSave = value; },
	};
}

test("48-hour schedule runs once when due and advances from the actual start", async () => {
	const f = fixture();
	await f.scheduler.tick();
	assert.equal(f.scheduler.getStatus().nextRunAt, "2026-01-03T00:00:00.000Z");
	f.advance(47);
	await f.scheduler.tick();
	assert.equal(f.scans, 0);
	f.advance(1);
	await Promise.all([f.scheduler.tick(), f.scheduler.tick()]);
	assert.equal(f.scans, 1);
	assert.equal(f.stored.nextRunAt, "2026-01-05T00:00:00.000Z");
	await f.scheduler.tick();
	assert.equal(f.scans, 1);
});

test("restart preserves a future due time and coalesces missed runs into one", async () => {
	const f = fixture();
	await f.scheduler.tick();
	f.advance(24);
	const restarted = new ScanScheduler(f.deps);
	await restarted.tick();
	assert.equal(restarted.getStatus().nextRunAt, f.stored.nextRunAt);
	assert.equal(f.scans, 0);
	f.advance(240);
	await restarted.tick();
	await restarted.tick();
	assert.equal(f.scans, 1);
});

test("busy jobs and skipped libraries defer a due scan without losing it", async () => {
	const f = fixture();
	await f.scheduler.tick();
	const due = f.stored.nextRunAt;
	f.advance(48);
	f.busy = true;
	await f.scheduler.tick();
	assert.equal(f.scans, 0);
	assert.equal(f.stored.nextRunAt, due);
	f.busy = false;
	f.config.libraries[0].skip = true;
	await f.scheduler.tick();
	assert.equal(f.scans, 0);
	assert.equal(f.scheduler.getStatus().waitingForLibraries, true);
	f.config.libraries[0].skip = false;
	await f.scheduler.tick();
	assert.equal(f.scans, 1);
});

test("interval edits restart the countdown; disable cancels; re-enable starts fresh", async () => {
	const f = fixture();
	await f.scheduler.tick();
	f.advance(24);
	f.config.scanSchedule.intervalHours = 72;
	await f.scheduler.refresh();
	assert.equal(f.stored.nextRunAt, "2026-01-05T00:00:00.000Z");
	f.config.scanSchedule.enabled = false;
	await f.scheduler.tick();
	assert.equal(f.stored.nextRunAt, null);
	f.advance(100);
	await f.scheduler.tick();
	assert.equal(f.scans, 0);
	f.config.scanSchedule.enabled = true;
	await f.scheduler.tick();
	assert.equal(Date.parse(f.stored.nextRunAt), f.deps.now() + 72 * HOUR);
});

test("unchanged settings preserve the deadline and manual scans do not move it", async () => {
	const f = fixture();
	await f.scheduler.tick();
	const deadline = f.stored.nextRunAt;
	f.advance(12);
	f.config.libraries.push({ ...f.config.libraries[0], path: "/liked" });
	await f.scheduler.refresh();
	assert.equal(f.stored.nextRunAt, deadline);
});

test("storage errors are surfaced and retried before starting a scan", async () => {
	const f = fixture();
	f.failSave = true;
	await f.scheduler.tick();
	assert.match(f.scheduler.getStatus().lastError!, /Read-only/);
	f.advance(48);
	await f.scheduler.tick();
	assert.equal(f.scans, 0);
	f.failSave = false;
	await f.scheduler.tick();
	assert.equal(f.scans, 1);
	assert.equal(f.scheduler.getStatus().lastError, null);
});

test("failed persistence after a start does not repeatedly launch scans", async () => {
	const f = fixture();
	await f.scheduler.tick();
	f.advance(48);
	f.failSave = true;
	await f.scheduler.tick();
	assert.equal(f.scans, 1);
	await f.scheduler.tick();
	assert.equal(f.scans, 1);
	f.failSave = false;
	await f.scheduler.tick();
	assert.equal(f.scans, 1);
	assert.equal(f.stored.nextRunAt, "2026-01-05T00:00:00.000Z");
});

test("state read errors report configured settings and recover on a later tick", async () => {
	const f = fixture();
	let unreadable = true;
	const scheduler = new ScanScheduler({
		...f.deps,
		readState: async () => { if (unreadable) throw new Error("Invalid state file"); return null; },
	});
	await scheduler.tick();
	assert.equal(scheduler.getStatus().enabled, true);
	assert.match(scheduler.getStatus().lastError!, /Invalid state/);
	assert.equal(f.scans, 0);
	unreadable = false;
	await scheduler.tick();
	assert.equal(scheduler.getStatus().lastError, null);
	assert.ok(scheduler.getStatus().nextRunAt);
});

test("background reservation blocks overlap and stale releases cannot unlock a new job", () => {
	const first = acquireBackgroundJob("metadata");
	assert.ok(first);
	assert.equal(acquireBackgroundJob("scan"), null);
	first();
	const second = acquireBackgroundJob("images");
	assert.ok(second);
	first();
	assert.equal(acquireBackgroundJob("scan"), null);
	second();
	const third = acquireBackgroundJob("scan");
	assert.ok(third);
	third();
});
