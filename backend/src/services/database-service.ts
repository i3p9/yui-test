// ============================================
// DATABASE SERVICE
// ============================================
// Handles all database operations for scanning

import { getPrismaClient } from "../lib/database.js";
import type {
	ParsedMetadata,
	Library,
	ChannelImageCandidate,
} from "../types/index.js";
import { SearchService } from "./search-service.js";

export class DatabaseService {
	private prisma = getPrismaClient();
	private searchService = new SearchService();

	/**
	 * Upsert a video (insert or update)
	 * Handles duplicate detection (same video_id in multiple libraries)
	 */
	async upsertVideo(
		metadata: ParsedMetadata,
		library: Library
	): Promise<void> {
		const existing = await this.prisma.video.findUnique({
			where: { videoId: metadata.videoId },
		});

		if (existing) {
			// Video already exists - check if we should replace it
			const shouldReplace = await this.shouldReplaceVideo(
				existing,
				metadata
			);

			if (shouldReplace) {
				console.log(
					`Replacing ${metadata.videoId} with larger/better file`
				);
				await this.updateVideo(metadata);
				// Sync with FTS5 after update
				await this.searchService.syncVideo(metadata.videoId);
			} else {
				// Just update scan timestamp
				await this.prisma.video.update({
					where: { videoId: metadata.videoId },
					data: {
						lastScannedAt: new Date().toISOString(),
						missingOnDisk: false, // Mark as present
					},
				});
				// Sync with FTS5 (in case missing_on_disk changed)
				await this.searchService.syncVideo(metadata.videoId);
			}
		} else {
			// New video - insert
			console.log(`Adding new video: ${metadata.videoId}`);
			await this.insertVideo(metadata);
			// Sync with FTS5 after insert
			await this.searchService.syncVideo(metadata.videoId);
		}
	}

	/**
	 * Determine if we should replace an existing video
	 * Strategy: Keep the larger file (better quality usually)
	 */
	private async shouldReplaceVideo(
		existing: any,
		newMetadata: ParsedMetadata
	): Promise<boolean> {
		// Check if metadata changed (info.json or media file modified)
		const infoChanged =
			existing.infoJsonMtime &&
			newMetadata.infoJsonMtime &&
			existing.infoJsonMtime !== newMetadata.infoJsonMtime;

		const mediaChanged =
			existing.mediaMtime &&
			newMetadata.mediaMtime &&
			existing.mediaMtime !== newMetadata.mediaMtime;

		if (infoChanged || mediaChanged) return true;

		// Check if new file is bigger
		const existingSize = existing.filesizeBytes || BigInt(0);
		const newSize = BigInt(newMetadata.filesizeBytes || 0);

		return newSize > existingSize;
	}

	/**
	 * Insert a new video
	 */
	private async insertVideo(metadata: ParsedMetadata): Promise<void> {
		const now = new Date().toISOString();

		await this.prisma.video.create({
			data: {
				videoId: metadata.videoId,
				title: metadata.title,
				uploader: metadata.uploader,
				uploaderId: metadata.uploaderId,
				uploadDate: metadata.uploadDate,
				durationSeconds: metadata.durationSeconds,
				filesizeBytes: metadata.filesizeBytes
					? BigInt(metadata.filesizeBytes)
					: null,
				description: metadata.description,
				tags: metadata.tags ? JSON.stringify(metadata.tags) : null,
				mediaType: metadata.mediaType,
				libraryPath: metadata.libraryPath,
				videoPath: metadata.videoPath,
				thumbnailPath: metadata.thumbnailPath,
				resolution: metadata.resolution,
				videoCodec: metadata.videoCodec,
				audioCodec: metadata.audioCodec,
				hasCompleteMetadata: metadata.hasCompleteMetadata,
				metadataSource: metadata.metadataSource,
				infoJsonMtime: metadata.infoJsonMtime,
				mediaMtime: metadata.mediaMtime,
				missingOnDisk: false,
				firstSeenAt: now,
				lastScannedAt: now,
			},
		});

		// Insert subtitles
		if (metadata.subtitles.length > 0) {
			await this.prisma.subtitle.createMany({
				data: metadata.subtitles.map((sub) => ({
					videoId: metadata.videoId,
					language: sub.language,
					kind: sub.kind,
					path: sub.path,
					filesizeBytes: sub.filesizeBytes,
				})),
			});
		}
	}

	/**
	 * Update an existing video
	 */
	private async updateVideo(metadata: ParsedMetadata): Promise<void> {
		// Delete old subtitles
		await this.prisma.subtitle.deleteMany({
			where: { videoId: metadata.videoId },
		});

		// Update video
		await this.prisma.video.update({
			where: { videoId: metadata.videoId },
			data: {
				title: metadata.title,
				uploader: metadata.uploader,
				uploaderId: metadata.uploaderId,
				uploadDate: metadata.uploadDate,
				durationSeconds: metadata.durationSeconds,
				filesizeBytes: metadata.filesizeBytes
					? BigInt(metadata.filesizeBytes)
					: null,
				description: metadata.description,
				tags: metadata.tags ? JSON.stringify(metadata.tags) : null,
				mediaType: metadata.mediaType,
				libraryPath: metadata.libraryPath,
				videoPath: metadata.videoPath,
				thumbnailPath: metadata.thumbnailPath,
				resolution: metadata.resolution,
				videoCodec: metadata.videoCodec,
				audioCodec: metadata.audioCodec,
				hasCompleteMetadata: metadata.hasCompleteMetadata,
				metadataSource: metadata.metadataSource,
				infoJsonMtime: metadata.infoJsonMtime,
				mediaMtime: metadata.mediaMtime,
				missingOnDisk: false,
				lastScannedAt: new Date().toISOString(),
			},
		});

		// Insert new subtitles
		if (metadata.subtitles.length > 0) {
			await this.prisma.subtitle.createMany({
				data: metadata.subtitles.map((sub) => ({
					videoId: metadata.videoId,
					language: sub.language,
					kind: sub.kind,
					path: sub.path,
					filesizeBytes: sub.filesizeBytes,
				})),
			});
		}
	}

	/**
	 * Mark videos as missing that weren't seen in the scan
	 */
	async markMissingVideos(
		seenVideoIds: Set<string>,
		libraryPath?: string
	): Promise<number> {
		const where = libraryPath
			? { libraryPath, videoId: { notIn: Array.from(seenVideoIds) } }
			: { videoId: { notIn: Array.from(seenVideoIds) } };

		const result = await this.prisma.video.updateMany({
			where,
			data: { missingOnDisk: true },
		});

		return result.count;
	}

	/**
	 * Update channel statistics
	 */
	async updateChannelStats(uploaderId: string): Promise<void> {
		// Count videos for this channel
		const videoCount = await this.prisma.video.count({
			where: { uploaderId, missingOnDisk: false },
		});

		// Get latest upload date
		const latestVideo = await this.prisma.video.findFirst({
			where: { uploaderId, missingOnDisk: false },
			orderBy: { uploadDate: "desc" },
			select: { uploadDate: true, uploader: true },
		});

		if (!latestVideo) return;

		// Upsert channel record
		await this.prisma.channel.upsert({
			where: { uploaderId },
			create: {
				uploaderId,
				name: latestVideo.uploader || "Unknown",
				videoCount,
				lastUploadDate: latestVideo.uploadDate,
				lastScannedAt: new Date().toISOString(),
			},
			update: {
				videoCount,
				lastUploadDate: latestVideo.uploadDate,
				lastScannedAt: new Date().toISOString(),
			},
		});

		// Sync with FTS5 after channel update
		await this.searchService.syncChannel(uploaderId);
	}

	/**
	 * Update channel thumbnail from detected channel images
	 */
	async updateChannelThumbnail(
		channelImage: ChannelImageCandidate
	): Promise<void> {
		console.log(
			`Updating channel thumbnail for ${channelImage.channelName} (${channelImage.channelId})`
		);

		await this.prisma.channel.upsert({
			where: { uploaderId: channelImage.channelId },
			create: {
				uploaderId: channelImage.channelId,
				name: channelImage.channelName,
				thumbnailPath: channelImage.imagePath,
				videoCount: 0,
				lastScannedAt: new Date().toISOString(),
			},
			update: {
				name: channelImage.channelName,
				thumbnailPath: channelImage.imagePath,
				lastScannedAt: new Date().toISOString(),
			},
		});

		// Sync with FTS5 after channel thumbnail update
		await this.searchService.syncChannel(channelImage.channelId);
	}

	/**
	 * Create a scan log entry
	 */
	async createScanLog(options: {
		libraryPath?: string;
		mode: "full" | "incremental";
	}): Promise<number> {
		const log = await this.prisma.scanLog.create({
			data: {
				startedAt: new Date().toISOString(),
				status: "running",
				libraryPath: options.libraryPath,
				mode: options.mode,
			},
		});

		return log.id;
	}

	/**
	 * Complete a scan log
	 */
	async completeScanLog(
		scanId: number,
		stats: {
			videosScanned: number;
			videosAdded: number;
			videosUpdated: number;
			videosRemoved: number;
			errors: string[];
		}
	): Promise<void> {
		await this.prisma.scanLog.update({
			where: { id: scanId },
			data: {
				endedAt: new Date().toISOString(),
				status: "completed",
				videosScanned: stats.videosScanned,
				videosAdded: stats.videosAdded,
				videosUpdated: stats.videosUpdated,
				videosRemoved: stats.videosRemoved,
				errors:
					stats.errors.length > 0
						? JSON.stringify(stats.errors)
						: null,
			},
		});
	}

	/**
	 * Fail a scan log
	 */
	async failScanLog(scanId: number, error: string): Promise<void> {
		await this.prisma.scanLog.update({
			where: { id: scanId },
			data: {
				endedAt: new Date().toISOString(),
				status: "failed",
				errors: JSON.stringify([error]),
			},
		});
	}
}
