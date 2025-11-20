import { useEffect, useState } from "react";
import { getScanStatus } from "../lib/api";
import type { ScanProgress as ScanProgressType } from "../types";

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

		// Only poll if currently scanning
		let interval: ReturnType<typeof setInterval> | null = null;
		if (status?.isRunning || !status) {
			interval = setInterval(fetchStatus, 1000);
		}

		return () => {
			if (interval) clearInterval(interval);
		};
	}, [wasRunning, onScanComplete, onStatusChange, status?.isRunning]);

	if (!status) {
		return (
			<div className='border-4 border-zinc-900 bg-zinc-950 p-6 shadow-[10px_10px_0_0_#09090b]'>
				<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>Status Feed</p>
				<h2 className='mt-2 text-lg font-black uppercase tracking-widest text-white'>Scan Progress</h2>
				<p className='mt-6 text-xs font-mono uppercase tracking-widest text-zinc-500'>Loading...</p>
			</div>
		);
	}

	if (!status.isRunning) {
		return (
			<div className='border-4 border-zinc-900 bg-zinc-950 p-6 shadow-[10px_10px_0_0_#09090b]'>
				<div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
					<div>
						<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>Status Feed</p>
						<h2 className='mt-2 text-lg font-black uppercase tracking-widest text-white'>Scan Progress</h2>
					</div>
					<span className='inline-flex items-center gap-2 border-2 border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-black uppercase tracking-[0.2em] text-zinc-300'>
						<span className='inline-block h-2 w-2 bg-current' />
						Idle
					</span>
				</div>

				<div className='mt-6 border-2 border-zinc-800 bg-zinc-900 px-6 py-10 text-center'>
					<div className='mb-4 text-4xl'>💤</div>
					<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>No scan running</p>
				</div>
			</div>
		);
	}

	const startTime = status.startedAt
		? new Date(status.startedAt)
		: null;
	const elapsed = startTime
		? Math.floor((Date.now() - startTime.getTime()) / 1000)
		: 0;

	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	return (
		<div className='border-4 border-zinc-900 bg-zinc-950 p-6 shadow-[10px_10px_0_0_#09090b]'>
			<div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
				<div>
					<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>Status Feed</p>
					<h2 className='mt-2 text-lg font-black uppercase tracking-widest text-white'>Scan Progress</h2>
				</div>
				<div className='inline-flex items-center gap-2 border-2 border-red-600 bg-red-950 px-3 py-2 text-xs font-black uppercase tracking-[0.2em] text-red-300'>
					<span className='inline-block h-2 w-2 animate-pulse bg-current' />
					Running
				</div>
			</div>

			<div className='mt-6 space-y-6'>
				{status.phase && (
					<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
						<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>Current Phase</p>
						<p className='mt-2 text-base font-black text-white'>
							{status.phase === "scanning" && "🔍 Scanning Media Files"}
							{status.phase === "thumbnails" && "🖼️ Generating Thumbnails"}
							{status.phase === "metadata" && "📊 Fetching Metadata"}
							{status.phase === "complete" && "✅ Complete"}
						</p>
					</div>
				)}

				{status.currentLibrary && status.phase === "scanning" && (
					<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
						<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>Current Library</p>
						<p className='mt-2 font-black text-white'>{status.currentLibrary}</p>
					</div>
				)}

				{status.phase === "thumbnails" && status.currentThumbnail && (
					<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
						<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>Processing</p>
						<p className='mt-2 font-mono text-sm text-zinc-200'>{status.currentThumbnail}</p>
					</div>
				)}

				{status.phase === "metadata" && status.currentMetadata && (
					<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
						<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>Fetching</p>
						<p className='mt-2 font-mono text-sm text-zinc-200'>{status.currentMetadata}</p>
					</div>
				)}

				{status.phase === "scanning" && (
					<div className='grid grid-cols-2 gap-4'>
						<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
							<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>Scanned</p>
							<p className='mt-3 text-3xl font-black text-blue-400'>{status.videosScanned}</p>
						</div>
						<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
							<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>Added</p>
							<p className='mt-3 text-3xl font-black text-green-400'>{status.videosAdded}</p>
						</div>
						<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
							<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>Updated</p>
							<p className='mt-3 text-3xl font-black text-yellow-400'>{status.videosUpdated}</p>
						</div>
						<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
							<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>Elapsed</p>
							<p className='mt-3 text-3xl font-black text-purple-400'>{formatTime(elapsed)}</p>
						</div>
					</div>
				)}

				{status.phase === "thumbnails" && (
					<div className='space-y-4'>
						{status.thumbnailsTotal && status.thumbnailsTotal > 0 && (
							<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
								<div className='mb-3 flex justify-between text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>
									<span>Progress</span>
									<span>
										{status.thumbnailsGenerated || 0} / {status.thumbnailsTotal}
									</span>
								</div>
								<div className='h-2 border-2 border-zinc-800 bg-zinc-950'>
									<div
										className='h-full bg-blue-500 transition-all duration-300'
										style={{
											width: `${((status.thumbnailsGenerated || 0) / status.thumbnailsTotal) * 100}%`,
										}}
									/>
								</div>
							</div>
						)}

						<div className='grid grid-cols-2 gap-4'>
							<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
								<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>📷 From Images</p>
								<p className='mt-3 text-3xl font-black text-green-400'>
									{status.thumbnailsFromOriginal || 0}
								</p>
							</div>
							<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
								<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>🎬 Extracted</p>
								<p className='mt-3 text-3xl font-black text-blue-400'>
									{status.thumbnailsFromExtraction || 0}
								</p>
							</div>
							<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
								<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>✗ Failed</p>
								<p className='mt-3 text-3xl font-black text-red-400'>
									{status.thumbnailsFailed || 0}
								</p>
							</div>
							<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
								<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>Elapsed</p>
								<p className='mt-3 text-3xl font-black text-purple-400'>
									{formatTime(elapsed)}
								</p>
							</div>
						</div>
					</div>
				)}

				{status.phase === "metadata" && (
					<div className='space-y-4'>
						{status.metadataTotal && status.metadataTotal > 0 && (
							<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
								<div className='mb-3 flex justify-between text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>
									<span>Progress</span>
									<span>
										{status.metadataFetched || 0} / {status.metadataTotal}
									</span>
								</div>
								<div className='h-2 border-2 border-zinc-800 bg-zinc-950'>
									<div
										className='h-full bg-cyan-500 transition-all duration-300'
										style={{
											width: `${((status.metadataFetched || 0) / status.metadataTotal) * 100}%`,
										}}
									/>
								</div>
							</div>
						)}

						<div className='grid grid-cols-2 gap-4'>
							<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
								<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>✓ Fetched</p>
								<p className='mt-3 text-3xl font-black text-green-400'>
									{status.metadataFetched || 0}
								</p>
							</div>
							<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
								<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>🖼️ Thumbs</p>
								<p className='mt-3 text-3xl font-black text-blue-400'>
									{status.metadataThumbnailsFetched || 0}
								</p>
							</div>
							<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
								<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>✗ Failed</p>
								<p className='mt-3 text-3xl font-black text-red-400'>
									{status.metadataFailed || 0}
								</p>
							</div>
							<div className='border-2 border-zinc-800 bg-zinc-900 px-4 py-4'>
								<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>Elapsed</p>
								<p className='mt-3 text-3xl font-black text-purple-400'>
									{formatTime(elapsed)}
								</p>
							</div>
						</div>
					</div>
				)}

				<div className='flex flex-col gap-2 text-xs font-mono uppercase tracking-[0.2em] text-zinc-500 sm:flex-row sm:items-center sm:gap-3'>
					<span className='inline-flex items-center gap-2 border-2 border-zinc-800 bg-zinc-900 px-3 py-2 text-white'>
						<span className='text-zinc-500'>Mode</span>
						<span className='font-black text-blue-400'>{status.mode}</span>
					</span>
					{status.libraryPath && (
						<span className='inline-flex min-h-[40px] flex-1 items-center border-2 border-zinc-800 bg-zinc-900 px-3 py-2 text-left text-white'>
							<span className='mr-2 text-zinc-500'>Path</span>
							<span className='truncate font-mono tracking-normal text-blue-400 normal-case'>
								{status.libraryPath}
							</span>
						</span>
					)}
				</div>

				{status.errors.length > 0 && (
					<div className='border-2 border-red-600 bg-red-950 px-4 py-4'>
						<p className='mb-3 text-xs font-black uppercase tracking-[0.3em] text-red-300'>
							Errors ({status.errors.length})
						</p>
						<div className='max-h-32 space-y-1 overflow-y-auto'>
							{status.errors.slice(0, 5).map((error, i) => (
								<p key={i} className='text-xs font-mono uppercase tracking-widest text-red-200'>
									{error}
								</p>
							))}
							{status.errors.length > 5 && (
								<p className='text-xs font-mono uppercase tracking-widest text-red-200'>
									... and {status.errors.length - 5} more
								</p>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
