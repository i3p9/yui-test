import { acquireBackgroundJob } from "../lib/background-job.js";
import { scanState } from "../lib/scan-state.js";
import { channelImageState } from "../lib/channel-image-state.js";
import { ScanOrchestrator } from "./scan-orchestrator.js";
import type { ScanResult } from "../types/index.js";

type ScanOptions = { libraryPath?: string; mode: "full" | "incremental" };

// Reserve synchronously; both HTTP callers and internal workers share this lifecycle.
export function beginScan(options: ScanOptions): Promise<ScanResult> | null {
  if (scanState.getState().isRunning || channelImageState.getState().isRunning) return null;
  const release = acquireBackgroundJob("scan");
  if (!release) return null;
  scanState.reset();
  scanState.updateProgress({ isRunning: true, mode: options.mode, phase: "scanning" });
  return Promise.resolve().then(() => new ScanOrchestrator().scan(options))
    .catch(error => {
      scanState.updateProgress({ errors: [String(error)] });
      throw error;
    }).finally(() => { scanState.complete(); release(); });
}

export function startScan(options: ScanOptions): boolean {
  const completion = beginScan(options);
  if (!completion) return false;
  void completion.catch(error => console.error("Scan failed:", error));
  return true;
}
