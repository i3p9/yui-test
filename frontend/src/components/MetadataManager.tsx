import { useEffect, useState } from "react";
import {
	getMetadataStats,
	startMetadataFetch,
	getMetadataFetchStatus,
} from "../lib/api";
import type { MetadataStats, MetadataFetchStatus } from "../types";

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

	if (loading) {
		return (
			<div className='border-4 border-zinc-900 bg-zinc-950 p-6 shadow-[10px_10px_0_0_#09090b]'>
				<div className='text-center text-zinc-500'>
					Loading metadata stats...
				</div>
			</div>
		);
	}

	const hasIncompleteMetadata =
		stats &&
		(stats.incompleteWithVideoId > 0 ||
			stats.generatedThumbnailsCount > 0);

	return (
		<div className='border-4 border-zinc-900 bg-zinc-950 p-6 shadow-[10px_10px_0_0_#09090b]'>
			{/* Header */}
			<div className='mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
				<div>
					<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>
						Metadata Management
					</p>
					<h2 className='mt-2 text-lg font-black uppercase tracking-widest text-white'>
						Missing Metadata
					</h2>
				</div>

				{fetching && (
					<div className='border-2 border-cyan-600 bg-cyan-950 px-4 py-2'>
						<span className='text-xs font-mono uppercase tracking-[0.2em] text-cyan-300'>
							● Fetching
						</span>
					</div>
				)}
			</div>

			{/* Error */}
			{error && (
				<div className='mb-6 border-2 border-red-600 bg-red-950 p-4 shadow-[4px_4px_0_0_#09090b]'>
					<p className='text-xs font-mono uppercase tracking-[0.2em] text-red-300'>
						⚠ Error
					</p>
					<p className='mt-2 text-sm text-red-200'>{error}</p>
				</div>
			)}

			{/* Stats */}
			{stats && (
				<div className='space-y-4'>
					{/* Stats Grid */}

					<div className='grid gap-4 sm:grid-cols-4'>
						<div className='border-2 border-zinc-800 bg-zinc-950 p-4 shadow-[4px_4px_0_0_#09090b]'>
							<p className='text-xs font-mono uppercase tracking-[0.2em] text-zinc-500'>
								Generated Thumbnails
							</p>
							<p className='mt-2 text-2xl font-black text-green-400'>
								{stats.generatedThumbnailsCount}
							</p>
						</div>
						<div className='border-2 border-zinc-800 bg-zinc-950 p-4 shadow-[4px_4px_0_0_#09090b]'>
							<p className='text-xs font-mono uppercase tracking-[0.2em] text-zinc-500'>
								Incomplete w/ ID
							</p>
							<p className='mt-2 text-2xl font-black text-cyan-400'>
								{stats.incompleteWithVideoId}
							</p>
						</div>

						<div className='border-2 border-zinc-800 bg-zinc-950 p-4 shadow-[4px_4px_0_0_#09090b]'>
							<p className='text-xs font-mono uppercase tracking-[0.2em] text-zinc-500'>
								From Filename Only
							</p>
							<p className='mt-2 text-2xl font-black text-amber-400'>
								{stats.fromFilename}
							</p>
						</div>

						<div className='border-2 border-zinc-800 bg-zinc-950 p-4 shadow-[4px_4px_0_0_#09090b]'>
							<p className='text-xs font-mono uppercase tracking-[0.2em] text-zinc-500'>
								Total Incomplete
							</p>
							<p className='mt-2 text-2xl font-black text-red-400'>
								{(stats.incompleteTotal || 0) +
									(stats.generatedThumbnailsCount || 0)}
							</p>
						</div>
					</div>

					{/* Progress Bar (when fetching) */}
					{fetching &&
						fetchStatus &&
						fetchStatus.metadataTotal !== undefined && (
							<div className='border-2 border-cyan-600 bg-zinc-950 p-4 shadow-[4px_4px_0_0_#09090b]'>
								<div className='mb-3 flex items-center justify-between'>
									<p className='text-xs font-mono uppercase tracking-[0.2em] text-cyan-400'>
										Fetching Progress
									</p>
									<p className='text-xs font-mono text-zinc-400'>
										{fetchStatus.metadataFetched || 0} /{" "}
										{fetchStatus.metadataTotal}
									</p>
								</div>

								{/* Progress Bar */}
								<div className='h-3 border-2 border-zinc-800 bg-zinc-900'>
									<div
										className='h-full bg-gradient-to-r from-cyan-600 to-cyan-500 transition-all duration-300'
										style={{
											width: `${
												((fetchStatus.metadataFetched || 0) /
													fetchStatus.metadataTotal) *
												100
											}%`,
										}}
									/>
								</div>

								{/* Details */}
								<div className='mt-3 grid grid-cols-3 gap-2 text-xs font-mono'>
									<div>
										<span className='text-zinc-500'>Completed:</span>{" "}
										<span className='text-green-400'>
											{fetchStatus.metadataFetched || 0}
										</span>
									</div>
									<div>
										<span className='text-zinc-500'>Failed:</span>{" "}
										<span className='text-red-400'>
											{fetchStatus.metadataFailed || 0}
										</span>
									</div>
									<div>
										<span className='text-zinc-500'>Thumbs:</span>{" "}
										<span className='text-blue-400'>
											{fetchStatus.metadataThumbnailsFetched || 0}
										</span>
									</div>
								</div>

								{/* Current Video */}
								{fetchStatus.currentMetadata && (
									<div className='mt-3 border-t border-zinc-800 pt-3'>
										<p className='text-xs font-mono text-zinc-500'>
											Current:
										</p>
										<p className='mt-1 truncate text-xs font-mono text-white'>
											{fetchStatus.currentMetadata}
										</p>
									</div>
								)}
							</div>
						)}

					{/* Info Box */}
					<div className='border-2 border-cyan-800 bg-zinc-950 p-4 shadow-[4px_4px_0_0_#09090b]'>
						<p className='text-xs font-mono uppercase tracking-[0.2em] text-cyan-400'>
							ℹ Info
						</p>
						<p className='mt-2 text-sm text-zinc-300'>
							Videos with incomplete metadata are missing information
							like title, uploader, upload date, or duration. Fetch
							missing metadata from YouTube using yt-dlp.
						</p>
						<p className='mt-2 text-sm text-zinc-400'>
							Metadata can be saved either in each video's folder or
							centrally in the{" "}
							<code className='text-cyan-400'>.metadata/</code>{" "}
							directory. Choose your preference below.
						</p>
					</div>

					{/* Save Metadata to Video Folder */}
					<div>
						<label
							className={`flex items-center gap-3 border-2 p-3 transition-colors ${
								stats?.canWriteToLibraries
									? "cursor-pointer border-zinc-800 bg-zinc-900 hover:border-zinc-700"
									: "cursor-not-allowed border-zinc-800 bg-zinc-900/50 opacity-60"
							}`}
						>
							<input
								type='checkbox'
								checked={saveLocation === "with_video"}
								onChange={(e) =>
									setSaveLocation(
										e.target.checked ? "with_video" : "app_data"
									)
								}
								disabled={!stats?.canWriteToLibraries}
								className='h-4 w-4 accent-red-500'
							/>
							<div>
								<p className={`text-sm font-bold ${stats?.canWriteToLibraries ? "text-white" : "text-zinc-500"}`}>
									Save Metadata to Video Folder {stats?.canWriteToLibraries ? "(Recommended)" : "(Read-Only)"}
								</p>
								<p className='text-xs font-mono text-zinc-500'>
									{!stats?.canWriteToLibraries
										? "Libraries are mounted read-only"
										: saveLocation === "with_video"
										? "Saves metadata to the respective video folder"
										: "Saves metadata to the .metadata/ directory"}
								</p>
							</div>
						</label>
						{!stats?.canWriteToLibraries && (
							<p className='mt-2 text-xs font-mono text-amber-500'>
								All libraries are read-only. Metadata will be saved to app data directory.
							</p>
						)}
					</div>

					{/* Fetch Button */}
					<button
						onClick={handleFetchMetadata}
						disabled={fetching || !hasIncompleteMetadata}
						className={`w-full border-4 px-6 py-4 font-black uppercase tracking-[0.3em] transition-colors ${
							fetching || !hasIncompleteMetadata
								? "cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-500"
								: "border-cyan-600 bg-cyan-950 text-cyan-300 hover:border-cyan-500 hover:text-cyan-200"
						}`}
					>
						{fetching
							? "Fetching Metadata..."
							: hasIncompleteMetadata
							? "Fetch Missing Metadata"
							: "All Metadata Complete"}
					</button>
				</div>
			)}
		</div>
	);
}
