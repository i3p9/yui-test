import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import Fastify from "fastify";
import configRoutes from "../src/routes/config.js";
import scanRoutes from "../src/routes/scan.js";
import metadataRoutes from "../src/routes/metadata.js";
import { loadConfig, clearConfigCache } from "../src/lib/config.js";
import { scanScheduler } from "../src/services/scan-scheduler.js";
import { acquireBackgroundJob } from "../src/lib/background-job.js";
import { scanState } from "../src/lib/scan-state.js";
import { disconnectDatabase } from "../src/lib/database.js";
import { ScanOrchestrator } from "../src/services/scan-orchestrator.js";

test("scan scheduling API and pipeline integration with isolated config and database", async (t) => {
	const directory = await mkdtemp(join(tmpdir(), "yui-scheduler-test-"));
	const oldConfigPath = process.env.CONFIG_PATH;
	const oldDatabaseUrl = process.env.DATABASE_URL;
	process.env.CONFIG_PATH = join(directory, "config.json");
	process.env.DATABASE_URL = `file:${join(directory, "test.db")}`;
	clearConfigCache();
	const app = Fastify();
	try {
		await app.register(configRoutes, { prefix: "/api/config" });
		await app.register(scanRoutes, { prefix: "/api/scan" });
		await app.register(metadataRoutes, { prefix: "/api/metadata" });
		await app.ready();

		await t.test("old configs default to disabled with a 48-hour interval", async () => {
			const initial = await loadConfig();
			const { scanSchedule, ...legacy } = initial;
			await writeFile(process.env.CONFIG_PATH!, JSON.stringify(legacy));
			clearConfigCache();
			assert.deepEqual((await loadConfig()).scanSchedule, { enabled: false, intervalHours: 48 });
		});

		await t.test("invalid schedules return 400 and leave config untouched", async () => {
			const before = await readFile(process.env.CONFIG_PATH!, "utf-8");
			for (const intervalHours of [0, -1, 1.5, 8761, "48", null]) {
				const response = await app.inject({ method: "PUT", url: "/api/config/scan-schedule", payload: { enabled: true, intervalHours } });
				assert.equal(response.statusCode, 400);
			}
			const invalidBoolean = await app.inject({ method: "PUT", url: "/api/config/scan-schedule", payload: { enabled: "true", intervalHours: 48 } });
			assert.equal(invalidBoolean.statusCode, 400);
			assert.equal(await readFile(process.env.CONFIG_PATH!, "utf-8"), before);
		});

		await t.test("saving a schedule persists settings and deadline; library edits preserve them", async () => {
			const staleConfig = await loadConfig();
			const response = await app.inject({ method: "PUT", url: "/api/config/scan-schedule", payload: { enabled: true, intervalHours: 72 } });
			assert.equal(response.statusCode, 200);
			const status = response.json();
			assert.equal(status.enabled, true);
			assert.equal(status.waitingForLibraries, true);
			assert.ok(status.nextRunAt);
			const persisted = JSON.parse(await readFile(`${process.env.CONFIG_PATH}.scan-schedule.json`, "utf-8"));
			assert.equal(persisted.nextRunAt, status.nextRunAt);
			const { scanSchedule, ...libraryUpdate } = staleConfig;
			const update = await app.inject({ method: "POST", url: "/api/config", payload: libraryUpdate });
			assert.equal(update.statusCode, 200);
			assert.deepEqual((await loadConfig()).scanSchedule, { enabled: true, intervalHours: 72 });
			assert.equal((await app.inject("/api/scan/schedule")).json().nextRunAt, status.nextRunAt);
		});

		await t.test("manual scans respect the job guard, report setup progress, and recover from failure", async () => {
			const release = acquireBackgroundJob("metadata-preflight");
			assert.ok(release);
			const conflict = await app.inject({ method: "POST", url: "/api/scan", payload: {} });
			assert.equal(conflict.statusCode, 409);
			release();
			const invalid = await app.inject({ method: "POST", url: "/api/scan", payload: { mode: "other" } });
			assert.equal(invalid.statusCode, 400);
			// Progress is reserved synchronously, before asynchronous scan setup.
			const { startScan } = await import("../src/services/scan-service.js");
			assert.equal(startScan({ mode: "incremental" }), true);
			assert.equal(scanState.getState().isRunning, true);
			assert.equal(startScan({ mode: "full" }), false);
			for (let i = 0; i < 100 && scanState.getState().isRunning; i++) await setImmediate();
			assert.equal((await app.inject("/api/scan/status")).json().isRunning, false);
			assert.match(scanState.getState().errors[0], /No libraries found/);
			const unlocked = acquireBackgroundJob("verify-release");
			assert.ok(unlocked);
			unlocked();
		});

		await t.test("metadata preflight failures release the job reservation", async () => {
			// The isolated database intentionally has no tables.
			const response = await app.inject({ method: "POST", url: "/api/metadata/fetch", payload: { saveLocation: "app_data" } });
			assert.equal(response.statusCode, 500);
			const release = acquireBackgroundJob("verify-metadata-release");
			assert.ok(release);
			release();
		});

		await t.test("availability reconciliation excludes skipped libraries", async () => {
			const config = await loadConfig();
			await writeFile(process.env.CONFIG_PATH!, JSON.stringify({
				...config,
				libraries: [
					{ name: "Active", path: "/active", mediaType: "channel_archive", skip: false },
					{ name: "Skipped", path: "/skipped", mediaType: "channel_archive", skip: true },
				],
				scanOptions: { ...config.scanOptions, generateThumbnails: false, fetchMetadata: false },
			}));
			clearConfigCache();
			const orchestrator = new ScanOrchestrator() as any;
			const walked: string[] = [];
			const reconciled: string[] = [];
			orchestrator.scanner = {
				scanLibrary: async (library: { path: string }) => { walked.push(library.path); return []; },
				getCollectedChannelImages: () => [],
			};
			orchestrator.db = {
				createScanLog: async () => 1,
				markMissingVideos: async (_seen: Set<string>, path: string) => { reconciled.push(path); return 0; },
				rebuildFtsIndexes: async () => {},
				completeScanLog: async () => {},
			};
			await orchestrator.scan({ mode: "incremental" });
			assert.deepEqual(walked, ["/active"]);
			assert.deepEqual(reconciled, ["/active"]);
		});
	} finally {
		await scanScheduler.stop();
		await app.close();
		await disconnectDatabase();
		if (oldConfigPath === undefined) delete process.env.CONFIG_PATH;
		else process.env.CONFIG_PATH = oldConfigPath;
		if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL;
		else process.env.DATABASE_URL = oldDatabaseUrl;
		clearConfigCache();
		scanState.reset();
		await rm(directory, { recursive: true, force: true });
	}
});
