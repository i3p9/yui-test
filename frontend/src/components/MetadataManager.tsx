import { useEffect, useState } from "react";
import {
	getMetadataStats,
	startMetadataFetch,
	getMetadataFetchStatus,
} from "../lib/api";
import type { MetadataStats, MetadataFetchStatus } from "../types";
import { Button, Checkbox, ErrorBanner, ProgressBar, Section, Spinner, Stat, StatusBadge } from "./ui";

export default function MetadataManager() {
	const [stats, setStats] = useState<MetadataStats | null>(null);
	const [fetchStatus, setFetchStatus] =
		useState<MetadataFetchStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [fetching, setFetching] = useState(false);
	const [saveLocation, setSaveLocation] = useState<
		"with_video" | "app_data"
	>("with_video");

	// Auto-switch to app_data if libraries are read-only
	useEffect(() => {
		if (stats && !stats.canWriteToLibraries && saveLocation === "with_video") {
			setSaveLocation("app_data");
		}
	}, [stats, saveLocation]);

	useEffect(() => {
		loadStats();
	}, []);

	// Poll fetch status while fetching
	useEffect(() => {
		if (!fetching) return;

		const interval = setInterval(() => {
			loadFetchStatus();
		}, 1000); // Poll every second

		return () => clearInterval(interval);
	}, [fetching]);

	const loadStats = async () => {
		setLoading(true);
		setError(null);
		try {
			const data = await getMetadataStats();
			setStats(data);
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Failed to load metadata stats"
			);
		} finally {
			setLoading(false);
		}
	};

	const loadFetchStatus = async () => {
		try {
			const status = await getMetadataFetchStatus();
			setFetchStatus(status);

			// If not running anymore, refresh stats and stop polling
			if (!status.isRunning && fetching) {
				setFetching(false);
				await loadStats();
			}
		} catch (err) {
			console.error("Failed to load fetch status:", err);
		}
	};

	const handleFetchMetadata = async () => {
		if (fetching) return;

		setFetching(true);
		setError(null);

		try {
			await startMetadataFetch(undefined, saveLocation);
			await loadFetchStatus();
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Failed to start metadata fetch"
			);
			setFetching(false);
		}
	};

	const hasIncompleteMetadata =
		!!stats && (stats.incompleteWithVideoId > 0 || stats.generatedThumbnailsCount > 0);

	return (
		<Section
			id="metadata"
			title="Missing metadata"
			actions={fetching && <StatusBadge tone="active">Fetching</StatusBadge>}
		>
			{error && <ErrorBanner className="mb-3" onRetry={loadStats}>{error}</ErrorBanner>}
			{loading && !stats ? <Spinner className="py-6" /> : stats && (
				<div className="space-y-3">
					<div className="grid grid-cols-2 gap-2">
						<Stat label="Incomplete, has ID" value={stats.incompleteWithVideoId} tone={stats.incompleteWithVideoId ? "warn" : "default"} />
						<Stat label="Generated thumbs" value={stats.generatedThumbnailsCount} />
						<Stat label="From filename only" value={stats.fromFilename} />
						<Stat label="Total incomplete" value={(stats.incompleteTotal || 0) + (stats.generatedThumbnailsCount || 0)} />
					</div>

					{fetching && fetchStatus && fetchStatus.metadataTotal !== undefined && (
						<div className="space-y-1.5" aria-live="polite">
							<div className="flex justify-between font-mono text-[11px] text-zinc-400">
								<span>{fetchStatus.metadataFetched || 0} / {fetchStatus.metadataTotal} · {fetchStatus.metadataFailed || 0} failed · {fetchStatus.metadataThumbnailsFetched || 0} thumbs</span>
							</div>
							<ProgressBar label="Metadata progress" value={fetchStatus.metadataFetched || 0} max={fetchStatus.metadataTotal} />
							{fetchStatus.currentMetadata && <p className="truncate font-mono text-[11px] text-zinc-500">{fetchStatus.currentMetadata}</p>}
						</div>
					)}

					<div className="flex flex-wrap items-center justify-between gap-3">
					<Checkbox
						label={stats.canWriteToLibraries ? "Save next to each video" : "Save next to each video (libraries are read-only)"}
						checked={saveLocation === "with_video"}
						disabled={!stats.canWriteToLibraries}
						onChange={(e) => setSaveLocation(e.target.checked ? "with_video" : "app_data")}
					/>

					<Button variant="primary" onClick={handleFetchMetadata} disabled={fetching || !hasIncompleteMetadata}>
						{fetching ? "Fetching…" : hasIncompleteMetadata ? "Fetch missing metadata" : "All metadata complete"}
					</Button>
					</div>
				</div>
			)}
		</Section>
	);
}
