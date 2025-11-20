// ============================================
// METADATA FETCHER SERVICE
// ============================================
// Fetches missing metadata from YouTube using yt-dlp

import { exec } from "child_process";
import { promisify } from "util";
import { mkdir, readFile, stat } from "fs/promises";
import { join, basename } from "path";
import { existsSync } from "fs";
import pLimit from "p-limit";
import type { InfoJson } from "../types/index.js";

const execAsync = promisify(exec);

export interface MetadataFetchJob {
	videoId: string;
	videoPath: string; // For reference
	thumbnailPath?: string; // Current thumbnail path
	thumbnailSource?: string; // 'original' | 'extracted' | null
}

export interface MetadataFetchResult {
	videoId: string;
	infoJsonPath: string;
	thumbnailPath?: string;
	parsedMetadata: ParsedMetadataResult;
}

export interface ParsedMetadataResult {
	title?: string;
	uploader?: string;
	uploaderId?: string;
	uploadDate?: string;
	durationSeconds?: number;
	description?: string;
	tags?: string[];
	resolution?: string;
	videoCodec?: string;
	audioCodec?: string;
	hasCompleteMetadata: boolean;
}

export interface MetadataFetchProgress {
	total: number;
	completed: number;
	failed: number;
	current?: string; // Current video being processed
	metadataFetched: number;
	thumbnailsFetched: number;
}

export class MetadataFetcher {
	private metadataDir: string;
	private concurrency: number;
	private limiter: ReturnType<typeof pLimit>;

	constructor(metadataDir: string, concurrency: number = 2) {
		this.metadataDir = metadataDir;
		this.concurrency = concurrency;
		this.limiter = pLimit(concurrency);
	}

	/**
	 * Fetch metadata for a single video using yt-dlp
	 */
	async fetchForVideo(
		job: MetadataFetchJob
	): Promise<MetadataFetchResult | null> {
		const { videoId, thumbnailPath, thumbnailSource } = job;

		try {
			// Create output directory
			const outputDir = join(this.metadataDir, videoId);
			await mkdir(outputDir, { recursive: true });

			const infoJsonPath = join(outputDir, "info.json");
			const thumbnailOutputPath = join(outputDir, `${videoId}.webp`);

			// Check if metadata already exists
			const metadataExists = existsSync(infoJsonPath);
			const shouldFetchThumbnail =
				!thumbnailPath || thumbnailSource === "extracted";

			if (metadataExists && !shouldFetchThumbnail) {
				console.log(
					`Metadata already exists for ${videoId}, skipping fetch`
				);
				const metadata = await this.parseInfoJson(infoJsonPath);
				return {
					videoId,
					infoJsonPath,
					thumbnailPath,
					parsedMetadata: metadata,
				};
			}

			console.log(
				`Fetching metadata for ${videoId} from YouTube using yt-dlp`
			);

			// Build yt-dlp command
			const command = this.buildYtDlpCommand(
				videoId,
				outputDir,
				shouldFetchThumbnail
			);

			// Execute yt-dlp
			await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });

			// Check if info.json was created
			if (!existsSync(infoJsonPath)) {
				throw new Error("info.json not created by yt-dlp");
			}

			// Parse the fetched metadata
			const metadata = await this.parseInfoJson(infoJsonPath);

			// Check if thumbnail was fetched
			let fetchedThumbnailPath = thumbnailPath;
			if (shouldFetchThumbnail && existsSync(thumbnailOutputPath)) {
				fetchedThumbnailPath = thumbnailOutputPath;
				console.log(`Thumbnail fetched for ${videoId}`);
			}

			return {
				videoId,
				infoJsonPath,
				thumbnailPath: fetchedThumbnailPath,
				parsedMetadata: metadata,
			};
		} catch (error) {
			console.error(`Failed to fetch metadata for ${videoId}:`, error);
			return null;
		}
	}

	/**
	 * Fetch metadata for multiple videos in batch
	 */
	async fetchBatch(
		jobs: MetadataFetchJob[],
		onProgress?: (progress: MetadataFetchProgress) => void
	): Promise<Map<string, MetadataFetchResult>> {
		const results = new Map<string, MetadataFetchResult>();
		let completed = 0;
		let failed = 0;
		let metadataFetched = 0;
		let thumbnailsFetched = 0;

		// Process jobs with concurrency limit
		await Promise.all(
			jobs.map((job) =>
				this.limiter(async () => {
					// Update progress
					if (onProgress) {
						onProgress({
							total: jobs.length,
							completed,
							failed,
							current: job.videoId,
							metadataFetched,
							thumbnailsFetched,
						});
					}

					const result = await this.fetchForVideo(job);

					if (result) {
						results.set(job.videoId, result);
						completed++;
						metadataFetched++;

						if (result.thumbnailPath && result.thumbnailPath !== job.thumbnailPath) {
							thumbnailsFetched++;
						}
					} else {
						failed++;
					}

					// Update final progress for this job
					if (onProgress) {
						onProgress({
							total: jobs.length,
							completed,
							failed,
							metadataFetched,
							thumbnailsFetched,
						});
					}
				})
			)
		);

		return results;
	}

	/**
	 * Build yt-dlp command for fetching metadata
	 */
	private buildYtDlpCommand(
		videoId: string,
		outputDir: string,
		fetchThumbnail: boolean
	): string {
		const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

		// Base command
		const parts = [
			"yt-dlp",
			"--write-info-json",
			"--skip-download", // Don't download the video
		];

		// Add thumbnail fetching if needed
		if (fetchThumbnail) {
			parts.push("--write-thumbnail");
		}

		// Output template
		parts.push("-o", `"${join(outputDir, videoId)}.%(ext)s"`);

		// Video URL
		parts.push(`"${videoUrl}"`);

		return parts.join(" ");
	}

	/**
	 * Parse info.json file and extract relevant metadata
	 */
	private async parseInfoJson(
		infoJsonPath: string
	): Promise<ParsedMetadataResult> {
		try {
			const content = await readFile(infoJsonPath, "utf-8");
			const info: InfoJson = JSON.parse(content);

			return {
				title: info.title,
				uploader: info.uploader,
				uploaderId: info.channel_id,
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
				hasCompleteMetadata: this.determineCompleteness(info),
			};
		} catch (error) {
			console.error(`Failed to parse info.json: ${error}`);
			return {
				hasCompleteMetadata: false,
			};
		}
	}

	/**
	 * Normalize date format to YYYY-MM-DD
	 */
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

	/**
	 * Determine if metadata is complete
	 */
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
