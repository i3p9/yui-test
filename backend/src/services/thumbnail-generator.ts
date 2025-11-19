// ============================================
// THUMBNAIL GENERATOR SERVICE
// ============================================
// Generates optimized thumbnails from original images or video frames

import { exec } from "child_process";
import { promisify } from "util";
import { mkdir, access, stat } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import pLimit from "p-limit";

const execAsync = promisify(exec);

export interface ThumbnailResult {
	videoId: string;
	smallPath: string; // Relative path: videoId/thumb_small.jpg
	largePath: string; // Relative path: videoId/thumb_large.jpg
	source: "original" | "extracted"; // Where it came from
}

export interface ThumbnailJob {
	videoId: string;
	videoPath: string;
	existingThumbnailPath?: string;
	durationSeconds?: number;
}

export interface ThumbnailProgress {
	total: number;
	completed: number;
	failed: number;
	current?: string; // Current video being processed
	fromOriginal: number; // Count generated from original thumbnails
	fromExtraction: number; // Count extracted from video
}

export class ThumbnailGenerator {
	private thumbnailDir: string;
	private concurrency: number;
	private limiter: ReturnType<typeof pLimit>;

	// Thumbnail sizes
	private readonly SMALL_SIZE = { width: 320, height: 180 };
	private readonly LARGE_SIZE = { width: 640, height: 360 };

	constructor(thumbnailDir: string, concurrency: number = 2) {
		this.thumbnailDir = thumbnailDir;
		this.concurrency = concurrency;
		this.limiter = pLimit(concurrency);
	}

	/**
	 * Generate thumbnails for a single video
	 */
	async generateForVideo(
		job: ThumbnailJob
	): Promise<ThumbnailResult | null> {
		const { videoId, videoPath, existingThumbnailPath, durationSeconds } =
			job;

		try {
			// Create output directory
			const outputDir = join(this.thumbnailDir, videoId);
			await mkdir(outputDir, { recursive: true });

			const smallPath = join(outputDir, "thumb_small.jpg");
			const largePath = join(outputDir, "thumb_large.jpg");

			// Check if thumbnails already exist and are valid
			if (await this.thumbnailsExist(smallPath, largePath)) {
				// Determine source by checking if original thumbnail exists
				const source = existingThumbnailPath
					? "original"
					: "extracted";
				return {
					videoId,
					smallPath: `${videoId}/thumb_small.jpg`,
					largePath: `${videoId}/thumb_large.jpg`,
					source,
				};
			}

			let source: "original" | "extracted";

			if (existingThumbnailPath && existsSync(existingThumbnailPath)) {
				// OPTION 1: Resize existing thumbnail (faster, better quality)
				console.log(
					`Resizing original thumbnail for ${videoId} from ${existingThumbnailPath}`
				);
				await this.resizeImage(
					existingThumbnailPath,
					smallPath,
					this.SMALL_SIZE.width,
					this.SMALL_SIZE.height
				);
				await this.resizeImage(
					existingThumbnailPath,
					largePath,
					this.LARGE_SIZE.width,
					this.LARGE_SIZE.height
				);
				source = "original";
			} else {
				// OPTION 2: Extract frame from video (slower, but necessary)
				console.log(`Extracting thumbnail from video for ${videoId}`);
				const timestamp = this.getTimestamp(durationSeconds);

				await this.extractFrame(
					videoPath,
					timestamp,
					smallPath,
					this.SMALL_SIZE.width,
					this.SMALL_SIZE.height
				);
				await this.extractFrame(
					videoPath,
					timestamp,
					largePath,
					this.LARGE_SIZE.width,
					this.LARGE_SIZE.height
				);
				source = "extracted";
			}

			return {
				videoId,
				smallPath: `${videoId}/thumb_small.jpg`,
				largePath: `${videoId}/thumb_large.jpg`,
				source,
			};
		} catch (error) {
			console.error(
				`Failed to generate thumbnail for ${videoId}:`,
				error
			);
			return null;
		}
	}

	/**
	 * Generate thumbnails for multiple videos in batch
	 */
	async generateBatch(
		jobs: ThumbnailJob[],
		onProgress?: (progress: ThumbnailProgress) => void
	): Promise<Map<string, ThumbnailResult>> {
		const results = new Map<string, ThumbnailResult>();
		let completed = 0;
		let failed = 0;
		let fromOriginal = 0;
		let fromExtraction = 0;

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
							fromOriginal,
							fromExtraction,
						});
					}

					const result = await this.generateForVideo(job);

					if (result) {
						results.set(job.videoId, result);
						completed++;

						if (result.source === "original") {
							fromOriginal++;
						} else {
							fromExtraction++;
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
							fromOriginal,
							fromExtraction,
						});
					}
				})
			)
		);

		return results;
	}

	/**
	 * Check if thumbnails already exist and are valid
	 */
	private async thumbnailsExist(
		smallPath: string,
		largePath: string
	): Promise<boolean> {
		try {
			await access(smallPath);
			await access(largePath);

			// Also check file sizes to ensure they're not empty/corrupted
			const smallStat = await stat(smallPath);
			const largeStat = await stat(largePath);

			return smallStat.size > 0 && largeStat.size > 0;
		} catch {
			return false;
		}
	}

	/**
	 * Resize an existing image to target dimensions
	 * Uses ffmpeg for consistency (could also use sharp/jimp for better performance)
	 */
	private async resizeImage(
		inputPath: string,
		outputPath: string,
		width: number,
		height: number
	): Promise<void> {
		// Ensure output directory exists
		await mkdir(dirname(outputPath), { recursive: true });

		// Use ffmpeg to resize with proper aspect ratio handling
		// -vf scale applies letterboxing if needed
		const command = [
			"ffmpeg",
			"-i", `"${inputPath}"`,
			"-vf", `"scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black"`,
			"-frames:v", "1",
			"-q:v", "2", // High quality JPEG
			"-y", // Overwrite
			`"${outputPath}"`,
		].join(" ");

		try {
			await execAsync(command);
		} catch (error) {
			throw new Error(
				`Failed to resize image: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Extract a frame from video at specified timestamp
	 */
	private async extractFrame(
		videoPath: string,
		timestamp: number,
		outputPath: string,
		width: number,
		height: number
	): Promise<void> {
		// Ensure output directory exists
		await mkdir(dirname(outputPath), { recursive: true });

		// Extract frame at timestamp with letterboxing
		const command = [
			"ffmpeg",
			"-ss", String(timestamp), // Seek to timestamp (before input for faster seeking)
			"-i", `"${videoPath}"`,
			"-vf", `"scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black"`,
			"-frames:v", "1",
			"-q:v", "2", // High quality JPEG
			"-y", // Overwrite
			`"${outputPath}"`,
		].join(" ");

		try {
			await execAsync(command);
		} catch (error) {
			throw new Error(
				`Failed to extract frame: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Calculate timestamp for frame extraction
	 * 10% into video, or 5 seconds, whichever is greater
	 */
	private getTimestamp(durationSeconds?: number): number {
		if (!durationSeconds || durationSeconds < 10) {
			return 5; // Default to 5 seconds for short/unknown videos
		}

		// 10% into the video, but at least 5 seconds
		return Math.max(5, Math.floor(durationSeconds * 0.1));
	}
}
