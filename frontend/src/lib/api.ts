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
