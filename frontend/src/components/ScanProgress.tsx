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
				{/* Current Library */}
				{status.currentLibrary && (
					<div className='bg-gray-700/50 rounded-lg p-3'>
						<p className='text-sm text-gray-400'>Current Library</p>
						<p className='font-medium'>{status.currentLibrary}</p>
					</div>
				)}

				{/* Stats Grid */}
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
