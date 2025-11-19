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
			<div className='bg-gray-800 rounded-lg p-6'>
				<h2 className='text-xl font-semibold mb-4'>Scan Progress</h2>
				<p className='text-gray-400'>Loading...</p>
			</div>
		);
	}

	if (!status.isRunning) {
		return (
			<div className='bg-gray-800 rounded-lg p-6'>
				<h2 className='text-xl font-semibold mb-4'>Scan Progress</h2>
				<div className='text-center py-8'>
					<div className='text-4xl mb-2'>💤</div>
					<p className='text-gray-400'>No scan running</p>
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
		<div className='bg-gray-800 rounded-lg p-6'>
			<div className='flex items-center justify-between mb-4'>
				<h2 className='text-xl font-semibold'>Scan Progress</h2>
				<div className='flex items-center gap-2'>
					<div className='w-2 h-2 bg-green-500 rounded-full animate-pulse'></div>
					<span className='text-sm text-gray-400'>Running</span>
				</div>
			</div>

			<div className='space-y-4'>
				{/* Phase Indicator */}
				{status.phase && (
					<div className='bg-gray-700/50 rounded-lg p-3'>
						<p className='text-sm text-gray-400'>Current Phase</p>
						<p className='font-medium'>
							{status.phase === 'scanning' && '🔍 Scanning Media Files'}
							{status.phase === 'thumbnails' && '🖼️ Generating Thumbnails'}
							{status.phase === 'complete' && '✅ Complete'}
						</p>
					</div>
				)}

				{/* Current Library */}
				{status.currentLibrary && status.phase === 'scanning' && (
					<div className='bg-gray-700/50 rounded-lg p-3'>
						<p className='text-sm text-gray-400'>Current Library</p>
						<p className='font-medium'>{status.currentLibrary}</p>
					</div>
				)}

				{/* Current Thumbnail (during thumbnail phase) */}
				{status.phase === 'thumbnails' && status.currentThumbnail && (
					<div className='bg-gray-700/50 rounded-lg p-3'>
						<p className='text-sm text-gray-400'>Processing</p>
						<p className='font-medium font-mono text-sm'>{status.currentThumbnail}</p>
					</div>
				)}

				{/* Stats Grid - Scanning Phase */}
				{status.phase === 'scanning' && (
					<div className='grid grid-cols-2 gap-3'>
						<div className='bg-gray-700/50 rounded-lg p-4'>
							<p className='text-sm text-gray-400 mb-1'>Scanned</p>
							<p className='text-2xl font-bold text-blue-400'>
								{status.videosScanned}
							</p>
						</div>
						<div className='bg-gray-700/50 rounded-lg p-4'>
							<p className='text-sm text-gray-400 mb-1'>Added</p>
							<p className='text-2xl font-bold text-green-400'>
								{status.videosAdded}
							</p>
						</div>
						<div className='bg-gray-700/50 rounded-lg p-4'>
							<p className='text-sm text-gray-400 mb-1'>Updated</p>
							<p className='text-2xl font-bold text-yellow-400'>
								{status.videosUpdated}
							</p>
						</div>
						<div className='bg-gray-700/50 rounded-lg p-4'>
							<p className='text-sm text-gray-400 mb-1'>Elapsed</p>
							<p className='text-2xl font-bold text-purple-400'>
								{formatTime(elapsed)}
							</p>
						</div>
					</div>
				)}

				{/* Stats Grid - Thumbnail Phase */}
				{status.phase === 'thumbnails' && (
					<div className='space-y-3'>
						{/* Progress Bar */}
						{status.thumbnailsTotal && status.thumbnailsTotal > 0 && (
							<div>
								<div className='flex justify-between text-sm mb-1'>
									<span className='text-gray-400'>Progress</span>
									<span className='text-gray-400'>
										{status.thumbnailsGenerated || 0} / {status.thumbnailsTotal}
									</span>
								</div>
								<div className='w-full bg-gray-700 rounded-full h-2'>
									<div
										className='bg-blue-500 h-2 rounded-full transition-all duration-300'
										style={{
											width: `${((status.thumbnailsGenerated || 0) / status.thumbnailsTotal) * 100}%`,
										}}
									/>
								</div>
							</div>
						)}

						{/* Thumbnail Stats Grid */}
						<div className='grid grid-cols-2 gap-3'>
							<div className='bg-gray-700/50 rounded-lg p-4'>
								<p className='text-sm text-gray-400 mb-1'>📷 From Images</p>
								<p className='text-2xl font-bold text-green-400'>
									{status.thumbnailsFromOriginal || 0}
								</p>
							</div>
							<div className='bg-gray-700/50 rounded-lg p-4'>
								<p className='text-sm text-gray-400 mb-1'>🎬 Extracted</p>
								<p className='text-2xl font-bold text-blue-400'>
									{status.thumbnailsFromExtraction || 0}
								</p>
							</div>
							<div className='bg-gray-700/50 rounded-lg p-4'>
								<p className='text-sm text-gray-400 mb-1'>✗ Failed</p>
								<p className='text-2xl font-bold text-red-400'>
									{status.thumbnailsFailed || 0}
								</p>
							</div>
							<div className='bg-gray-700/50 rounded-lg p-4'>
								<p className='text-sm text-gray-400 mb-1'>Elapsed</p>
								<p className='text-2xl font-bold text-purple-400'>
									{formatTime(elapsed)}
								</p>
							</div>
						</div>
					</div>
				)}

				{/* Mode and Path */}
				<div className='flex gap-2 text-sm'>
					<span className='px-2 py-1 bg-gray-700 rounded'>
						Mode: <span className='text-blue-400'>{status.mode}</span>
					</span>
					{status.libraryPath && (
						<span className='px-2 py-1 bg-gray-700 rounded truncate'>
							Path:{" "}
							<span className='text-blue-400'>
								{status.libraryPath}
							</span>
						</span>
					)}
				</div>

				{/* Errors */}
				{status.errors.length > 0 && (
					<div className='bg-red-900/30 border border-red-700 rounded-lg p-3'>
						<p className='text-sm font-medium text-red-400 mb-2'>
							Errors ({status.errors.length})
						</p>
						<div className='space-y-1 max-h-32 overflow-y-auto'>
							{status.errors.slice(0, 5).map((error, i) => (
								<p key={i} className='text-xs text-red-300 font-mono'>
									{error}
								</p>
							))}
							{status.errors.length > 5 && (
								<p className='text-xs text-red-400'>
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
