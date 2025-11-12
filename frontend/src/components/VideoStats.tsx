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
			<div className='bg-gray-800 rounded-lg p-6'>
				<h2 className='text-xl font-semibold mb-4'>
					Video Statistics
				</h2>
				<p className='text-gray-400'>Loading...</p>
			</div>
		);
	}

	if (error || !stats) {
		return (
			<div className='bg-gray-800 rounded-lg p-6'>
				<h2 className='text-xl font-semibold mb-4'>
					Video Statistics
				</h2>
				<p className='text-red-400'>Error: {error || "No data"}</p>
			</div>
		);
	}

	return (
		<div className='bg-gray-800 rounded-lg p-6'>
			<div className='flex items-center justify-between mb-4'>
				<h2 className='text-xl font-semibold'>Video Statistics</h2>
				<button
					onClick={loadStats}
					className='text-sm px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors'
				>
					Refresh
				</button>
			</div>
			<div className='space-y-6'>
				<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
					{/* Total Videos */}
					<div className='bg-gradient-to-br from-blue-900/40 to-blue-800/20 border border-blue-700 rounded-lg p-6'>
						<p className='text-sm text-blue-300 mb-2'>Total Videos</p>
						<p className='text-4xl font-bold text-white'>
							{stats.totalVideos}
						</p>
					</div>

					{/* Total Size */}
					<div className='bg-gradient-to-br from-purple-900/40 to-purple-800/20 border border-purple-700 rounded-lg p-6'>
						<p className='text-sm text-purple-300 mb-2'>Total Size</p>
						<p className='text-2xl font-bold text-white'>
							{formatBytes(stats.totalSizeBytes)}
						</p>
					</div>
				</div>
				<div className='bg-gradient-to-br from-green-900/40 to-green-800/20 border border-green-700 rounded-lg p-6'>
					<p className='text-sm text-green-300 mb-2'>
						Videos By Type
					</p>
					<div className='space-y-2'>
						{stats.byType.map((type) => (
							<div
								key={type.mediaType}
								className='flex justify-between items-center'
							>
								<span className='text-sm text-gray-300'>
									{mediaTypeHumanReadable(type.mediaType)}
								</span>
								<span className='text-lg font-bold text-white'>
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
