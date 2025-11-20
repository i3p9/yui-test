// ============================================
// SCAN ORCHESTRATOR
// ============================================
// Coordinates scanner, parser, and database

import { Scanner } from "./scanner.js";
import { MetadataParser } from "./metadata-parser.js";
import { DatabaseService } from "./database-service.js";
import { ThumbnailGenerator } from "./thumbnail-generator.js";
import {
	MetadataFetcher,
	type MetadataFetchJob,
} from "./metadata-fetcher.js";
import { loadConfig } from "../lib/config.js";
import { scanState } from "../lib/scan-state.js";
import type { ScanResult } from "../types/index.js";
import type { ThumbnailJob } from "./thumbnail-generator.js";
import { join } from "path";

export class ScanOrchestrator {
	private scanner = new Scanner();
	private parser = new MetadataParser();
	private db = new DatabaseService();

	async scan(options?: {
		libraryPath?: string;
		mode?: "full" | "incremental";
	}): Promise<ScanResult> {
		const startTime = Date.now();
		const mode = options?.mode || "full";
		const config = await loadConfig();

		const librariesToScan = options?.libraryPath
			? config.libraries.filter(
					(lib) => lib.path === options.libraryPath
			  )
			: config.libraries;

		if (librariesToScan.length === 0) {
			throw new Error(`No libraries found to scan`);
		}

		// Create scan log
		const scanId = await this.db.createScanLog({
			libraryPath: options?.libraryPath,
			mode,
		});

		scanState.start(scanId, options?.libraryPath, mode);

		const stats = {
			videosScanned: 0,
			videosAdded: 0,
			videosUpdated: 0,
			videosRemoved: 0,
			errors: [] as string[],
		};

		const seenVideoIds = new Set<string>();
		const seenUploaderIds = new Set<string>();

		try {
			for (const library of librariesToScan) {
				scanState.updateProgress({ currentLibrary: library.name });
				if (library.skip) {
					console.log(`Skipping library: ${library.name}`);
					continue;
				}

				console.log(`\n${"=".repeat(60)}`);
				console.log(`Scanning: ${library.name}`);
				console.log(`Path: ${library.path}`);
				console.log("=".repeat(60));

				try {
					// Walk the library and find video candidates
					const candidates = await this.scanner.scanLibrary(library);
					console.log(`Found ${candidates.length} candidates`);

					for (const candidate of candidates) {
						try {
							const metadata = await this.parser.parseCandidate(
								candidate,
								library
							);

							if (!metadata) {
								stats.errors.push(
									`Failed to parse: ${candidate.path}`
								);
								continue;
							}

							seenVideoIds.add(metadata.videoId);
							if (metadata.uploaderId) {
								seenUploaderIds.add(metadata.uploaderId);
							}

							const existsBefore = await this.videoExists(
								metadata.videoId
							);

							await this.db.upsertVideo(metadata, library);

							// Track stats
							stats.videosScanned++;
							if (!existsBefore) {
								stats.videosAdded++;
							} else {
								stats.videosUpdated++;
							}

							// progress update
							scanState.updateProgress({
								videosScanned: stats.videosScanned,
								videosAdded: stats.videosAdded,
								videosUpdated: stats.videosUpdated,
							});

							console.log(`✓ ${metadata.videoId}: ${metadata.title}`);
						} catch (error) {
							const msg = `Error processing ${candidate.path}: ${error}`;
							console.error(msg);
							stats.errors.push(msg);
						}
					}
					// Update channel stats
					for (const uploaderId of seenUploaderIds) {
						try {
							await this.db.updateChannelStats(uploaderId);
						} catch (error) {
							console.error(
								`Failed to update channel stats for ${uploaderId}:`,
								error
							);
						}
					}
				} catch (error) {
					const msg = `Error scanning library ${library.name}: ${error}`;
					console.error(msg);
					stats.errors.push(msg);
				}
			}

			// Mark videos as missing if they weren't seen
			const removed = await this.db.markMissingVideos(
				seenVideoIds,
				options?.libraryPath
			);
			stats.videosRemoved = removed;

			// PHASE 2: Generate thumbnails if enabled
			if (config.scanOptions.generateThumbnails) {
				await this.generateThumbnails(config, options?.libraryPath);
			}

			// PHASE 3: Fetch metadata if enabled
			if (config.scanOptions.fetchMetadata) {
				await this.fetchMetadata(config, options?.libraryPath);
			}

			await this.db.completeScanLog(scanId, stats);

			scanState.complete();

			const duration = Date.now() - startTime;
			console.log(`\n${"=".repeat(60)}`);
			console.log("Scan complete!");
			console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
			console.log(`Scanned: ${stats.videosScanned}`);
			console.log(`Added: ${stats.videosAdded}`);
			console.log(`Updated: ${stats.videosUpdated}`);
			console.log(`Removed: ${stats.videosRemoved}`);
			console.log(`Errors: ${stats.errors.length}`);
			console.log("=".repeat(60));

			return {
				...stats,
				duration,
			};
		} catch (error) {
			await this.db.failScanLog(scanId, String(error));
			scanState.complete();

			throw error;
		}
	}

	private async videoExists(videoId: string): Promise<boolean> {
		const prisma = (this.db as any).prisma;
		const video = await prisma.video.findUnique({
			where: { videoId },
			select: { videoId: true },
		});
		return video !== null;
	}

	/**
	 * Generate thumbnails for all videos that need them
	 */
	private async generateThumbnails(
		config: any,
		libraryPath?: string
	): Promise<void> {
		console.log(`\n${"=".repeat(60)}`);
		console.log("PHASE 2: Generating Thumbnails");
		console.log("=".repeat(60));

		// Update scan phase
		scanState.updateProgress({ phase: "thumbnails" });

		const prisma = (this.db as any).prisma;

		// Get all videos that need thumbnails
		const videos = (await prisma.video.findMany({
			where: {
				missingOnDisk: false,
				hasThumbnails: false,
				...(libraryPath ? { libraryPath } : {}),
			},
			select: {
				videoId: true,
				videoPath: true,
				thumbnailPath: true,
				durationSeconds: true,
			},
		})) as Array<{
			videoId: string;
			videoPath: string;
			thumbnailPath: string | null;
			durationSeconds: number | null;
		}>;

		if (videos.length === 0) {
			console.log(
				"No thumbnails to generate - all videos have thumbnails!"
			);
			return;
		}

		console.log(`Found ${videos.length} videos needing thumbnails`);

		// Update progress
		scanState.updateProgress({
			thumbnailsTotal: videos.length,
			thumbnailsGenerated: 0,
			thumbnailsFailed: 0,
		});

		// Create thumbnail generator
		const thumbnailDir = join(
			process.cwd(),
			config.thumbnailDir || ".thumbnails"
		);
		const generator = new ThumbnailGenerator(
			thumbnailDir,
			config.scanOptions.thumbnailConcurrency || 2
		);

		// Prepare jobs
		const jobs: ThumbnailJob[] = videos.map((video) => ({
			videoId: video.videoId,
			videoPath: video.videoPath,
			existingThumbnailPath: video.thumbnailPath || undefined,
			durationSeconds: video.durationSeconds || undefined,
		}));

		// Generate thumbnails with progress tracking (only call once!)
		const results = await generator.generateBatch(
			jobs,
			(progress) => {
				scanState.updateProgress({
					thumbnailsGenerated: progress.completed,
					thumbnailsFailed: progress.failed,
					thumbnailsFromOriginal: progress.fromOriginal,
					thumbnailsFromExtraction: progress.fromExtraction,
					currentThumbnail: progress.current,
				});
			}
		);

		// Update database for successful thumbnail generations
		for (const [videoId, result] of results) {
			await prisma.video.update({
				where: { videoId },
				data: {
					hasThumbnails: true,
					thumbnailSource: result.source,
				},
			});
		}

		const finalState = scanState.getState();
		console.log(`\nThumbnail generation complete!`);
		console.log(
			`✓ Generated: ${finalState.thumbnailsGenerated || 0}`
		);
		console.log(
			`  - From original images: ${
				finalState.thumbnailsFromOriginal || 0
			}`
		);
		console.log(
			`  - Extracted from video: ${
				finalState.thumbnailsFromExtraction || 0
			}`
		);
		console.log(`✗ Failed: ${finalState.thumbnailsFailed || 0}`);
		console.log("=".repeat(60));
	}

	/**
	 * Fetch metadata for all videos that need them
	 */
	private async fetchMetadata(
		config: any,
		libraryPath?: string
	): Promise<void> {
		console.log(`\n${"=".repeat(60)}`);
		console.log("PHASE 3: Fetching Metadata");
		console.log("=".repeat(60));

		// Update scan phase
		scanState.updateProgress({ phase: "metadata" });

		const prisma = (this.db as any).prisma;

		// Get all videos that need metadata
		const videos = (await prisma.video.findMany({
			where: {
				missingOnDisk: false,
				hasCompleteMetadata: false,
				...(libraryPath ? { libraryPath } : {}),
			},
			select: {
				videoId: true,
				videoPath: true,
				thumbnailPath: true,
				thumbnailSource: true,
			},
		})) as Array<{
			videoId: string;
			videoPath: string;
			thumbnailPath: string | null;
			thumbnailSource: string | null;
		}>;

		if (videos.length === 0) {
			console.log(
				"No metadata to fetch - all videos have complete metadata!"
			);
			return;
		}

		console.log(`Found ${videos.length} videos needing metadata`);

		// Update progress
		scanState.updateProgress({
			metadataTotal: videos.length,
			metadataFetched: 0,
			metadataFailed: 0,
			metadataThumbnailsFetched: 0,
		});

		// Create metadata fetcher
		const metadataDir = join(
			process.cwd(),
			config.metadataDir || ".metadata"
		);
		const fetcher = new MetadataFetcher(
			metadataDir,
			config.scanOptions.metadataConcurrency || 1
		);

		// Prepare jobs
		const jobs: MetadataFetchJob[] = videos.map((video) => ({
			videoId: video.videoId,
			videoPath: video.videoPath,
			thumbnailPath: video.thumbnailPath || undefined,
			thumbnailSource: video.thumbnailSource || undefined,
		}));

		// Fetch metadata with progress tracking
		const results = await fetcher.fetchBatch(jobs, (progress) => {
			scanState.updateProgress({
				metadataFetched: progress.completed,
				metadataFailed: progress.failed,
				metadataThumbnailsFetched: progress.thumbnailsFetched,
				currentMetadata: progress.current,
			});
		});

		// Update database with fetched metadata
		for (const [videoId, result] of results) {
			const updateData: any = {
				hasCompleteMetadata:
					result.parsedMetadata.hasCompleteMetadata,
				metadataSource: "info_json",
				infoJsonPath: result.infoJsonPath,
			};

			// Update fields if they have values
			if (result.parsedMetadata.title) {
				updateData.title = result.parsedMetadata.title;
			}
			if (result.parsedMetadata.uploader) {
				updateData.uploader = result.parsedMetadata.uploader;
			}
			if (result.parsedMetadata.uploaderId) {
				updateData.uploaderId = result.parsedMetadata.uploaderId;
			}
			if (result.parsedMetadata.uploadDate) {
				updateData.uploadDate = result.parsedMetadata.uploadDate;
			}
			if (result.parsedMetadata.durationSeconds) {
				updateData.durationSeconds =
					result.parsedMetadata.durationSeconds;
			}
			if (result.parsedMetadata.description) {
				updateData.description = result.parsedMetadata.description;
			}
			if (result.parsedMetadata.tags) {
				updateData.tags = JSON.stringify(result.parsedMetadata.tags);
			}
			if (result.parsedMetadata.resolution) {
				updateData.resolution = result.parsedMetadata.resolution;
			}
			if (result.parsedMetadata.videoCodec) {
				updateData.videoCodec = result.parsedMetadata.videoCodec;
			}
			if (result.parsedMetadata.audioCodec) {
				updateData.audioCodec = result.parsedMetadata.audioCodec;
			}

			// Update thumbnail if fetched
			const originalThumbnailPath = jobs.find(
				(j) => j.videoId === videoId
			)?.thumbnailPath;
			if (
				result.thumbnailPath &&
				result.thumbnailPath !== originalThumbnailPath
			) {
				updateData.thumbnailPath = result.thumbnailPath;
			}

			await prisma.video.update({
				where: { videoId },
				data: updateData,
			});
		}

		const finalState = scanState.getState();
		console.log(`\nMetadata fetching complete!`);
		console.log(`✓ Fetched: ${finalState.metadataFetched || 0}`);
		console.log(
			`  - Thumbnails fetched: ${
				finalState.metadataThumbnailsFetched || 0
			}`
		);
		console.log(`✗ Failed: ${finalState.metadataFailed || 0}`);
		console.log("=".repeat(60));
	}
}
