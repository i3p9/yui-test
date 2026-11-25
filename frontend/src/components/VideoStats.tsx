import { useEffect, useState } from "react";
import { getVideoStats } from "../lib/api";
import type { VideoStats as VideoStatsType } from "../types";
import { mediaTypeHumanReadable } from "../utils/utils";
import { ErrorBanner, Stat } from "./ui";

const formatBytes = (bytes: number) => {
	if (!bytes) return "0 B";
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${(bytes / 1024 ** i).toFixed(i > 2 ? 2 : 0)} ${["B", "KB", "MB", "GB", "TB"][i]}`;
};

/** One-row summary of the library, shown at the top of Config. */
export function VideoStats() {
	const [stats, setStats] = useState<VideoStatsType | null>(null);
	const [error, setError] = useState<string | null>(null);

	const loadStats = () => {
		setError(null);
		getVideoStats().then(setStats).catch((err) => setError(err.message));
	};
	useEffect(loadStats, []);

	if (error) return <ErrorBanner onRetry={loadStats}>Library stats: {error}</ErrorBanner>;

	const t = stats?.thumbnails;
	return (
		<div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2" aria-busy={!stats}>
			<Stat label="Videos" value={stats?.totalVideos ?? "—"} />
			<Stat label="Size on disk" value={stats ? formatBytes(stats.totalSizeBytes) : "—"} />
			<Stat
				label="Thumbnails"
				value={t?.withThumbnails ?? "—"}
				tone={t && t.withoutThumbnails > 0 ? "warn" : "default"}
				hint={t && `${t.withoutThumbnails} missing · ${t.original} original · ${t.extracted} generated`}
			/>
			{(stats?.byType ?? []).slice(0, 2).map((type) => (
				<Stat key={type.mediaType} label={mediaTypeHumanReadable(type.mediaType)} value={type.count} />
			))}
		</div>
	);
}
