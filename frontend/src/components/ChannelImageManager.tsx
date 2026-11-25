import { useEffect, useState } from "react";
import {
	getChannelImageStatus,
	startChannelImageDownload,
} from "../lib/api";
import type { ChannelImageStatus } from "../types";
import { Button, Checkbox, ErrorBanner, ProgressBar, Section, Spinner, Stat, StatusBadge } from "./ui";

export default function ChannelImageManager() {
	const [status, setStatus] = useState<ChannelImageStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [starting, setStarting] = useState(false);
	const [includeAll, setIncludeAll] = useState(false);

	useEffect(() => {
		loadStatus(!status);
	}, [includeAll]);

	useEffect(() => {
		if (!status?.isRunning) return;

		const interval = setInterval(() => {
			loadStatus(false);
		}, 1000);

		return () => clearInterval(interval);
	}, [status?.isRunning]);

	const loadStatus = async (showLoading = true) => {
		if (showLoading) {
			setLoading(true);
		}

		try {
			const data = await getChannelImageStatus(includeAll);
			setStatus(data);
			setError(null);
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Failed to load channel image status"
			);
		} finally {
			if (showLoading) {
				setLoading(false);
			}
		}
	};

	const handleStart = async () => {
		if (starting || status?.isRunning) return;

		setStarting(true);
		setError(null);

		try {
			await startChannelImageDownload(includeAll);
			await loadStatus(false);
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Failed to start channel image download"
			);
		} finally {
			setStarting(false);
		}
	};

	return (
		<Section
			id="channel-images"
			title="Channel images"
			actions={status?.isRunning && <StatusBadge tone="active">Downloading</StatusBadge>}
		>
			{error && <ErrorBanner className="mb-3" onRetry={() => loadStatus()}>{error}</ErrorBanner>}
			{loading && !status ? <Spinner className="py-6" /> : status && (
				<div className="space-y-3">
					<div className="grid grid-cols-2 gap-2">
						<Stat label={includeAll ? "Channels" : "Channels (5+ videos)"} value={status.eligibleChannels} hint={`${status.completeChannels} complete`} />
						<Stat label="Missing images" value={status.missingEither} tone={status.missingEither ? "warn" : "good"}
							hint={`${status.missingAvatar} avatars · ${status.missingBanner} banners`} />
					</div>

					<div>
					<Checkbox
						label="Include channels with fewer than 5 videos"
						checked={includeAll}
						disabled={status.isRunning}
						onChange={(e) => setIncludeAll(e.target.checked)}
					/>
					</div>

					{status.isRunning && (
						<div className="space-y-1.5" aria-live="polite">
							<p className="font-mono text-[11px] text-zinc-400">
								{status.processed} / {status.totalEligible} · {status.avatarsDownloaded} avatars · {status.bannersDownloaded} banners · {status.failed} failed
							</p>
							<ProgressBar label="Channel image progress" value={status.processed} max={status.totalEligible} />
							{status.currentChannel && <p className="truncate font-mono text-[11px] text-zinc-500">{status.currentChannel}</p>}
						</div>
					)}

					{!status.isRunning && status.completedAt && (
						<p className="text-xs text-zinc-500">
							Last run: {status.processed} channels processed, {status.skipped} skipped, {status.avatarsDownloaded} avatars and {status.bannersDownloaded} banners downloaded.
						</p>
					)}

					{status.errors.length > 0 && (
						<div className="max-h-24 overflow-y-auto border-2 border-red-900 p-2 font-mono text-[11px] text-red-300">
							{status.errors.slice(-5).map((entry, i) => <p key={`${entry}-${i}`} className="break-words">{entry}</p>)}
						</div>
					)}

					<Button variant="primary" onClick={handleStart} disabled={starting || status.isRunning}>
						{starting ? "Starting…" : status.isRunning ? "Downloading…" : "Download channel images"}
					</Button>
				</div>
			)}
		</Section>
	);
}
