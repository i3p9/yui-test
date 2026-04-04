// ============================================
// METADATA ROUTES
// ============================================
// Routes for fetching missing metadata using yt-dlp

import { FastifyPluginAsync } from "fastify";
import {
	MetadataFetcher,
	type MetadataFetchJob,
} from "../services/metadata-fetcher.js";
import {
	ThumbnailGenerator,
	type ThumbnailJob,
} from "../services/thumbnail-generator.js";
import { scanState } from "../lib/scan-state.js";
import { channelImageState } from "../lib/channel-image-state.js";
import { getPrismaClient } from "../lib/database.js";
import { loadConfig } from "../lib/config.js";
import { join } from "path";
import { access, constants } from "fs/promises";

const metadataRoutes: FastifyPluginAsync = async (fastify) => {
	let currentFetch: Promise<any> | null = null;

	// GET /api/metadata/stats - Get incomplete metadata statistics
	fastify.get("/stats", async (request, reply) => {
		const prisma = getPrismaClient();
		const config = await loadConfig();

		// Count videos with incomplete metadata but has YouTube ID
		const withVideoId = await prisma.video.count({
			where: {
				hasCompleteMetadata: false,
				missingOnDisk: false,
			},
		});

		// Count videos with incomplete metadata including no YouTube ID
		// (These are videos where we couldn't extract a video ID at all)
		const total = await prisma.video.count({
			where: {
				hasCompleteMetadata: false,
				missingOnDisk: false,
			},
		});

		// Count videos where metadata source is filename (indicates incomplete metadata)
		const fromFilename = await prisma.video.count({
			where: {
				metadataSource: "filename",
				missingOnDisk: false,
			},
		});

		// Count videos where thumbnail source is not original (indicates generated thumbnails)
		const generatedThumbnailsCount = await prisma.video.count({
			where: {
				thumbnailSource: {
					not: "original",
				},
			},
		});

		// Check write permissions for each library
		const libraryPermissions: Array<{
			path: string;
			name: string;
			writable: boolean;
		}> = [];

		for (const library of config.libraries) {
			if (library.skip) continue;
			try {
				await access(library.path, constants.W_OK);
				libraryPermissions.push({
					path: library.path,
					name: library.name,
					writable: true,
				});
			} catch {
				libraryPermissions.push({
					path: library.path,
					name: library.name,
					writable: false,
				});
			}
		}

		// Only allow with_video if ALL libraries are writable
		const canWriteToLibraries = libraryPermissions.length > 0 && libraryPermissions.every((lib) => lib.writable);

		return {
			incompleteWithVideoId: withVideoId,
			incompleteTotal: total,
			fromFilename,
			generatedThumbnailsCount,
			libraryPermissions,
			canWriteToLibraries,
		};
	});

	// POST /api/metadata/fetch - Trigger metadata fetching
	fastify.post("/fetch", async (request, reply) => {
		const body = request.body as any;
		const { videoIds, saveLocation } = body; // Optional: specific video IDs to fetch
		if (!["with_video", "app_data"].includes(saveLocation)) {
			return reply.code(400).send({
				error: "Invalid save location",
			});
		}

		// Check if fetch is already running (or scan is running)
		if (
			currentFetch ||
			scanState.getState().isRunning ||
			channelImageState.getState().isRunning
		) {
			return reply.code(409).send({
				error: "Fetch already in progress or another background job is running",
			});
		}

		const config = await loadConfig();
		const prisma = getPrismaClient();

		// Get videos that need metadata
		let videosToFetch;
		if (videoIds && Array.isArray(videoIds)) {
			// Fetch specific videos
			videosToFetch = await prisma.video.findMany({
				where: {
					videoId: { in: videoIds },
					missingOnDisk: false,
				},
				select: {
					videoId: true,
					videoPath: true,
					thumbnailPath: true,
					thumbnailSource: true,
				},
			});
		} else {
			// Fetch all videos with incomplete metadata
			videosToFetch = await prisma.video.findMany({
				where: {
					OR: [
						{
							hasCompleteMetadata: false,
							missingOnDisk: false,
						},
						{
							thumbnailSource: {
								not: "original",
							},
						},
					],
				},
				select: {
					videoId: true,
					videoPath: true,
					thumbnailPath: true,
					thumbnailSource: true,
				},
			});
		}

		if (videosToFetch.length === 0) {
			return reply.send({
				message: "No videos need metadata fetching",
				count: 0,
			});
		}

		// Create metadata fetcher
		const metadataDir = join(process.cwd(), config.metadataDir);
		const fetcher = new MetadataFetcher(
			metadataDir,
			config.scanOptions.metadataConcurrency,
			saveLocation
		);

		// Build jobs
		const jobs: MetadataFetchJob[] = videosToFetch.map((video) => ({
			videoId: video.videoId,
			videoPath: video.videoPath,
			thumbnailPath: video.thumbnailPath || undefined,
			thumbnailSource: video.thumbnailSource || undefined,
		}));

		// Update scan state to indicate metadata fetching is starting
		scanState.updateProgress({
			isRunning: true,
			phase: "metadata",
			metadataTotal: jobs.length,
			metadataFetched: 0,
			metadataFailed: 0,
			metadataThumbnailsFetched: 0,
		});

		// Start fetch in background
		currentFetch = fetcher
			.fetchBatch(jobs, (progress) => {
				// Update scan state with progress
				scanState.updateProgress({
					metadataFetched: progress.completed,
					metadataFailed: progress.failed,
					metadataThumbnailsFetched: progress.thumbnailsFetched,
					currentMetadata: progress.current,
				});
			})
			.then(async (results) => {
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
						updateData.description =
							result.parsedMetadata.description;
					}
					if (result.parsedMetadata.tags) {
						updateData.tags = JSON.stringify(
							result.parsedMetadata.tags
						);
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

				// PHASE 2: Generate optimized thumbnails for videos that got new thumbnails
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
					console.log(`Generating optimized thumbnails for ${videosWithNewThumbnails.length} videos...`);

					scanState.updateProgress({
						phase: "thumbnails",
						thumbnailsTotal: videosWithNewThumbnails.length,
						thumbnailsGenerated: 0,
						thumbnailsFailed: 0,
					});

					const thumbnailDir = join(process.cwd(), config.thumbnailDir);
					const thumbnailGenerator = new ThumbnailGenerator(
						thumbnailDir,
						config.scanOptions.thumbnailConcurrency
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

					const thumbnailJobs: ThumbnailJob[] = videosForThumbnails.map((video) => ({
						videoId: video.videoId,
						videoPath: video.videoPath,
						existingThumbnailPath: video.thumbnailPath || undefined,
						durationSeconds: video.durationSeconds || undefined,
						forceRegenerate: true, // Force regeneration since we have new thumbnails from YouTube
					}));

					const thumbnailResults = await thumbnailGenerator.generateBatch(
						thumbnailJobs,
						(progress) => {
							scanState.updateProgress({
								thumbnailsGenerated: progress.completed,
								thumbnailsFailed: progress.failed,
								currentThumbnail: progress.current,
							});
						}
					);

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

					console.log(`Optimized thumbnails generated: ${thumbnailResults.size}`);
				}

				// Mark as complete
				scanState.updateProgress({
					isRunning: false,
					phase: "complete",
				});
			})
			.catch((error) => {
				console.error("Metadata fetch failed:", error);
				scanState.updateProgress({
					isRunning: false,
					phase: "complete",
					errors: [`Metadata fetch failed: ${error.message}`],
				});
			})
			.finally(() => {
				currentFetch = null;
			});

		return {
			message: "Metadata fetching started",
			count: jobs.length,
		};
	});

	// GET /api/metadata/status - Get current fetch status
	fastify.get("/status", async (request, reply) => {
		const state = scanState.getState();

		return {
			isRunning: !!currentFetch,
			phase: state.phase,
			metadataTotal: state.metadataTotal,
			metadataFetched: state.metadataFetched,
			metadataFailed: state.metadataFailed,
			metadataThumbnailsFetched: state.metadataThumbnailsFetched,
			currentMetadata: state.currentMetadata,
		};
	});
};

export default metadataRoutes;
