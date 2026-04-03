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

				console.log(`\nScanning: ${library.name} (${library.path})`);

				try {
					// Walk the library and find video candidates
					const candidates = await this.scanner.scanLibrary(library);
					console.log(`Found ${candidates.length} candidates`);

					// Parse metadata in parallel batches, but write to DB sequentially
					// (SQLite doesn't support concurrent writes)
					const BATCH_SIZE = 20;
					for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
						const batch = candidates.slice(i, i + BATCH_SIZE);

						// Parallel parse (file I/O is safe to parallelize)
						const parseResults = await Promise.allSettled(
							batch.map((candidate) =>
								this.parser.parseCandidate(candidate, library)
							)
						);

						// Sequential DB writes
						for (const settled of parseResults) {
							if (settled.status === 'rejected') {
								stats.errors.push(settled.reason?.message || String(settled.reason));
								continue;
							}

							const metadata = settled.value;
							if (!metadata) continue;

							try {
								const result = await this.db.upsertVideo(
									metadata,
									library,
									{ skipFtsSync: true }
								);
								seenVideoIds.add(metadata.videoId);
								if (metadata.uploaderId) {
									seenUploaderIds.add(metadata.uploaderId);
								}
								stats.videosScanned++;
								if (result === 'added') stats.videosAdded++;
								else if (result === 'updated') stats.videosUpdated++;
							} catch (error) {
								stats.errors.push(`DB error for ${metadata.videoId}: ${error}`);
							}
						}

						// Progress update per batch
						scanState.updateProgress({
							videosScanned: stats.videosScanned,
							videosAdded: stats.videosAdded,
							videosUpdated: stats.videosUpdated,
						});

						if (i % 200 === 0 && i > 0) {
							console.log(`  Processed ${i}/${candidates.length} candidates...`);
						}
					}

					console.log(`Processed ${candidates.length} candidates (${stats.videosAdded} new, ${stats.videosUpdated} updated)`);

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

			// Process channel images collected during the walk (no second traversal)
			await this.processChannelImages();

			// Mark videos as missing if they weren't seen
			const removed = await this.db.markMissingVideos(
				seenVideoIds,
				options?.libraryPath
			);
			stats.videosRemoved = removed;

			// Rebuild FTS indexes once (replaces per-video sync)
			await this.db.rebuildFtsIndexes();

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
			console.log(`\nScan complete! ${(duration / 1000).toFixed(1)}s — ${stats.videosScanned} scanned, ${stats.videosAdded} added, ${stats.videosUpdated} updated, ${stats.videosRemoved} removed, ${stats.errors.length} errors`);

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

	/**
	 * Scan for channel images and update channel records
	 */
	private async processChannelImages(): Promise<void> {
		const channelImages = this.scanner.getCollectedChannelImages();
		if (channelImages.length === 0) return;

		for (const channelImage of channelImages) {
			try {
				await this.db.updateChannelThumbnail(channelImage);
			} catch (error) {
				console.error(`Failed to update channel thumbnail for ${channelImage.channelName}:`, error);
			}
		}

		console.log(`Updated ${channelImages.length} channel images`);
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

		// Create metadata fetcher (save to app_data during scan)
		const metadataDir = join(
			process.cwd(),
			config.metadataDir || ".metadata"
		);
		const fetcher = new MetadataFetcher(
			metadataDir,
			config.scanOptions.metadataConcurrency || 1,
			"app_data"
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

			// Update thumbnail path if fetched
			const originalJob = jobs.find((j) => j.videoId === videoId);
			if (
				result.thumbnailPath &&
				result.thumbnailPath !== originalJob?.thumbnailPath
			) {
				updateData.thumbnailPath = result.thumbnailPath;
			}

			await prisma.video.update({
				where: { videoId },
				data: updateData,
			});
		}

		// PHASE 3b: Generate optimized thumbnails for videos that got new thumbnails
		const videosWithNewThumbnails = Array.from(results.entries())
			.filter(([videoId, result]) => {
				const originalJob = jobs.find((j) => j.videoId === videoId);
				// Include if: thumbnail was fetched OR thumbnail source was "extracted" (needs regeneration)
				return (
					(result.thumbnailPath && result.thumbnailPath !== originalJob?.thumbnailPath) ||
					originalJob?.thumbnailSource === "extracted"
				);
			})
			.map(([videoId, result]) => ({
				videoId,
				thumbnailPath: result.thumbnailPath,
				durationSeconds: result.parsedMetadata.durationSeconds,
			}));

		if (videosWithNewThumbnails.length > 0) {
			console.log(`\nGenerating optimized thumbnails for ${videosWithNewThumbnails.length} videos with new thumbnails...`);

			const thumbnailDir = join(
				process.cwd(),
				config.thumbnailDir || ".thumbnails"
			);
			const thumbnailGenerator = new ThumbnailGenerator(
				thumbnailDir,
				config.scanOptions.thumbnailConcurrency || 2
			);

			// Get video paths for thumbnail generation
			const videosForThumbnails = await prisma.video.findMany({
				where: {
					videoId: { in: videosWithNewThumbnails.map((v) => v.videoId) },
				},
				select: {
					videoId: true,
					videoPath: true,
					thumbnailPath: true,
					durationSeconds: true,
				},
			});

			const thumbnailJobs: ThumbnailJob[] = videosForThumbnails.map((video: { videoId: string; videoPath: string; thumbnailPath: string | null; durationSeconds: number | null }) => ({
				videoId: video.videoId,
				videoPath: video.videoPath,
				existingThumbnailPath: video.thumbnailPath || undefined,
				durationSeconds: video.durationSeconds || undefined,
				forceRegenerate: true, // Force regeneration since we have new thumbnails from YouTube
			}));

			const thumbnailResults = await thumbnailGenerator.generateBatch(thumbnailJobs);

			// Update database with thumbnail generation results
			for (const [videoId, thumbResult] of thumbnailResults) {
				await prisma.video.update({
					where: { videoId },
					data: {
						hasThumbnails: true,
						thumbnailSource: thumbResult.source,
					},
				});
			}

			console.log(`✓ Optimized thumbnails generated: ${thumbnailResults.size}`);
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
