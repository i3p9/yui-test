import { useEffect, useState } from "react";
import { getScanHistory } from "../lib/api";
import type { ScanLog } from "../types";

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
		return date.toLocaleString("en-US", {
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
		if (!endedAt) return "In progress...";

		const start = new Date(startedAt).getTime();
		const end = new Date(endedAt).getTime();

		const totalMs = end - start;
		const totalSeconds = Math.floor(totalMs / 1000);
		const mins = Math.floor(totalSeconds / 60);
		const secs = totalSeconds % 60;
		const ms = totalMs % 1000;

		if (mins > 0) return `${mins}m ${secs}s ${ms}ms`;
		if (secs > 0) return `${secs}s ${ms}ms`;
		return `${ms}ms`;
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "completed":
				return "bg-green-900/30 text-green-400 border-green-700";
			case "running":
				return "bg-blue-900/30 text-blue-400 border-blue-700";
			case "failed":
				return "bg-red-900/30 text-red-400 border-red-700";
			default:
				return "bg-gray-700 text-gray-400 border-gray-600";
		}
	};

	if (loading) {
		return (
			<div className='bg-gray-800 rounded-lg p-6'>
				<h2 className='text-xl font-semibold mb-4'>Scan History</h2>
				<p className='text-gray-400'>Loading...</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className='bg-gray-800 rounded-lg p-6'>
				<h2 className='text-xl font-semibold mb-4'>Scan History</h2>
				<p className='text-red-400'>Error: {error}</p>
			</div>
		);
	}

	return (
		<div className='bg-gray-800 rounded-lg p-6'>
			<div className='flex items-center justify-between mb-4'>
				<h2 className='text-xl font-semibold'>Scan History</h2>
				<button
					onClick={loadHistory}
					className='text-sm px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors'
				>
					Refresh
				</button>
			</div>

			<div className='space-y-3'>
				{history.map((scan) => (
					<div
						key={scan.id}
						className='bg-gray-700/50 border border-gray-600 rounded-lg p-4'
					>
						<div className='flex items-start justify-between mb-2'>
							<div className='flex items-center gap-2'>
								<span
									className={`text-xs px-2 py-1 rounded border ${getStatusColor(
										scan.status
									)}`}
								>
									{scan.status}
								</span>
								<span className='text-xs px-2 py-1 bg-gray-700 rounded'>
									{scan.mode}
								</span>
							</div>
							<span className='text-xs text-gray-400'>
								{formatDate(scan.startedAt)}
							</span>
						</div>

						{scan.libraryPath && (
							<p className='text-sm text-gray-400 mb-2 font-mono truncate'>
								{scan.libraryPath}
							</p>
						)}

						<div className='grid grid-cols-4 gap-2 text-sm'>
							<div>
								<span className='text-gray-500'>Scanned:</span>{" "}
								<span className='text-blue-400'>
									{scan.videosScanned || 0}
								</span>
							</div>
							<div>
								<span className='text-gray-500'>Added:</span>{" "}
								<span className='text-green-400'>
									{scan.videosAdded || 0}
								</span>
							</div>
							<div>
								<span className='text-gray-500'>Updated:</span>{" "}
								<span className='text-yellow-400'>
									{scan.videosUpdated || 0}
								</span>
							</div>
							<div>
								<span className='text-gray-500'>Duration:</span>{" "}
								<span className='text-purple-400'>
									{formatDuration(scan.startedAt, scan.endedAt)}
								</span>
							</div>
						</div>

						{scan.errors && (
							<div className='mt-2 text-xs text-red-400 bg-red-900/20 rounded p-2'>
								{scan.errors}
							</div>
						)}
					</div>
				))}
			</div>

			{history.length === 0 && (
				<div className='text-center py-8'>
					<p className='text-gray-400'>No scans found</p>
				</div>
			)}
		</div>
	);
}
