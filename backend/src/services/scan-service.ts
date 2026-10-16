import { acquireBackgroundJob } from "../lib/background-job.js";
import { scanState } from "../lib/scan-state.js";
import { channelImageState } from "../lib/channel-image-state.js";
import { ScanOrchestrator } from "./scan-orchestrator.js";

// Shared entry point for manual and scheduled scans.
export function startScan(options: {
	libraryPath?: string;
	mode: "full" | "incremental";
}): boolean {
	if (scanState.getState().isRunning || channelImageState.getState().isRunning) return false;
	const release = acquireBackgroundJob("scan");
	if (!release) return false;
	scanState.reset();
	scanState.updateProgress({ isRunning: true, mode: options.mode, phase: "scanning" });
	void Promise.resolve()
		.then(() => new ScanOrchestrator().scan(options))
		.catch((error) => {
			console.error("Scan failed:", error);
			scanState.updateProgress({ errors: [String(error)] });
		})
		.finally(() => {
			scanState.complete();
			release();
		});
	return true;
}
