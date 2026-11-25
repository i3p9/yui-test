// ============================================
// THUMBNAIL GENERATOR SERVICE
// ============================================
// Generates optimized thumbnails from original images or video frames

import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, access, stat } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import pLimit from "p-limit";

const execFileAsync = promisify(execFile);
const FFMPEG_TIMEOUT_MS = 2 * 60_000; // a corrupt file must not hang the scan

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
	forceRegenerate?: boolean; // Force regeneration even if thumbnails exist
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
		const { videoId, videoPath, existingThumbnailPath, durationSeconds, forceRegenerate } =
			job;

		try {
			// Create output directory
			const outputDir = join(this.thumbnailDir, videoId);
			await mkdir(outputDir, { recursive: true });

			const smallPath = join(outputDir, "thumb_small.jpg");
			const largePath = join(outputDir, "thumb_large.jpg");

			// Check if thumbnails already exist and are valid (skip if forceRegenerate)
			if (!forceRegenerate && await this.thumbnailsExist(smallPath, largePath)) {
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
				await this.render(existingThumbnailPath, smallPath, largePath);
				source = "original";
			} else {
				// OPTION 2: Extract frame from video (slower, but necessary)
				console.log(`Extracting thumbnail from video for ${videoId}`);
				await this.render(videoPath, smallPath, largePath, this.getTimestamp(durationSeconds));
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
	 * Write both thumbnail sizes from one ffmpeg run: the input is opened and decoded
	 * once (one seek into the video on a spinning disk instead of two). Arguments are
	 * passed directly, not through a shell, so quotes, $ or backticks in titles are safe.
	 * `seekSeconds` extracts a frame from a video; omit it to resize an image.
	 */
	private async render(input: string, smallPath: string, largePath: string, seekSeconds?: number): Promise<void> {
		const fit = ({ width, height }: { width: number; height: number }) =>
			`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;
		const output = (label: string, path: string) => ["-map", `[${label}]`, "-frames:v", "1", "-q:v", "2", path];
		const args = [
			"-v", "error", "-y",
			...(seekSeconds !== undefined ? ["-ss", String(seekSeconds)] : []), // before -i: fast seek
			"-i", input,
			"-filter_complex", `[0:v]split=2[a][b];[a]${fit(this.SMALL_SIZE)}[s];[b]${fit(this.LARGE_SIZE)}[l]`,
			...output("s", smallPath),
			...output("l", largePath),
		];
		try {
			await execFileAsync("ffmpeg", args, { timeout: FFMPEG_TIMEOUT_MS });
		} catch (error) {
			throw new Error(`ffmpeg failed for ${input}: ${error instanceof Error ? error.message : String(error)}`);
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
