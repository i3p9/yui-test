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
	Channel,
	ChannelImageStatus,
} from "../types";
import { getToken, clearToken } from "./auth";

const API_BASE = "/api";

// Fired when any API call gets a 401 — App.tsx listens to redirect to login
export const AUTH_EXPIRED_EVENT = "yui:auth-expired";

// Helper for fetch with error handling
async function fetchAPI<T>(
	endpoint: string,
	options?: RequestInit
): Promise<T> {
	const token = getToken();
	const hasBody = options?.body !== undefined && options?.body !== null;
	const isFormData =
		typeof FormData !== "undefined" && options?.body instanceof FormData;
	const headers: HeadersInit = {
		...(hasBody && !isFormData
			? { "Content-Type": "application/json" }
			: {}),
		...(token ? { Authorization: `Bearer ${token}` } : {}),
		...options?.headers,
	};

	const response = await fetch(`${API_BASE}${endpoint}`, {
		headers,
		...options,
	});

	if (response.status === 401) {
		// Token expired or invalid — clear it and signal the app to show login
		clearToken();
		window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
		throw new Error("Unauthorized");
	}

	if (!response.ok) {
		const error = await response
			.json()
			.catch(() => ({ error: "Unknown error" }));
		throw new Error(error.error || `HTTP ${response.status}`);
	}

	return response.json();
}

// Auth
export const getAuthStatus = () =>
	fetchAPI<{ authEnabled: boolean }>("/auth/status");

export const login = (password: string) =>
	fetchAPI<{ token: string }>("/auth/login", {
		method: "POST",
		body: JSON.stringify({ password }),
	});

export const logout = () =>
	fetchAPI<{ ok: boolean }>("/auth/logout", { method: "POST" });

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
	fetchAPI<{ channels: Channel[] }>("/library/channels");

export const getChannelThumbnailUrl = (uploaderId: string) =>
	withToken(`/api/library/channels/${uploaderId}/thumbnail`);

export const getChannelAvatarUrl = (uploaderId: string) =>
	withToken(`/api/library/channels/${uploaderId}/avatar`);

export const getChannelBannerUrl = (uploaderId: string) =>
	withToken(`/api/library/channels/${uploaderId}/banner`);

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
	return fetchAPI<{
		channel: Channel;
		videos: PaginatedVideos["videos"];
		pagination: PaginatedVideos["pagination"];
	}>(
		`/library/channels/${uploaderId}/videos${
			query ? `?${query}` : ""
		}`
	);
};

export const getLikedVideos = (params?: {
	page?: number;
	limit?: number;
	sort?: 'asc' | 'desc';
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
// Browsers can't send Authorization headers on <video src="..."> or <img src="...">,
// so we pass the token as a query param for all stream/thumbnail URLs.
function withToken(url: string): string {
	const token = getToken();
	return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

export const getStreamUrl = (videoId: string) =>
	withToken(`/api/stream/${videoId}`);

// Thumbnails - new API using videoId and size
export const getThumbnailUrl = (
	videoId: string,
	size: "small" | "large" = "small"
) => withToken(`/api/stream/thumbnail/${videoId}/${size}`);

// Legacy thumbnail URL (for backwards compatibility)
export const getLegacyThumbnailUrl = (filename: string | null) =>
	filename ? withToken(`/api/stream/thumbnail/${filename}`) : null;

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

// Channel Images
export const getChannelImageStatus = () =>
	fetchAPI<ChannelImageStatus>("/config/channel-images/status");

export const startChannelImageDownload = () =>
	fetchAPI<{ message: string }>("/config/channel-images/download", {
		method: "POST",
	});

// Liked Video Order
// The liked_order feature lets users order their liked videos chronologically.
// Since YouTube's API has no "liked at" timestamp, ordering is established via
// a one-time txt file import (Config page). New liked videos discovered in
// future scans are automatically assigned MAX(liked_order)+1.

export interface LikedOrderStatus {
	totalLiked: number;
	withOrder: number;
	isImported: boolean;
}

export interface LikedOrderImportResult {
	total: number;
	updated: number;
	notFound: number;
}

export const getLikedOrderStatus = () =>
	fetchAPI<LikedOrderStatus>("/config/liked-order/status");

/** Send the raw text content of the order txt file to the backend for import */
export const importLikedOrder = (content: string) =>
	fetchAPI<LikedOrderImportResult>("/config/liked-order/import", {
		method: "POST",
		body: JSON.stringify({ content }),
	});

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
