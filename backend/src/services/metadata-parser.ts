// ============================================
// METADATA PARSER
// ============================================
// Extracts metadata from info.json and filenames

import { readFile, stat } from "fs/promises";
import { join, basename } from "path";
import type {
	VideoCandidate,
	ParsedMetadata,
	InfoJson,
	SubtitleInfo,
	Library,
	ChannelOverrides,
} from "../types/index.js";
import {
	extractYouTubeId,
	isMediaFile,
	isSubtitleFile,
	isThumbnailFile,
} from "./scanner.js";

export class MetadataParser {
	async parseCandidate(
		candidate: VideoCandidate,
		library: Library
	): Promise<ParsedMetadata | null> {
		try {
			const videoId = this.findVideoId(candidate);
			if (!videoId) {
				console.warn(`No video ID found in ${candidate.path}`);
				return null;
			}

			// Find info.json file
			const infoJsonFile = candidate.files.find((f) =>
				f.endsWith(".info.json")
			);
			let infoJson: InfoJson | null = null;
			let infoJsonPath: string | undefined;
			let infoJsonMtime: string | undefined;

			if (infoJsonFile) {
				infoJsonPath = join(candidate.path, infoJsonFile);
				try {
					const content = await readFile(infoJsonPath, "utf-8");
					infoJson = JSON.parse(content);

					// Get file modification time for change detection
					const stats = await stat(infoJsonPath);
					infoJsonMtime = stats.mtime.toISOString();
				} catch (error) {
					console.error(`Failed to parse ${infoJsonPath}:`, error);
				}
			}

			const mediaFile = candidate.files.find(isMediaFile);
			if (!mediaFile) {
				console.warn(`No media file found in ${candidate.path}`);
				return null;
			}

			const videoPath = join(candidate.path, mediaFile);

			// Get media file stats
			const mediaStats = await stat(videoPath);
			const mediaMtime = mediaStats.mtime.toISOString();
			const filesizeBytes = mediaStats.size;

			// Find thumbnail
			const thumbnailFile = this.findThumbnail(candidate.files);
			const thumbnailPath = thumbnailFile
				? join(candidate.path, thumbnailFile)
				: undefined;

			// Find subtitles
			const subtitles = this.findSubtitles(candidate, videoId);

			// Build metadata from info.json or filename
			const metadata = infoJson
				? this.parseFromInfoJson(infoJson, videoId, videoPath, candidate.overrides)
				: this.parseFromFilename(mediaFile, videoId, videoPath, candidate.overrides);

			return {
				...metadata,
				videoPath,
				thumbnailPath,
				infoJsonPath,
				subtitles,
				filesizeBytes,
				infoJsonMtime,
				mediaMtime,
				libraryPath: library.path,
				mediaType: library.mediaType,
			};
		} catch (error) {
			console.error(
				`Error parsing candidate ${candidate.path}:`,
				error
			);
			return null;
		}
	}

	private findVideoId(candidate: VideoCandidate): string | null {
		// If already provided (loose files)
		if (candidate.videoId) return candidate.videoId;

		// Try directory name
		const dirId = extractYouTubeId(basename(candidate.path));
		if (dirId) return dirId;

		// Try first media file
		const mediaFile = candidate.files.find(isMediaFile);
		if (mediaFile) {
			return extractYouTubeId(mediaFile);
		}

		return null;
	}

	private parseFromInfoJson(
		info: InfoJson,
		videoId: string,
		videoPath: string,
		overrides?: ChannelOverrides
	): Omit<
		ParsedMetadata,
		| "videoPath"
		| "thumbnailPath"
		| "infoJsonPath"
		| "subtitles"
		| "filesizeBytes"
		| "infoJsonMtime"
		| "mediaMtime"
		| "libraryPath"
		| "mediaType"
	> {
		// Apply overrides only when info.json doesn't have the field (info.json has highest priority)
		const uploader = info.uploader || overrides?.force_channel_name || overrides?.force_uploader;
		const uploaderId = info.channel_id || overrides?.force_channel_id;

		return {
			videoId,
			title: info.title || `Video ${videoId}`,
			uploader,
			uploaderId,
			uploadDate: this.normalizeDate(info.upload_date),
			durationSeconds: info.duration,
			description: info.description,
			tags: info.tags,
			resolution:
				info.resolution ||
				(info.width && info.height
					? `${info.width}x${info.height}`
					: undefined),
			videoCodec: info.vcodec,
			audioCodec: info.acodec,
			metadataSource: "info_json",
			hasCompleteMetadata: this.determineCompleteness(info),
		};
	}

	private parseFromFilename(
		filename: string,
		videoId: string,
		videoPath: string,
		overrides?: ChannelOverrides
	): Omit<
		ParsedMetadata,
		| "videoPath"
		| "thumbnailPath"
		| "infoJsonPath"
		| "subtitles"
		| "filesizeBytes"
		| "infoJsonMtime"
		| "mediaMtime"
		| "libraryPath"
		| "mediaType"
	> {
		let cleaned = filename
			.replace(/\.[^.]+$/, "") // Remove extension
			.replace(/\[[A-Za-z0-9_-]{11}\]/, "") // Remove [ID]
			.trim();

		// Try to extract date prefix (YYYY-MM-DD or YYYYMMDD)
		const dateMatch = cleaned.match(/^(\d{4}-\d{2}-\d{2}|\d{8})/);
		let uploadDate: string | undefined;

		if (dateMatch) {
			uploadDate = this.normalizeDate(dateMatch[1]);
			cleaned = cleaned
				.substring(dateMatch[0].length)
				.replace(/^[\s-]+/, "");
		}

		// Apply overrides (always, since filename parsing doesn't have channel info)
		const uploader = overrides?.force_channel_name || overrides?.force_uploader;
		const uploaderId = overrides?.force_channel_id;

		return {
			videoId,
			title: cleaned || `Video ${videoId}`,
			uploader,
			uploaderId,
			uploadDate,
			metadataSource: "filename",
			hasCompleteMetadata: false,
		};
	}

	private findThumbnail(files: string[]): string | undefined {
		const thumbnails = files.filter(isThumbnailFile);

		// preference => webp > jpg > png
		const webp = thumbnails.find((f) => f.endsWith(".webp"));
		if (webp) return webp;
		const jpg = thumbnails.find((f) => f.match(/\.(jpg|jpeg)$/i));
		if (jpg) return jpg;

		const png = thumbnails.find((f) => f.endsWith(".png"));
		return png;
	}

	private findSubtitles(
		candidate: VideoCandidate,
		videoId: string
	): SubtitleInfo[] {
		return candidate.files
			.filter(isSubtitleFile)
			.filter((f) => f.includes(videoId)) // Must contain the video ID
			.map((filename) => {
				const path = join(candidate.path, filename);

				// Try to extract language code (e.g., .en.vtt)
				const langMatch = filename.match(
					/\.([a-z]{2})\.(?:vtt|srt|ass)$/i
				);
				const language = langMatch ? langMatch[1] : undefined;

				// Extract kind
				const kind = filename.endsWith(".vtt")
					? "vtt"
					: filename.endsWith(".srt")
					? "srt"
					: "ass";

				return {
					language,
					kind,
					path,
				};
			});
	}

	private normalizeDate(dateStr?: string): string | undefined {
		if (!dateStr) return undefined;

		// YYYYMMDD -> YYYY-MM-DD
		if (/^\d{8}$/.test(dateStr)) {
			return `${dateStr.slice(0, 4)}-${dateStr.slice(
				4,
				6
			)}-${dateStr.slice(6, 8)}`;
		}

		// Already in YYYY-MM-DD format
		if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
			return dateStr;
		}

		return undefined;
	}

	private determineCompleteness(info: InfoJson): boolean {
		return !!(
			info.title &&
			info.uploader &&
			info.upload_date &&
			info.duration &&
			(info.resolution || (info.width && info.height))
		);
	}
}
