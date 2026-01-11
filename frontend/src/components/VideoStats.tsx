import { useEffect, useState } from "react";
import { getVideoStats } from "../lib/api";
import type { VideoStats as VideoStatsType } from "../types";
import { mediaTypeHumanReadable } from "../utils/utils";

export function VideoStats() {
	const [stats, setStats] = useState<VideoStatsType | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadStats = () => {
		setLoading(true);
		getVideoStats()
			.then(setStats)
			.catch((err) => setError(err.message))
			.finally(() => setLoading(false));
	};

	useEffect(() => {
		loadStats();
	}, []);

	const formatBytes = (bytes: number) => {
		if (bytes === 0) return "0 B";
		const k = 1024;
		const sizes = ["B", "KB", "MB", "GB", "TB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
	};

	if (loading) {
		return (
			<div className='border-4 border-zinc-900 bg-zinc-950 p-5 shadow-[8px_8px_0_0_#09090b]'>
				<p className='text-xs font-mono uppercase tracking-[0.25em] text-zinc-500'>
					Collection Metrics
				</p>
				<h2 className='mt-1 text-base font-black uppercase tracking-widest text-white'>
					Video Statistics
				</h2>
				<p className='mt-4 text-xs font-mono uppercase tracking-[0.25em] text-zinc-500'>Loading...</p>
			</div>
		);
	}

	if (error || !stats) {
		return (
			<div className='border-4 border-zinc-900 bg-zinc-950 p-5 shadow-[8px_8px_0_0_#09090b]'>
				<p className='text-xs font-mono uppercase tracking-[0.25em] text-zinc-500'>
					Collection Metrics
				</p>
				<h2 className='mt-1 text-base font-black uppercase tracking-widest text-white'>
					Video Statistics
				</h2>
				<p className='mt-4 text-xs font-mono uppercase tracking-[0.25em] text-red-400'>
					Error: {error || "No data"}
				</p>
			</div>
		);
	}

	return (
		<div className='border-4 border-zinc-900 bg-zinc-950 p-5 shadow-[8px_8px_0_0_#09090b]'>
			<div className='mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
				<div>
					<p className='text-xs font-mono uppercase tracking-[0.25em] text-zinc-500'>
						Collection Metrics
					</p>
					<h2 className='mt-1 text-base font-black uppercase tracking-widest text-white'>
						Video Statistics
					</h2>
				</div>
				<button
					onClick={loadStats}
					className='border-2 border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-black uppercase tracking-[0.25em] text-zinc-300 transition-colors hover:border-red-600 hover:text-white'
				>
					Refresh
				</button>
			</div>
			<div className='space-y-4'>
				<div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
					<div className='border-2 border-blue-600 bg-zinc-900 p-4 shadow-[4px_4px_0_0_#09090b]'>
						<p className='text-xs font-mono uppercase tracking-[0.25em] text-blue-300'>Total Videos</p>
						<p className='mt-2 text-3xl font-black text-white'>
							{stats.totalVideos}
						</p>
					</div>

					<div className='border-2 border-purple-600 bg-zinc-900 p-4 shadow-[4px_4px_0_0_#09090b]'>
						<p className='text-xs font-mono uppercase tracking-[0.25em] text-purple-300'>Total Size</p>
						<p className='mt-2 text-xl font-black text-white'>
							{formatBytes(stats.totalSizeBytes)}
						</p>
					</div>
					<div className='border-2 border-amber-500 bg-zinc-900 p-4 shadow-[4px_4px_0_0_#09090b]'>
						<p className='text-xs font-mono uppercase tracking-[0.25em] text-amber-200'>
							Thumbnails Ready
						</p>
						<p className='mt-2 text-2xl font-black text-white'>
							{stats.thumbnails.withThumbnails}
						</p>
						<p className='mt-1 text-[11px] font-mono uppercase tracking-[0.2em] text-amber-300'>
							Missing: {stats.thumbnails.withoutThumbnails}
						</p>
					</div>
				</div>
				<div className='border-2 border-amber-600 bg-zinc-900 p-4 shadow-[4px_4px_0_0_#09090b]'>
					<p className='text-xs font-mono uppercase tracking-[0.25em] text-amber-300'>
						Thumbnails By Source
					</p>
					<div className='mt-3 space-y-1'>
						<div className='flex items-center justify-between border-2 border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-mono uppercase tracking-[0.15em]'>
							<span className='text-zinc-400'>Original Files</span>
							<span className='text-base font-black text-white'>
								{stats.thumbnails.original}
							</span>
						</div>
						<div className='flex items-center justify-between border-2 border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-mono uppercase tracking-[0.15em]'>
							<span className='text-zinc-400'>Generated (FFmpeg)</span>
							<span className='text-base font-black text-white'>
								{stats.thumbnails.extracted}
							</span>
						</div>
						{stats.thumbnails.unknown > 0 && (
							<div className='flex items-center justify-between border-2 border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-mono uppercase tracking-[0.15em]'>
								<span className='text-zinc-400'>Unknown Source</span>
								<span className='text-base font-black text-white'>
									{stats.thumbnails.unknown}
								</span>
							</div>
						)}
					</div>
				</div>
				<div className='border-2 border-green-600 bg-zinc-900 p-4 shadow-[4px_4px_0_0_#09090b]'>
					<p className='text-xs font-mono uppercase tracking-[0.25em] text-green-300'>
						Videos By Type
					</p>
					<div className='mt-3 space-y-1'>
						{stats.byType.map((type) => (
							<div
								key={type.mediaType}
								className='flex items-center justify-between border-2 border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-mono uppercase tracking-[0.15em]'
							>
								<span className='text-zinc-400'>
									{mediaTypeHumanReadable(type.mediaType)}
								</span>
								<span className='text-base font-black text-white'>
									{type.count}
								</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
