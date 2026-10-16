import { readFile, writeFile, rename } from "fs/promises";
import { z } from "zod";
import { getConfigPath, loadConfig } from "../lib/config.js";
import type { Config, ScanSchedule } from "../types/index.js";
import { startScan } from "./scan-service.js";

const HOUR_MS = 60 * 60 * 1000;
const StateSchema = z.object({
	enabled: z.boolean(),
	intervalHours: z.number().int().min(1).max(8760),
	nextRunAt: z.iso.datetime().nullable(),
});
type ScheduleState = z.infer<typeof StateSchema>;

interface SchedulerDependencies {
	loadConfig: () => Promise<Pick<Config, "scanSchedule" | "libraries">>;
	readState: () => Promise<ScheduleState | null>;
	saveState: (state: ScheduleState) => Promise<void>;
	startScan: () => boolean;
	now: () => number;
	onError: (error: unknown) => void;
}

export class ScanScheduler {
	private state: ScheduleState | null = null;
	private settings: ScanSchedule = { enabled: false, intervalHours: 48 };
	private loaded = false;
	private dirty = false;
	private pending: Promise<void> | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private waitingForLibraries = false;
	private lastError: string | null = null;

	constructor(private deps: SchedulerDependencies) {}

	async start(): Promise<void> {
		await this.tick();
		if (!this.timer) {
			this.timer = setInterval(() => { void this.tick(); }, 60_000);
			this.timer.unref();
		}
	}

	async stop(): Promise<void> {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		await this.pending;
	}

	getStatus() {
		return {
			...this.settings,
			nextRunAt: this.state?.nextRunAt ?? null,
			waitingForLibraries: this.waitingForLibraries,
			lastError: this.lastError,
		};
	}

	async refresh(): Promise<void> {
		await this.pending;
		await this.tick();
	}

	// A short polling interval avoids Node's ~24.8-day timeout limit and lets
	// settings saved through the API take effect without a restart. Missed runs coalesce.
	tick(): Promise<void> {
		if (this.pending) return this.pending;
		this.pending = this.check()
			.then(() => { this.lastError = null; })
			.catch((error) => {
				this.lastError = String(error);
				this.deps.onError(error);
			})
			.finally(() => { this.pending = null; });
		return this.pending;
	}

	private async persist(): Promise<void> {
		if (!this.state) return;
		this.dirty = true;
		await this.deps.saveState(this.state);
		this.dirty = false;
	}

	private async check(): Promise<void> {
		const config = await this.deps.loadConfig();
		this.settings = config.scanSchedule;
		if (!this.loaded) {
			this.state = await this.deps.readState();
			this.loaded = true;
		}
		const { enabled, intervalHours } = config.scanSchedule;
		this.waitingForLibraries = !config.libraries.some((library) => !library.skip);
		if (!this.state || this.state.enabled !== enabled || this.state.intervalHours !== intervalHours) {
			this.state = {
				enabled,
				intervalHours,
				nextRunAt: enabled ? new Date(this.deps.now() + intervalHours * HOUR_MS).toISOString() : null,
			};
			await this.persist();
		}
		if (this.dirty) await this.persist();
		if (!enabled || this.waitingForLibraries || !this.state.nextRunAt) return;
		if (this.deps.now() < Date.parse(this.state.nextRunAt)) return;

		// A busy job leaves the run due; retry on the next tick.
		if (!this.deps.startScan()) return;
		this.state.nextRunAt = new Date(this.deps.now() + intervalHours * HOUR_MS).toISOString();
		await this.persist();
	}
}

export const scanScheduler = new ScanScheduler({
	loadConfig,
	readState: async () => {
		try {
			return StateSchema.parse(JSON.parse(await readFile(`${getConfigPath()}.scan-schedule.json`, "utf-8")));
		} catch (error: any) {
			if (error.code === "ENOENT") return null;
			throw error;
		}
	},
	saveState: async (state) => {
		const statePath = `${getConfigPath()}.scan-schedule.json`;
		await writeFile(`${statePath}.tmp`, JSON.stringify(state, null, 2), "utf-8");
		await rename(`${statePath}.tmp`, statePath);
	},
	startScan: () => startScan({ mode: "incremental" }),
	now: Date.now,
	onError: (error) => console.error("Scan scheduler failed:", error),
});
