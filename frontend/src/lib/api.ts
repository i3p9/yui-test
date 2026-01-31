import type {
	HealthResponse,
	Config,
	Library,
	ScanProgress,
	ScanLog,
	VideoStats,
	// Video,
	VideoDetails,
	PaginatedVideos,
	MetadataStats,
	MetadataFetchStatus,
	DangerStats,
	ResetResult,
} from "../types";

const API_BASE = "/api";

// Helper for fetch with error handling
async function fetchAPI<T>(
	endpoint: string,
	options?: RequestInit
): Promise<T> {
	const response = await fetch(`${API_BASE}${endpoint}`, {
		headers: {
			"Content-Type": "application/json",
			...options?.headers,
		},
		...options,
	});

	if (!response.ok) {
		const error = await response
			.json()
			.catch(() => ({ error: "Unknown error" }));
		throw new Error(error.error || `HTTP ${response.status}`);
	}

	return response.json();
}

// Health
export const getHealth = () => fetchAPI<HealthResponse>("/health");

// Config
export const getConfig = () => fetchAPI<Config>("/config");
export const getLibraries = () =>
	fetchAPI<Library[]>("/config/libraries");
export const updateConfig = (config: Config) =>
	fetchAPI<{ message: string }>("/config", {
		method: "POST",
		body: JSON.stringify(config),
	});

// Scan
export const startScan = (options: {
	mode: "full" | "incremental";
	libraryPath?: string;
}) =>
	fetchAPI<{ message: string; mode: string; libraryPath: string }>(
		"/scan",
		{
			method: "POST",
			body: JSON.stringify(options),
		}
	);

export const getScanStatus = () =>
	fetchAPI<ScanProgress>("/scan/status");
export const getScanHistory = () =>
	fetchAPI<ScanLog[]>("/scan/history");
export const getLatestScan = () => fetchAPI<ScanLog>("/scan/latest");

// Videos
export const getVideos = (params?: {
	page?: number;
	limit?: number;
	mediaType?: string;
	uploader?: string;
	missingOnDisk?: boolean;
	sort?: string;
	order?: "asc" | "desc";
}) => {
	const searchParams = new URLSearchParams();
	if (params) {
		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined) {
				searchParams.append(key, String(value));
			}
		});
	}
	const query = searchParams.toString();
	return fetchAPI<PaginatedVideos>(
		`/videos${query ? `?${query}` : ""}`
	);
};

export const getVideo = (id: string) =>
	fetchAPI<VideoDetails>(`/videos/${id}`);
export const getVideoStats = () =>
	fetchAPI<VideoStats>("/videos/stats/summary");

// Library
export const getLatestVideos = (params?: {
	page?: number;
	limit?: number;
}) => {
	const searchParams = new URLSearchParams();
	if (params) {
		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined) {
				searchParams.append(key, String(value));
			}
		});
	}
	const query = searchParams.toString();
	return fetchAPI<PaginatedVideos>(
		`/library/latest${query ? `?${query}` : ""}`
	);
};

export const getChannels = () =>
	fetchAPI<{ channels: any[] }>("/library/channels");

export const getChannelThumbnailUrl = (uploaderId: string) =>
	`/api/library/channels/${uploaderId}/thumbnail`;

export const getChannelVideos = (
	uploaderId: string,
	params?: { page?: number; limit?: number; sort?: string }
) => {
	const searchParams = new URLSearchParams();
	if (params) {
		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined) {
				searchParams.append(key, String(value));
			}
		});
	}
	const query = searchParams.toString();
	return fetchAPI<{ channel: any; videos: any[]; pagination: any }>(
		`/library/channels/${uploaderId}/videos${
			query ? `?${query}` : ""
		}`
	);
};

export const getLikedVideos = (params?: {
	page?: number;
	limit?: number;
}) => {
	const searchParams = new URLSearchParams();
	if (params) {
		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined) {
				searchParams.append(key, String(value));
			}
		});
	}
	const query = searchParams.toString();
	return fetchAPI<PaginatedVideos>(
		`/library/liked${query ? `?${query}` : ""}`
	);
};

export const getRelatedVideos = (videoId: string, limit = 20) =>
	fetchAPI<{ videos: any[] }>(
		`/library/video/${videoId}/related?limit=${limit}`
	);

export const getVideoNavigation = (videoId: string) =>
	fetchAPI<{ prev: any | null; next: any | null }>(
		`/library/video/${videoId}/navigation`
	);

// Streaming
export const getStreamUrl = (videoId: string) =>
	`/api/stream/${videoId}`;

// Thumbnails - new API using videoId and size
export const getThumbnailUrl = (
	videoId: string,
	size: "small" | "large" = "small"
) => `/api/stream/thumbnail/${videoId}/${size}`;

// Legacy thumbnail URL (for backwards compatibility)
export const getLegacyThumbnailUrl = (filename: string | null) =>
	filename ? `/api/stream/thumbnail/${filename}` : null;

// Progress
export const updateWatchProgress = (
	videoId: string,
	positionSeconds: number,
	durationSeconds?: number
) =>
	fetchAPI<{ success: boolean; progress: any }>(
		`/progress/${videoId}`,
		{
			method: "POST",
			body: JSON.stringify({ positionSeconds, durationSeconds }),
		}
	);

export const getWatchProgress = (videoId: string) =>
	fetchAPI<{ progress: any | null }>(`/progress/${videoId}`);

// Metadata
export const getMetadataStats = () =>
	fetchAPI<MetadataStats>("/metadata/stats");

export const startMetadataFetch = (
	videoIds?: string[],
	saveLocation?: "with_video" | "app_data"
) =>
	fetchAPI<{ message: string; count: number }>("/metadata/fetch", {
		method: "POST",
		body: JSON.stringify({ videoIds, saveLocation }),
	});

export const getMetadataFetchStatus = () =>
	fetchAPI<MetadataFetchStatus>("/metadata/status");

// Danger Zone
export const getDangerStats = () =>
	fetchAPI<DangerStats>("/danger/stats");

export const resetDatabase = (options: {
	removeThumbnails?: boolean;
	removeMetadata?: boolean;
}) =>
	fetchAPI<ResetResult>("/danger/reset", {
		method: "POST",
		body: JSON.stringify(options),
	});

// Search
export const searchAutocomplete = (
	query: string,
	limits?: { channelLimit?: number; videoLimit?: number }
) => {
	const searchParams = new URLSearchParams({ q: query });
	if (limits?.channelLimit) {
		searchParams.append('channelLimit', String(limits.channelLimit));
	}
	if (limits?.videoLimit) {
		searchParams.append('videoLimit', String(limits.videoLimit));
	}
	return fetchAPI<{
		query: string;
		channels: any[];
		videos: any[];
	}>(`/search/autocomplete?${searchParams.toString()}`);
};

export const searchFull = (
	query: string,
	options?: {
		type?: 'all' | 'videos' | 'channels';
		page?: number;
		limit?: number;
	}
) => {
	const searchParams = new URLSearchParams({ q: query });
	if (options?.type) {
		searchParams.append('type', options.type);
	}
	if (options?.page) {
		searchParams.append('page', String(options.page));
	}
	if (options?.limit) {
		searchParams.append('limit', String(options.limit));
	}
	return fetchAPI<{
		query: string;
		results: {
			channels: {
				items: any[];
				total: number;
			};
			videos: {
				items: any[];
				total: number;
				pagination: {
					page: number;
					limit: number;
					pages: number;
				};
			};
		};
		totalResults: number;
	}>(`/search?${searchParams.toString()}`);
};
