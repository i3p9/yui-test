import { useEffect, useState } from "react";
import { getScanStatus } from "../lib/api";
import type { ScanProgress as ScanProgressType } from "../types";
import { ProgressBar, Stat, StatusBadge } from "./ui";
import { formatDuration } from "../utils/format";

interface ScanProgressProps {
	onScanComplete: () => void;
	onStatusChange: (isScanning: boolean) => void;
}

export function ScanProgress({
	onScanComplete,
	onStatusChange,
}: ScanProgressProps) {
	const [status, setStatus] = useState<ScanProgressType | null>(null);
	const [wasRunning, setWasRunning] = useState(false);

	useEffect(() => {
		const fetchStatus = async () => {
			try {
				const data = await getScanStatus();
				setStatus(data);

				// Notify parent of scanning state
				onStatusChange(data.isRunning);

				// Detect scan completion
				if (wasRunning && !data.isRunning) {
					onScanComplete();
				}
				setWasRunning(data.isRunning);
			} catch (err) {
				console.error("Failed to fetch scan status:", err);
			}
		};

		// Initial fetch
		fetchStatus();

		// Keep watching while idle so scheduled scans appear automatically.
		const interval = setInterval(fetchStatus, status?.isRunning ? 1000 : 5000);

		return () => {
			clearInterval(interval);
		};
	}, [wasRunning, onScanComplete, onStatusChange, status?.isRunning]);

	if (!status || !status.isRunning) {
		return (
			<div className='flex h-full min-h-32 flex-col items-center justify-center border-2 border-dashed border-zinc-800 p-4 text-center'>
				<p className="text-sm text-zinc-500">{status ? "No scan running" : "Loading…"}</p>
				
			</div>
		);
	}

	const elapsed = status.startedAt ? Math.floor((Date.now() - new Date(status.startedAt).getTime()) / 1000) : 0;
	const phaseLabels: Record<string, string> = { scanning: "Scanning media files", thumbnails: "Generating thumbnails", metadata: "Fetching metadata", complete: "Complete" };
	const phaseLabel = phaseLabels[status.phase ?? ""] ?? "Working";
	const current = status.phase === "scanning" ? status.currentLibrary : status.phase === "thumbnails" ? status.currentThumbnail : status.currentMetadata;
	const bar = status.phase === "thumbnails" ? { value: status.thumbnailsGenerated, max: status.thumbnailsTotal }
		: status.phase === "metadata" ? { value: status.metadataFetched, max: status.metadataTotal } : {};
	const stats: [string, number | string | undefined, "default" | "good" | "warn" | "bad"][] =
		status.phase === "thumbnails" ? [["From images", status.thumbnailsFromOriginal, "default"], ["Extracted", status.thumbnailsFromExtraction, "default"], ["Failed", status.thumbnailsFailed, "bad"]]
		: status.phase === "metadata" ? [["Fetched", status.metadataFetched, "good"], ["Thumbs", status.metadataThumbnailsFetched, "default"], ["Failed", status.metadataFailed, "bad"]]
		: [["Scanned", status.videosScanned, "default"], ["Added", status.videosAdded, "good"], ["Updated", status.videosUpdated, "default"]];

	return (
		<div className='space-y-3 border-2 border-red-800 bg-red-950/10 p-3' aria-live='polite'>
			<div className='flex flex-wrap items-center justify-between gap-2'>
				<div className='flex items-center gap-2'>
					<StatusBadge tone='active'>{status.mode}</StatusBadge>
					<span className='text-sm font-bold'>{phaseLabel}</span>
				</div>
				<span className='font-mono text-xs tabular-nums text-zinc-400'>{formatDuration(elapsed)}</span>
			</div>
			<ProgressBar label='Scan progress' {...bar} />
			{current && <p className='truncate font-mono text-[11px] text-zinc-400' title={current}>{current}</p>}
			<div className='grid grid-cols-3 gap-2'>
				{stats.map(([l, v, tone]) => <Stat key={l} label={l} value={v ?? 0} tone={tone} />)}
			</div>
			{status.libraryPath && <p className='truncate font-mono text-[11px] text-zinc-500'>Path {status.libraryPath}</p>}
			{status.errors.length > 0 && (
				<div className='max-h-28 overflow-y-auto border-2 border-red-900 p-2 text-xs text-red-300'>
					<p className='font-bold'>Errors ({status.errors.length})</p>
					{status.errors.slice(0, 5).map((error, i) => <p key={i} className='break-words font-mono'>{error}</p>)}
					{status.errors.length > 5 && <p>… and {status.errors.length - 5} more</p>}
				</div>
			)}
		</div>
	);
}
