// ============================================
// DANGER ZONE ROUTES
// ============================================
// Development utilities for resetting database and cleaning up thumbnails

import { FastifyPluginAsync } from "fastify";
import { getPrismaClient, disconnectDatabase } from "../lib/database.js";
import { loadConfig } from "../lib/config.js";
import { rm, readdir, stat } from "fs/promises";
import { resolve } from "path";

const dangerRoutes: FastifyPluginAsync = async (fastify) => {
	// POST /api/danger/reset - Reset database and optionally remove thumbnails
	fastify.post<{
		Body: {
			removeThumbnails?: boolean;
			removeMetadata?: boolean;
		};
	}>("/reset", async (request, reply) => {
		try {
			const { removeThumbnails = false, removeMetadata = false } =
				request.body || {};

			const results: {
				database: { cleared: boolean; tables: string[] };
				thumbnails?: { removed: boolean; path: string };
				metadata?: { removed: boolean; path: string };
			} = {
				database: { cleared: false, tables: [] },
			};

			// 1. Clear all database tables
			const prisma = getPrismaClient();

			// Delete in order to respect foreign key constraints
			// WatchProgress and Subtitle reference Video, so delete them first
			await prisma.watchProgress.deleteMany({});
			results.database.tables.push("WatchProgress");

			await prisma.subtitle.deleteMany({});
			results.database.tables.push("Subtitle");

			await prisma.scanLog.deleteMany({});
			results.database.tables.push("ScanLog");

			await prisma.video.deleteMany({});
			results.database.tables.push("Video");

			await prisma.channel.deleteMany({});
			results.database.tables.push("Channel");

			results.database.cleared = true;

			// 2. Optionally remove thumbnails directory
			if (removeThumbnails) {
				const config = await loadConfig();
				const thumbnailDir = resolve(
					process.cwd(),
					config.thumbnailDir
				);

				try {
					const stats = await stat(thumbnailDir);
					if (stats.isDirectory()) {
						// Get list of subdirectories to remove (video ID folders)
						const entries = await readdir(thumbnailDir);
						for (const entry of entries) {
							const entryPath = resolve(thumbnailDir, entry);
							await rm(entryPath, { recursive: true, force: true });
						}
						results.thumbnails = {
							removed: true,
							path: thumbnailDir,
						};
					}
				} catch (error: any) {
					if (error.code === "ENOENT") {
						// Directory doesn't exist, that's fine
						results.thumbnails = {
							removed: true,
							path: thumbnailDir,
						};
					} else {
						throw error;
					}
				}
			}

			// 3. Optionally remove metadata directory
			if (removeMetadata) {
				const config = await loadConfig();
				const metadataDir = resolve(process.cwd(), config.metadataDir);

				try {
					const stats = await stat(metadataDir);
					if (stats.isDirectory()) {
						const entries = await readdir(metadataDir);
						for (const entry of entries) {
							const entryPath = resolve(metadataDir, entry);
							await rm(entryPath, { recursive: true, force: true });
						}
						results.metadata = {
							removed: true,
							path: metadataDir,
						};
					}
				} catch (error: any) {
					if (error.code === "ENOENT") {
						results.metadata = {
							removed: true,
							path: metadataDir,
						};
					} else {
						throw error;
					}
				}
			}

			console.log("🗑️ Database reset completed:", results);

			return {
				success: true,
				message: "Reset completed successfully",
				results,
			};
		} catch (error) {
			console.error("Reset failed:", error);
			return reply.code(500).send({
				error: "Reset failed",
				message: String(error),
			});
		}
	});

	// GET /api/danger/stats - Get current data stats (for confirmation dialog)
	fastify.get("/stats", async (request, reply) => {
		try {
			const prisma = getPrismaClient();
			const config = await loadConfig();

			const [
				videoCount,
				channelCount,
				scanLogCount,
				watchProgressCount,
				subtitleCount,
			] = await Promise.all([
				prisma.video.count(),
				prisma.channel.count(),
				prisma.scanLog.count(),
				prisma.watchProgress.count(),
				prisma.subtitle.count(),
			]);

			// Count thumbnail folders
			let thumbnailCount = 0;
			const thumbnailDir = resolve(process.cwd(), config.thumbnailDir);
			try {
				const entries = await readdir(thumbnailDir);
				thumbnailCount = entries.length;
			} catch {
				// Directory doesn't exist
			}

			// Count metadata folders
			let metadataCount = 0;
			const metadataDir = resolve(process.cwd(), config.metadataDir);
			try {
				const entries = await readdir(metadataDir);
				metadataCount = entries.length;
			} catch {
				// Directory doesn't exist
			}

			return {
				database: {
					videos: videoCount,
					channels: channelCount,
					scanLogs: scanLogCount,
					watchProgress: watchProgressCount,
					subtitles: subtitleCount,
				},
				thumbnails: {
					count: thumbnailCount,
					path: config.thumbnailDir,
				},
				metadata: {
					count: metadataCount,
					path: config.metadataDir,
				},
			};
		} catch (error) {
			return reply.code(500).send({
				error: "Failed to get stats",
				message: String(error),
			});
		}
	});
};

export default dangerRoutes;
