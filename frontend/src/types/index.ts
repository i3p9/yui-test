// API Response Types

export interface HealthResponse {
	status: string;
	message: string;
	timestamp: string;
}

export interface Library {
	path: string;
	mediaType: string;
	name: string;
	skip?: boolean;
}

export interface Config {
	libraries: Library[];
	thumbnailDir: string;
	metadataDir: string;
	databaseUrl: string;
	scanOptions: {
		parallelism: number;
		followSymlinks: boolean;
		generateThumbnails: boolean;
		thumbnailConcurrency: number;
		fetchMetadata: boolean;
		metadataConcurrency: number;
	};
}

export interface ScanProgress {
	isRunning: boolean;
	scanId?: number;
	startedAt?: string;
	libraryPath?: string;
	mode?: "full" | "incremental";
	phase?: "scanning" | "thumbnails" | "metadata" | "complete";
	currentLibrary?: string;
	videosScanned: number;
	videosAdded: number;
	videosUpdated: number;
	errors: string[];

	// Thumbnail generation progress
	thumbnailsTotal?: number;
	thumbnailsGenerated?: number;
	thumbnailsFailed?: number;
	thumbnailsFromOriginal?: number;
	thumbnailsFromExtraction?: number;
	currentThumbnail?: string;

	// Metadata fetching progress
	metadataTotal?: number;
	metadataFetched?: number;
	metadataFailed?: number;
	metadataThumbnailsFetched?: number;
	currentMetadata?: string;
}

export interface ScanLog {
	id: number;
	startedAt: string;
	endedAt: string | null;
	status: "running" | "completed" | "failed";
	libraryPath: string | null;
	mode: "full" | "incremental";
	videosScanned: number | null;
	videosAdded: number | null;
	videosUpdated: number | null;
	videosRemoved: number | null;
	errors: string | null;
}

export interface VideoStats {
	totalVideos: number;
	byType: Array<{
		mediaType: string;
		count: number;
	}>;
	totalSizeBytes: number;
	thumbnails: {
		withThumbnails: number;
		withoutThumbnails: number;
		original: number;
		extracted: number;
		unknown: number;
	};
}

export interface Video {
	videoId: string;
	title: string;
	uploader: string | null;
	uploadDate: string | null;
	durationSeconds: number | null;
	thumbnailPath: string | null;
	hasThumbnails: boolean | null;
	thumbnailSource: string | null; // 'original' | 'extracted' | null
	resolution: string | null;
	metadataSource: string;
	hasCompleteMetadata: boolean;
	filesizeBytes: number | null;
	lastScannedAt: string;
}

export interface VideoDetails extends Video {
	uploaderId: string | null;
	description: string | null;
	tags: string | null;
	mediaType: string;
	libraryPath: string;
	videoPath: string;
	videoCodec: string | null;
	audioCodec: string | null;
	infoJsonMtime: string | null;
	mediaMtime: string | null;
	missingOnDisk: boolean;
	firstSeenAt: string;
	subtitles: Array<{
		id: number;
		videoId: string;
		language: string;
		kind: string;
		path: string;
		filesizeBytes: number;
	}>;
	watchProgress: {
		id: number;
		videoId: string;
		positionSeconds: number;
		totalSeconds: number;
		completed: boolean;
		lastWatchedAt: string;
	} | null;
}

export interface PaginatedVideos {
	videos: Video[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		pages: number;
	};
}

export interface MetadataStats {
	incompleteWithVideoId: number;
	incompleteTotal: number;
	fromFilename: number;
	generatedThumbnailsCount: number;
}

export interface MetadataFetchStatus {
	isRunning: boolean;
	phase?: string;
	metadataTotal?: number;
	metadataFetched?: number;
	metadataFailed?: number;
	metadataThumbnailsFetched?: number;
	currentMetadata?: string;
}

export interface DangerStats {
	database: {
		videos: number;
		channels: number;
		scanLogs: number;
		watchProgress: number;
		subtitles: number;
	};
	thumbnails: {
		count: number;
		path: string;
	};
	metadata: {
		count: number;
		path: string;
	};
}

export interface ResetResult {
	success: boolean;
	message: string;
	results: {
		database: {
			cleared: boolean;
			tables: string[];
		};
		thumbnails?: {
			removed: boolean;
			path: string;
		};
		metadata?: {
			removed: boolean;
			path: string;
		};
	};
}
