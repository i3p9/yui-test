import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { searchFull } from "../lib/api";
import { VideoCard } from "../components/VideoCard";

interface SearchResults {
	query: string;
	results: {
		channels: {
			items: Array<{
				uploaderId: string;
				name: string;
				videoCount: number;
				thumbnailPath?: string;
				lastUploadDate?: string;
			}>;
			total: number;
		};
		videos: {
			items: Array<{
				videoId: string;
				title: string;
				uploader?: string;
				uploaderId?: string;
				uploadDate?: string;
				durationSeconds?: number;
				thumbnailPath?: string;
				hasThumbnails: boolean;
				description?: string;
			}>;
			total: number;
			pagination: {
				page: number;
				limit: number;
				pages: number;
			};
		};
	};
	totalResults: number;
}

export function SearchPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const [results, setResults] = useState<SearchResults | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const query = searchParams.get("q") || "";
	const type =
		(searchParams.get("type") as "all" | "videos" | "channels") ||
		"all";
	const page = parseInt(searchParams.get("page") || "1");
	const limit = 20;

	useEffect(() => {
		const performSearch = async () => {
			if (!query || query.length < 2) {
				setResults(null);
				return;
			}

			setLoading(true);
			setError(null);

			try {
				const searchResults = await searchFull(query, {
					type,
					page,
					limit,
				});
				setResults(searchResults);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Search failed"
				);
				setResults(null);
			} finally {
				setLoading(false);
			}
		};

		performSearch();
	}, [query, type, page]);

	const updateSearchParams = (
		newParams: Record<string, string | number>
	) => {
		const newSearchParams = new URLSearchParams(searchParams);

		Object.entries(newParams).forEach(([key, value]) => {
			if (value) {
				newSearchParams.set(key, String(value));
			} else {
				newSearchParams.delete(key);
			}
		});

		setSearchParams(newSearchParams);
	};

	const handleTypeChange = (
		newType: "all" | "videos" | "channels"
	) => {
		updateSearchParams({ type: newType, page: 1 });
	};

	const handlePageChange = (newPage: number) => {
		updateSearchParams({ page: newPage });
	};

	const getChannelThumbnailUrl = (uploaderId: string) => {
		return `http://localhost:3001/api/library/channels/${uploaderId}/thumbnail`;
	};

	if (!query) {
		return (
			<div className='p-8'>
				<div className='flex flex-col items-center justify-center py-20'>
					<svg
						className='w-24 h-24 text-zinc-800 mb-4'
						fill='currentColor'
						viewBox='0 0 24 24'
					>
						<path d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' />
					</svg>
					<p className='text-zinc-500 font-bold text-lg'>
						ENTER A SEARCH QUERY
					</p>
					<p className='text-zinc-600 text-sm mt-2'>
						Search for videos and channels in your library
					</p>
				</div>
			</div>
		);
	}

	if (query.length < 2) {
		return (
			<div className='p-8'>
				<div className='flex flex-col items-center justify-center py-20'>
					<p className='text-zinc-500 font-bold text-lg'>
						QUERY TOO SHORT
					</p>
					<p className='text-zinc-600 text-sm mt-2'>
						Please enter at least 2 characters
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className='p-8'>
			{/* Header */}
			<div className='mb-8'>
				<h1 className='text-4xl font-black tracking-tight mb-2'>
					SEARCH RESULTS
				</h1>
				<div className='h-1 w-24 bg-red-600 mb-4' />
				<p className='text-zinc-500 text-lg font-mono'>
					{loading ? (
						"Searching..."
					) : results ? (
						<>
							Results for "
							<span className='text-white font-bold'>{query}</span>" (
							{results.totalResults} total)
						</>
					) : (
						<>
							No results for "
							<span className='text-white font-bold'>{query}</span>"
						</>
					)}
				</p>
			</div>

			{/* Loading */}
			{loading && (
				<div className='flex items-center justify-center py-20'>
					<div className='text-center'>
						<div className='inline-block w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4' />
						<p className='text-zinc-400 font-bold'>SEARCHING...</p>
					</div>
				</div>
			)}

			{/* Error */}
			{error && (
				<div className='bg-red-950 border-2 border-red-600 p-6 mb-8'>
					<p className='text-red-400 font-bold'>ERROR: {error}</p>
				</div>
			)}

			{/* Results */}
			{results && !loading && (
				<div>
					{/* Filter Buttons */}
					<div className='mb-8 flex gap-4'>
						<button
							onClick={() => handleTypeChange("all")}
							className={`px-4 py-2 font-bold text-sm border-2 transition-colors ${
								type === "all"
									? "bg-red-600 border-red-600 text-white"
									: "bg-transparent border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white"
							}`}
						>
							ALL ({results.totalResults})
						</button>
						<button
							onClick={() => handleTypeChange("channels")}
							className={`px-4 py-2 font-bold text-sm border-2 transition-colors ${
								type === "channels"
									? "bg-red-600 border-red-600 text-white"
									: "bg-transparent border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white"
							}`}
						>
							CHANNELS ({results.results.channels.total})
						</button>
						<button
							onClick={() => handleTypeChange("videos")}
							className={`px-4 py-2 font-bold text-sm border-2 transition-colors ${
								type === "videos"
									? "bg-red-600 border-red-600 text-white"
									: "bg-transparent border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white"
							}`}
						>
							VIDEOS ({results.results.videos.total})
						</button>
					</div>

					{/* Channels Section */}
					{(type === "all" || type === "channels") &&
						results.results.channels.items.length > 0 && (
							<div className='mb-12'>
								<h2 className='text-2xl font-black tracking-tight mb-4'>
									CHANNELS ({results.results.channels.total})
								</h2>
								<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'>
									{results.results.channels.items.map((channel) => (
										<Link
											key={channel.uploaderId}
											to={`/channels/${channel.uploaderId}`}
											className='group block bg-zinc-900 border-2 border-zinc-800 hover:border-red-600 transition-colors p-6'
										>
											{/* Channel Avatar */}
											<div className='w-24 h-24 mx-auto mb-4 bg-zinc-800 border-2 border-zinc-700 group-hover:border-red-600 transition-colors flex items-center justify-center'>
												{channel.thumbnailPath ? (
													<img
														src={getChannelThumbnailUrl(
															channel.uploaderId
														)}
														alt={channel.name}
														className='w-full h-full object-cover'
													/>
												) : (
													<svg
														className='w-12 h-12 text-zinc-600'
														fill='currentColor'
														viewBox='0 0 24 24'
													>
														<path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z' />
													</svg>
												)}
											</div>

											{/* Channel Info */}
											<h3 className='text-center font-bold text-sm mb-2 line-clamp-2 group-hover:text-red-500 transition-colors'>
												{channel.name}
											</h3>
											<p className='text-center text-xs text-zinc-500 font-mono'>
												{channel.videoCount} videos
											</p>
											{channel.lastUploadDate && (
												<p className='text-center text-xs text-zinc-600 font-mono mt-1'>
													Latest: {channel.lastUploadDate}
												</p>
											)}
										</Link>
									))}
								</div>
							</div>
						)}

					{/* Videos Section */}
					{(type === "all" || type === "videos") &&
						results.results.videos.items.length > 0 && (
							<div>
								<h2 className='text-2xl font-black tracking-tight mb-4'>
									VIDEOS ({results.results.videos.total})
								</h2>

								<VideoGrid videos={results.results.videos.items} />

								{/* Pagination */}
								{results.results.videos.pagination.pages > 1 && (
									<div className='mt-8 flex justify-center items-center gap-4'>
										<button
											onClick={() => handlePageChange(page - 1)}
											disabled={page <= 1}
											className='px-4 py-2 font-bold text-sm bg-zinc-900 border-2 border-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed hover:border-zinc-700 transition-colors'
										>
											PREV
										</button>

										<span className='text-zinc-400 font-mono text-sm'>
											Page {results.results.videos.pagination.page} of{" "}
											{results.results.videos.pagination.pages}
										</span>

										<button
											onClick={() => handlePageChange(page + 1)}
											disabled={
												page >=
												results.results.videos.pagination.pages
											}
											className='px-4 py-2 font-bold text-sm bg-zinc-900 border-2 border-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed hover:border-zinc-700 transition-colors'
										>
											NEXT
										</button>
									</div>
								)}
							</div>
						)}

					{/* No Results */}
					{results.totalResults === 0 && (
						<div className='flex flex-col items-center justify-center py-20'>
							<svg
								className='w-24 h-24 text-zinc-800 mb-4'
								fill='currentColor'
								viewBox='0 0 24 24'
							>
								<path d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' />
							</svg>
							<p className='text-zinc-500 font-bold text-lg'>
								NO RESULTS FOUND
							</p>
							<p className='text-zinc-600 text-sm mt-2'>
								Try different keywords or check your spelling
							</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// Video Grid component (similar to existing VideoGrid but simplified)
function VideoGrid({ videos }: { videos: any[] }) {
	return (
		<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'>
			{videos.map((video) => (
				<VideoCard key={video.videoId} video={video} />
			))}
		</div>
	);
}

export default SearchPage;
