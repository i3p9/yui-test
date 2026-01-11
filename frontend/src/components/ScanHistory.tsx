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
		if (!endedAt) return "Ongoing...";

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

	const getStatusColor = (status: string) => {
		switch (status) {
			case "completed":
				return "border-green-600 bg-green-950 text-green-300";
			case "running":
				return "border-blue-600 bg-blue-950 text-blue-300";
			case "failed":
				return "border-red-600 bg-red-950 text-red-300";
			default:
				return "border-zinc-800 bg-zinc-900 text-zinc-400";
		}
	};

	if (loading) {
		return (
			<div className='border-4 border-zinc-900 bg-zinc-950 p-5 shadow-[8px_8px_0_0_#09090b]'>
				<p className='text-xs font-mono uppercase tracking-[0.25em] text-zinc-500'>
					History Feed
				</p>
				<h2 className='mt-1 text-base font-black uppercase tracking-widest text-white'>
					Recent Scans
				</h2>
				<p className='mt-4 text-xs font-mono uppercase tracking-[0.25em] text-zinc-500'>
					Loading...
				</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className='border-4 border-zinc-900 bg-zinc-950 p-5 shadow-[8px_8px_0_0_#09090b]'>
				<p className='text-xs font-mono uppercase tracking-[0.25em] text-zinc-500'>
					History Feed
				</p>
				<h2 className='mt-1 text-base font-black uppercase tracking-widest text-white'>
					Recent Scans
				</h2>
				<p className='mt-4 text-xs font-mono uppercase tracking-[0.25em] text-red-400'>
					Error: {error}
				</p>
			</div>
		);
	}

	return (
		<div className='border-4 border-zinc-900 bg-zinc-950 p-5 shadow-[8px_8px_0_0_#09090b]'>
			<div className='mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
				<div>
					<p className='text-xs font-mono uppercase tracking-[0.25em] text-zinc-500'>
						History Feed
					</p>
					<h2 className='mt-1 text-base font-black uppercase tracking-widest text-white'>
						Recent Scans
					</h2>
				</div>
				<button
					onClick={loadHistory}
					className='border-2 border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-black uppercase tracking-[0.25em] text-zinc-300 transition-colors hover:border-red-600 hover:text-white'
				>
					Refresh
				</button>
			</div>

			{history.length === 0 ? (
				<div className='py-6 text-center'>
					<p className='text-xs font-mono uppercase tracking-[0.25em] text-zinc-500'>
						No scans found
					</p>
				</div>
			) : (
				<div className='border-2 border-zinc-800 bg-zinc-900 shadow-[4px_4px_0_0_#09090b]'>
					{/* Header */}
					<div className='border-b-2 border-zinc-800 px-3 py-2 text-xs font-mono uppercase tracking-[0.15em] text-zinc-400'>
						<div className='grid grid-cols-6 gap-4 lg:grid-cols-8'>
							<div>Status</div>
							<div>Mode</div>
							<div>Time</div>
							<div>Scanned</div>
							<div>Added</div>
							<div className='hidden lg:block'>Updated</div>
							<div className='hidden lg:block'>Duration</div>
							<div>Path</div>
						</div>
					</div>
					
					{/* Scan entries - limit to last 8 */}
					{history.slice(0, 8).map((scan, index) => (
						<div
							key={scan.id}
							className={`px-3 py-3 text-xs font-mono ${
								index !== history.slice(0, 8).length - 1 ? 'border-b border-zinc-800' : ''
							} ${scan.errors ? 'bg-red-950/20' : ''}`}
						>
							<div className='grid grid-cols-6 gap-4 lg:grid-cols-8 items-center'>
								<div>
									<span
										className={`inline-flex items-center border px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${getStatusColor(
											scan.status
										)}`}
									>
										{scan.status}
									</span>
								</div>
								<div className='text-zinc-300 uppercase tracking-[0.1em]'>
									{scan.mode}
								</div>
								<div className='text-zinc-400 tracking-[0.1em]'>
									{formatDate(scan.startedAt)}
								</div>
								<div className='font-black text-blue-300'>
									{scan.videosScanned || 0}
								</div>
								<div className='font-black text-green-300'>
									{scan.videosAdded || 0}
								</div>
								<div className='hidden lg:block font-black text-yellow-300'>
									{scan.videosUpdated || 0}
								</div>
								<div className='hidden lg:block font-black text-purple-300'>
									{formatDuration(scan.startedAt, scan.endedAt)}
								</div>
								<div className='text-zinc-400 text-[11px] normal-case tracking-normal truncate'>
									{scan.libraryPath ? scan.libraryPath.replace(/.*\//, '') : 'All Libraries'}
								</div>
							</div>
							{scan.errors && (
								<div className='mt-2 text-[10px] text-red-300 normal-case tracking-normal'>
									Error: {JSON.parse(scan.errors)[0] || 'Unknown error'}
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
