import { useEffect, useMemo, useState } from "react";
import { getChannels } from "../lib/api";
import { ChannelCard } from "../components/ChannelCard";
import { Page, PageHeader, Spinner, ErrorBanner, EmptyState, Input, Select } from "../components/ui";
import type { Channel } from "../types";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export function ChannelsPage() {
	useDocumentTitle("Channels");
	const [channels, setChannels] = useState<Channel[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState("");
	const [sort, setSort] = useState<"latest" | "videos" | "name">("latest");

	const shown = useMemo(() => {
		const q = filter.trim().toLowerCase();
		const list = q ? channels.filter((c) => c.name.toLowerCase().includes(q)) : [...channels];
		return list.sort((a, b) =>
			sort === "name" ? a.name.localeCompare(b.name)
			: sort === "videos" ? b.videoCount - a.videoCount
			: (b.lastUploadDate ?? "").localeCompare(a.lastUploadDate ?? ""));
	}, [channels, filter, sort]);

	useEffect(() => {
		loadChannels();
	}, []);

	const loadChannels = async () => {
		try {
			setLoading(true);
			setError(null);
			const response = await getChannels();
			setChannels(response.channels);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to load channels"
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Page>
			<PageHeader
				title='Channels'
				meta={!loading && !error ? (filter ? `${shown.length} of ${channels.length} channels` : `${channels.length} channels`) : undefined}
				actions={channels.length > 1 && <>
					<Input type='search' aria-label='Filter channels' placeholder='Filter channels' className='w-44 sm:w-56'
						value={filter} onChange={(e) => setFilter(e.target.value)} />
					<Select aria-label='Sort channels' className='w-auto' value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
						<option value='latest'>Latest upload</option>
						<option value='videos'>Most videos</option>
						<option value='name'>Name</option>
					</Select>
				</>}
			/>
			{error ? (
				<ErrorBanner onRetry={loadChannels}>{error}</ErrorBanner>
			) : loading ? (
				<Spinner label='Loading' />
			) : channels.length === 0 ? (
				<EmptyState title='No channels'>
					Channels appear here after a library scan.
				</EmptyState>
			) : !shown.length ? (
				<EmptyState title='No matching channels'>Nothing matches &ldquo;{filter}&rdquo;.</EmptyState>
			) : (
				<div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
					{shown.map((channel) => (
						<ChannelCard key={channel.uploaderId} channel={channel} />
					))}
				</div>
			)}
		</Page>
	);
}
