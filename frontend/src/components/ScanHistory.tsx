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
			<div className='border-4 border-zinc-900 bg-zinc-950 p-6 shadow-[10px_10px_0_0_#09090b]'>
				<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>
					History Feed
				</p>
				<h2 className='mt-2 text-lg font-black uppercase tracking-widest text-white'>
					Scan History
				</h2>
				<p className='mt-6 text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>
					Loading...
				</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className='border-4 border-zinc-900 bg-zinc-950 p-6 shadow-[10px_10px_0_0_#09090b]'>
				<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>
					History Feed
				</p>
				<h2 className='mt-2 text-lg font-black uppercase tracking-widest text-white'>
					Scan History
				</h2>
				<p className='mt-6 text-xs font-mono uppercase tracking-[0.3em] text-red-400'>
					Error: {error}
				</p>
			</div>
		);
	}

	return (
		<div className='border-4 border-zinc-900 bg-zinc-950 p-6 shadow-[10px_10px_0_0_#09090b]'>
			<div className='mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
				<div>
					<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>
						History Feed
					</p>
					<h2 className='mt-2 text-lg font-black uppercase tracking-widest text-white'>
						Scan History
					</h2>
				</div>
				<button
					onClick={loadHistory}
					className='border-2 border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-black uppercase tracking-[0.3em] text-zinc-300 transition-colors hover:border-red-600 hover:text-white'
				>
					Refresh
				</button>
			</div>

			<div className='space-y-4'>
				{history.map((scan) => (
					<div
						key={scan.id}
						className='border-2 border-zinc-800 bg-zinc-900 p-5 shadow-[6px_6px_0_0_#09090b]'
					>
						<div className='mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
							<div className='flex flex-wrap items-center gap-2'>
								<span
									className={`inline-flex items-center border-2 px-2 py-1 text-xs font-black uppercase tracking-[0.3em] ${getStatusColor(
										scan.status
									)}`}
								>
									{scan.status}
								</span>
								<span className='inline-flex items-center border-2 border-zinc-800 bg-zinc-950 px-2 py-1 text-xs font-mono uppercase tracking-[0.3em] text-zinc-400'>
									{scan.mode}
								</span>
							</div>
							<span className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>
								{formatDate(scan.startedAt)}
							</span>
						</div>

						{scan.libraryPath && (
							<p className='mb-3 font-mono text-xs uppercase tracking-[0.2em] text-zinc-500'>
								<span className='text-zinc-600'>Path:</span>{" "}
								<span className='text-zinc-300 normal-case tracking-normal'>
									{scan.libraryPath}
								</span>
							</p>
						)}

						<div className='grid gap-3 text-xs font-mono uppercase tracking-[0.2em] sm:grid-cols-2 lg:grid-cols-4'>
							<div className='flex flex-col justify-between border-2 border-zinc-800 bg-zinc-950 px-3 py-2'>
								<span className='text-zinc-500'>Scanned</span>
								<span className='font-black text-blue-400'>
									{scan.videosScanned || 0}
								</span>
							</div>
							<div className='flex flex-col justify-between border-2 border-zinc-800 bg-zinc-950 px-3 py-2'>
								<span className='text-zinc-500'>Added</span>
								<span className='font-black text-green-400'>
									{scan.videosAdded || 0}
								</span>
							</div>
							<div className='flex flex-col justify-between border-2 border-zinc-800 bg-zinc-950 px-3 py-2'>
								<span className='text-zinc-500'>Updated</span>
								<span className='font-black text-yellow-400'>
									{scan.videosUpdated || 0}
								</span>
							</div>
							<div className='flex flex-col justify-between border-2 border-zinc-800 bg-zinc-950 px-3 py-2'>
								<span className='text-zinc-500'>Duration</span>
								<span className='font-black text-purple-400'>
									{formatDuration(scan.startedAt, scan.endedAt)}
								</span>
							</div>
						</div>

						{scan.errors && (
							<div className='mt-3 border-2 border-red-600 bg-red-950 px-3 py-3 text-xs font-mono uppercase tracking-[0.2em] text-red-200'>
								{scan.errors}
							</div>
						)}
					</div>
				))}
			</div>

			{history.length === 0 && (
				<div className='py-8 text-center'>
					<p className='text-xs font-mono uppercase tracking-[0.3em] text-zinc-500'>
						No scans found
					</p>
				</div>
			)}
		</div>
	);
}
