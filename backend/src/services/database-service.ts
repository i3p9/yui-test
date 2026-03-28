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
	 * Returns 'added' | 'updated' | 'skipped'
	 */
	async upsertVideo(
		metadata: ParsedMetadata,
		library: Library,
		options?: { skipFtsSync?: boolean }
	): Promise<'added' | 'updated' | 'skipped'> {
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
				await this.updateVideo(metadata);
				if (!options?.skipFtsSync) await this.searchService.syncVideo(metadata.videoId);
				return 'updated';
			} else {
				// Just update scan timestamp
				await this.prisma.video.update({
					where: { videoId: metadata.videoId },
					data: {
						lastScannedAt: new Date().toISOString(),
						missingOnDisk: false,
					},
				});
				return 'skipped';
			}
		} else {
			await this.insertVideo(metadata);
			if (!options?.skipFtsSync) {
				await this.searchService.syncVideo(metadata.videoId);
			}
			return 'added';
		}
	}

	/**
	 * Rebuild all FTS5 indexes from scratch. Much faster than per-video sync.
	 */
	async rebuildFtsIndexes(): Promise<void> {
		console.log('Rebuilding FTS5 indexes...');
		// Rebuild videos FTS
		await this.prisma.$executeRawUnsafe(`DELETE FROM videos_fts`);
		await this.prisma.$executeRawUnsafe(`
			INSERT INTO videos_fts(video_id, title, uploader, description)
			SELECT video_id, COALESCE(title, ''), COALESCE(uploader, ''), COALESCE(description, '')
			FROM video WHERE missing_on_disk = false
		`);

		// Rebuild channels FTS
		await this.prisma.$executeRawUnsafe(`DELETE FROM channels_fts`);
		await this.prisma.$executeRawUnsafe(`
			INSERT INTO channels_fts(uploader_id, name)
			SELECT uploader_id, COALESCE(name, '') FROM channel
		`);
		console.log('FTS5 indexes rebuilt.');
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

		// Check if new file is bigger (both must be BigInt for comparison)
		const existingSize = BigInt(existing.filesizeBytes ?? 0);
		const newSize = BigInt(newMetadata.filesizeBytes ?? 0);

		return newSize > existingSize;
	}

	/**
	 * Auto-assign liked_order for a newly inserted liked video.
	 *
	 * Queries the current MAX(liked_order) across all liked_videos rows and
	 * assigns MAX+1 to the new video. This ensures newly discovered liked
	 * videos (ones that weren't in the historical txt import) always sort
	 * after the historically-ordered ones, which is the correct assumption:
	 * if a video just showed up in a scan, it was liked recently.
	 *
	 * Gaps in liked_order are fine — the UI just sorts by the number.
	 */
	private async assignLikedOrder(videoId: string): Promise<void> {
		const result = await this.prisma.$queryRaw<
			[{ maxOrder: number | null }]
		>`SELECT MAX(liked_order) as maxOrder FROM video WHERE media_type = 'liked_videos'`;

		const maxOrder = result[0]?.maxOrder ?? 0;
		await this.prisma.video.update({
			where: { videoId },
			data: { likedOrder: maxOrder + 1 },
		});
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

		// Auto-assign liked_order for new liked videos so they sort after
		// any historically-imported order entries (i.e. recent likes go last)
		if (metadata.mediaType === "liked_videos") {
			await this.assignLikedOrder(metadata.videoId);
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
	 * Mark videos as missing that weren't seen in the scan.
	 * Chunks the notIn clause to avoid SQLite variable limits.
	 */
	async markMissingVideos(
		seenVideoIds: Set<string>,
		libraryPath?: string
	): Promise<number> {
		const ids = Array.from(seenVideoIds);

		// SQLite has a variable limit (~999). Use a temp approach:
		// First mark ALL as missing (for this library), then un-mark seen ones in chunks.
		const baseWhere = libraryPath ? { libraryPath } : {};

		// Mark all as missing
		await this.prisma.video.updateMany({
			where: { ...baseWhere, missingOnDisk: false },
			data: { missingOnDisk: true },
		});

		// Un-mark seen videos in chunks of 500
		const CHUNK_SIZE = 500;
		let unmarked = 0;
		for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
			const chunk = ids.slice(i, i + CHUNK_SIZE);
			const result = await this.prisma.video.updateMany({
				where: { ...baseWhere, videoId: { in: chunk } },
				data: { missingOnDisk: false },
			});
			unmarked += result.count;
		}

		// Count how many ended up missing
		const missingCount = await this.prisma.video.count({
			where: { ...baseWhere, missingOnDisk: true },
		});

		return missingCount;
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
