export interface Config {
	libraries: Library[];
	thumbnailDir: string;
	databaseUrl: string;
	scanOptions: ScanOptions;
}

export interface Library {
	path: string;
	mediaType: "channel_archive" | "liked_videos";
	name: string;
	skip: boolean;
}

export interface ScanOptions {
	parallelism: number;
	followSymlinks: boolean;
	generateThumbnails: boolean;
	thumbnailConcurrency: number;
}

export interface ScanResult {
	videosScanned: number;
	videosAdded: number;
	videosUpdated: number;
	videosRemoved: number;
	errors: string[];
	duration: number;
}

export interface ChannelOverrides {
	force_channel_name?: string;
	force_channel_id?: string;
	force_uploader?: string;
	[key: string]: any; // Allow extensibility for future fields
}

export interface VideoCandidate {
	type: "directory" | "loose";
	path: string;
	files: string[];
	videoId?: string;
	overrides?: ChannelOverrides;
}

export interface ParsedMetadata {
	videoId: string;
	title: string;
	uploader?: string;
	uploaderId?: string;
	uploadDate?: string;
	durationSeconds?: number;
	description?: string;
	tags?: string[];
	resolution?: string;
	videoCodec?: string;
	audioCodec?: string;
	videoPath: string;
	thumbnailPath?: string;
	infoJsonPath?: string;
	subtitles: SubtitleInfo[];
	filesizeBytes: number;
	infoJsonMtime?: string;
	mediaMtime: string;
	libraryPath: string;
	mediaType: "channel_archive" | "liked_videos";
	metadataSource: "info_json" | "filename";
	hasCompleteMetadata: boolean;
}

export interface SubtitleInfo {
	language?: string;
	kind?: string;
	path: string;
	filesizeBytes?: number;
}

export interface InfoJson {
	id: string;
	title?: string;
	uploader?: string;
	channel_id?: string;
	upload_date?: string;
	duration?: number;
	description?: string;
	tags?: string[];
	resolution?: string;
	width?: number;
	height?: number;
	vcodec?: string;
	acodec?: string;
	filesize?: number;
	[key: string]: any;
}
