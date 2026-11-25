import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { searchFull } from "../lib/api";
import { VideoGrid } from "../components/VideoGrid";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { ChannelCard } from "../components/ChannelCard";
import { Page, PageHeader, Spinner, ErrorBanner, EmptyState, Button } from "../components/ui";

const SearchIcon = () => (
	<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
		<path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
	</svg>
);

const subheading = "mb-3 flex items-baseline gap-2 text-sm font-bold uppercase tracking-wide";

interface SearchResults {
	query: string;
	results: {
		channels: {
			items: Array<{
				uploaderId: string;
				name: string;
				videoCount: number;
				thumbnailPath?: string;
				avatarPath?: string;
				lastUploadDate?: string;
			}>;
			total: number;
		};
		videos: {
			items: Array<{
				videoId: string;
				title: string;
				uploader: string | null;
				uploaderId?: string | null;
				uploadDate: string | null;
				durationSeconds: number | null;
				thumbnailPath: string | null;
				hasThumbnails: boolean | null;
				thumbnailSource?: string | null;
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
	useDocumentTitle(query ? `Search: ${query}` : "Search");

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

	if (!query || query.length < 2) {
		return (
			<Page>
				<EmptyState
					icon={<SearchIcon />}
					title={query ? "Query too short" : "Search your library"}
				>
					{query ? "Enter at least 2 characters." : null}
				</EmptyState>
			</Page>
		);
	}

	const tabs = [
		{ key: "all", label: "All", count: results?.totalResults },
		{ key: "channels", label: "Channels", count: results?.results.channels.total },
		{ key: "videos", label: "Videos", count: results?.results.videos.total },
	] as const;
	const pagination = results?.results.videos.pagination;

	return (
		<Page>
			<PageHeader
				title={<span className='normal-case'>&ldquo;{query}&rdquo;</span>}
				meta={
					loading
						? "Searching…"
						: results
						? `${results.totalResults} results`
						: undefined
				}
				actions={
					results &&
					!loading &&
					tabs.map((t) => (
						<Button
							key={t.key}
							size='sm'
							variant={type === t.key ? "primary" : "secondary"}
							aria-pressed={type === t.key}
							onClick={() => handleTypeChange(t.key)}
						>
							{t.label}
							<span className='font-mono opacity-70'>{t.count}</span>
						</Button>
					))
				}
			/>

			{loading && <Spinner label='Searching' />}
			{error && <ErrorBanner>{error}</ErrorBanner>}

			{results && !loading && (
				<div className='space-y-8'>
					{(type === "all" || type === "channels") &&
						results.results.channels.items.length > 0 && (
							<section>
								<h2 className={subheading}>
									Channels
									<span className='font-mono text-xs font-normal text-zinc-500'>
										{results.results.channels.total}
									</span>
								</h2>
								<div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
									{results.results.channels.items.map((channel) => (
										<ChannelCard key={channel.uploaderId} channel={channel} />
									))}
								</div>
							</section>
						)}

					{(type === "all" || type === "videos") &&
						results.results.videos.items.length > 0 && (
							<section>
								<h2 className={subheading}>
									Videos
									<span className='font-mono text-xs font-normal text-zinc-500'>
										{results.results.videos.total}
									</span>
								</h2>
								<VideoGrid videos={results.results.videos.items} />

								{pagination && pagination.pages > 1 && (
									<div className='mt-6 flex items-center justify-center gap-3'>
										<Button
											size='sm'
											onClick={() => handlePageChange(page - 1)}
											disabled={page <= 1}
										>
											Prev
										</Button>
										<span className='font-mono text-xs text-zinc-400'>
											{pagination.page} / {pagination.pages}
										</span>
										<Button
											size='sm'
											onClick={() => handlePageChange(page + 1)}
											disabled={page >= pagination.pages}
										>
											Next
										</Button>
									</div>
								)}
							</section>
						)}

					{results.totalResults === 0 && (
						<EmptyState icon={<SearchIcon />} title='No results' />
					)}
				</div>
			)}
		</Page>
	);
}

export default SearchPage;
