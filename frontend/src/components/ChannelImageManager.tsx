import { useEffect, useState } from "react";
import {
	getChannelImageStatus,
	startChannelImageDownload,
} from "../lib/api";
import type { ChannelImageStatus } from "../types";

export default function ChannelImageManager() {
	const [status, setStatus] = useState<ChannelImageStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [starting, setStarting] = useState(false);

	useEffect(() => {
		loadStatus();
	}, []);

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
			const data = await getChannelImageStatus();
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
			await startChannelImageDownload();
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

	if (loading) {
		return (
			<div className="border-4 border-zinc-900 bg-zinc-950 p-6 shadow-[10px_10px_0_0_#09090b]">
				<div className="text-center text-zinc-500">
					Loading channel image status...
				</div>
			</div>
		);
	}

	const progressPercent =
		status && status.totalEligible > 0
			? Math.round((status.processed / status.totalEligible) * 100)
			: 0;

	return (
		<div className="border-4 border-zinc-900 bg-zinc-950 p-6 shadow-[10px_10px_0_0_#09090b]">
			<div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div>
					<p className="text-xs font-mono uppercase tracking-[0.3em] text-zinc-500">
						Channel Images
					</p>
					<h2 className="mt-2 text-lg font-black uppercase tracking-widest text-white">
						Avatar + Banner Fetch
					</h2>
					<p className="mt-2 max-w-3xl text-sm text-zinc-400">
						Actively downloads proper channel avatars and banners with
						yt-dlp for channels with at least 5 videos. V1 is fill
						missing only: existing images are skipped and not refreshed.
					</p>
				</div>

				{status?.isRunning && (
					<div className="border-2 border-cyan-600 bg-cyan-950 px-4 py-2">
						<span className="text-xs font-mono uppercase tracking-[0.2em] text-cyan-300">
							● Downloading
						</span>
					</div>
				)}
			</div>

			{error && (
				<div className="mb-6 border-2 border-red-600 bg-red-950 p-4 shadow-[4px_4px_0_0_#09090b]">
					<p className="text-xs font-mono uppercase tracking-[0.2em] text-red-300">
						⚠ Error
					</p>
					<p className="mt-2 text-sm text-red-200">{error}</p>
				</div>
			)}

			{status && (
				<div className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-5">
						<div className="border-2 border-zinc-800 bg-zinc-950 p-4 shadow-[4px_4px_0_0_#09090b]">
							<p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">
								Eligible
							</p>
							<p className="mt-2 text-2xl font-black text-white">
								{status.eligibleChannels}
							</p>
						</div>
						<div className="border-2 border-zinc-800 bg-zinc-950 p-4 shadow-[4px_4px_0_0_#09090b]">
							<p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">
								Complete
							</p>
							<p className="mt-2 text-2xl font-black text-green-400">
								{status.completeChannels}
							</p>
						</div>
						<div className="border-2 border-zinc-800 bg-zinc-950 p-4 shadow-[4px_4px_0_0_#09090b]">
							<p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">
								Missing Either
							</p>
							<p className="mt-2 text-2xl font-black text-amber-400">
								{status.missingEither}
							</p>
						</div>
						<div className="border-2 border-zinc-800 bg-zinc-950 p-4 shadow-[4px_4px_0_0_#09090b]">
							<p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">
								Missing Avatar
							</p>
							<p className="mt-2 text-2xl font-black text-cyan-400">
								{status.missingAvatar}
							</p>
						</div>
						<div className="border-2 border-zinc-800 bg-zinc-950 p-4 shadow-[4px_4px_0_0_#09090b]">
							<p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">
								Missing Banner
							</p>
							<p className="mt-2 text-2xl font-black text-fuchsia-400">
								{status.missingBanner}
							</p>
						</div>
					</div>

					{status.isRunning && (
						<div className="border-2 border-cyan-600 bg-zinc-950 p-4 shadow-[4px_4px_0_0_#09090b]">
							<div className="mb-3 flex items-center justify-between">
								<p className="text-xs font-mono uppercase tracking-[0.2em] text-cyan-400">
									Download Progress
								</p>
								<p className="text-xs font-mono text-zinc-400">
									{status.processed} / {status.totalEligible}
								</p>
							</div>

							<div className="h-3 border-2 border-zinc-800 bg-zinc-900">
								<div
									className="h-full bg-gradient-to-r from-cyan-600 to-blue-500 transition-all duration-300"
									style={{ width: `${progressPercent}%` }}
								/>
							</div>

							<div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono md:grid-cols-5">
								<div>
									<span className="text-zinc-500">Skipped:</span>{" "}
									<span className="text-zinc-200">
										{status.skipped}
									</span>
								</div>
								<div>
									<span className="text-zinc-500">Avatars:</span>{" "}
									<span className="text-green-400">
										{status.avatarsDownloaded}
									</span>
								</div>
								<div>
									<span className="text-zinc-500">Banners:</span>{" "}
									<span className="text-cyan-400">
										{status.bannersDownloaded}
									</span>
								</div>
								<div>
									<span className="text-zinc-500">Failed:</span>{" "}
									<span className="text-red-400">
										{status.failed}
									</span>
								</div>
								<div>
									<span className="text-zinc-500">Mode:</span>{" "}
									<span className="text-amber-300">
										Fill missing
									</span>
								</div>
							</div>

							{status.currentChannel && (
								<div className="mt-3 border-t border-zinc-800 pt-3">
									<p className="text-xs font-mono text-zinc-500">
										Current:
									</p>
									<p className="mt-1 truncate text-xs font-mono text-white">
										{status.currentChannel}
									</p>
								</div>
							)}
						</div>
					)}

					{!status.isRunning && status.completedAt && (
						<div className="border-2 border-zinc-700 bg-zinc-900 p-4">
							<p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">
								Last Run
							</p>
							<p className="mt-2 text-sm text-zinc-300">
								Processed {status.processed} qualifying channels, skipped{" "}
								{status.skipped}, downloaded {status.avatarsDownloaded} avatars
								and {status.bannersDownloaded} banners.
							</p>
						</div>
					)}

					{status.errors.length > 0 && (
						<div className="border-2 border-red-800 bg-zinc-950 p-4 shadow-[4px_4px_0_0_#09090b]">
							<p className="text-xs font-mono uppercase tracking-[0.2em] text-red-300">
								Recent Errors
							</p>
							<div className="mt-3 space-y-2">
								{status.errors.slice(-5).map((entry, index) => (
									<p
										key={`${entry}-${index}`}
										className="text-xs font-mono text-zinc-300"
									>
										{entry}
									</p>
								))}
							</div>
						</div>
					)}

					<button
						onClick={handleStart}
						disabled={starting || status.isRunning}
						className={`w-full border-4 px-6 py-4 font-black uppercase tracking-[0.3em] transition-colors ${
							starting || status.isRunning
								? "cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-500"
								: "border-cyan-600 bg-cyan-950 text-cyan-300 hover:border-cyan-500 hover:text-cyan-200"
						}`}
					>
						{starting
							? "Starting..."
							: status.isRunning
								? "Download In Progress"
								: "Download Channel Images"}
					</button>
				</div>
			)}
		</div>
	);
}
