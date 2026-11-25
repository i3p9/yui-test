import { useEffect, useState } from "react";
import { getScanHistory } from "../lib/api";
import type { ScanLog } from "../types";
import { Button, ErrorBanner, Section, Spinner, StatusBadge } from "./ui";

export function ScanHistory() {
	const [history, setHistory] = useState<ScanLog[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadHistory = () => {
		setLoading(true);
		getScanHistory()
			.then(setHistory)
			.catch((err) => setError(err.message))
			.finally(() => setLoading(false));
	};

	useEffect(() => {
		loadHistory();
	}, []);

	const formatDate = (dateString: string) => {
		const date = new Date(dateString);
		return date.toLocaleString(undefined, {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const formatDuration = (
		startedAt: string,
		endedAt: string | null
	) => {
		if (!endedAt) return "running";

		const start = new Date(startedAt).getTime();
		const end = new Date(endedAt).getTime();

		const totalMs = end - start;
		const totalSeconds = Math.floor(totalMs / 1000);
		const mins = Math.floor(totalSeconds / 60);
		const secs = totalSeconds % 60;
		const ms = totalMs % 1000;

		if (mins > 0) return `${mins}m ${secs}s`;
		if (secs > 0) return `${secs}s`;
		return `${ms}ms`;
	};

	const tone = (status: string) =>
		status === "completed" ? "success" : status === "running" ? "active" : status === "failed" ? "error" : "neutral";
	const firstError = (errors: string) => { try { return JSON.parse(errors)[0] || "Unknown error"; } catch { return errors; } };

	return (
		<Section
			id="scan-history"
			title="Recent scans"
			actions={<Button size="sm" variant="ghost" onClick={loadHistory}>Refresh</Button>}
		>
			{error ? <ErrorBanner onRetry={loadHistory}>{error}</ErrorBanner>
				: loading && !history.length ? <Spinner className="py-6" />
				: !history.length ? <p className="text-sm text-zinc-500">No scans yet.</p>
				: (
				<ul className="-my-2 divide-y divide-zinc-900">
					{history.slice(0, 8).map((scan) => (
						<li key={scan.id} className="py-2">
							<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto]">
								<div><StatusBadge tone={tone(scan.status)}>{scan.status}</StatusBadge></div>
								<div className="order-last col-span-2 min-w-0 sm:order-none sm:col-span-1">
									<p className="truncate text-sm">
										<span className="font-semibold capitalize">{scan.mode}</span>
										<span className="text-zinc-500"> · {scan.libraryPath ? scan.libraryPath.replace(/.*\//, "") : "All libraries"}</span>
									</p>
									<p className="font-mono text-[11px] text-zinc-500">
										{scan.videosScanned || 0} scanned · {scan.videosAdded || 0} added · {scan.videosUpdated || 0} updated
									</p>
								</div>
								<div className="text-right font-mono text-[11px] text-zinc-500">
									<div>{formatDate(scan.startedAt)}</div>
									<div>{formatDuration(scan.startedAt, scan.endedAt)}</div>
								</div>
							</div>
							{scan.errors && <p className="mt-1 break-words text-xs text-red-300">{firstError(scan.errors)}</p>}
						</li>
					))}
				</ul>
			)}
		</Section>
	);
}
