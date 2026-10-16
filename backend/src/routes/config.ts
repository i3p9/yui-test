// ============================================
// CONFIG / LIBRARY MANAGEMENT ROUTES
// ============================================

import { FastifyPluginAsync } from "fastify";
import {
	loadConfig,
	updateConfig,
	getConfigPath,
	ScanScheduleSchema,
} from "../lib/config.js";
import { scanScheduler } from "../services/scan-scheduler.js";
import type { Config } from "../types/index.js";
import { LikedVideoOrderService } from "../services/liked-video-order-service.js";
import { ChannelImageDownloader } from "../services/channel-image-downloader.js";
import { channelImageState } from "../lib/channel-image-state.js";
import { acquireBackgroundJob } from "../lib/background-job.js";
import { scanState } from "../lib/scan-state.js";

const configRoutes: FastifyPluginAsync = async (fastify) => {
	let currentDownload: Promise<void> | null = null;
	const channelImageDownloader = new ChannelImageDownloader();

	// GET /api/config - Get current configuration
	fastify.get("/", async (request, reply) => {
		try {
			const config = await loadConfig();
			return config;
		} catch (error) {
			return reply.code(500).send({
				error: "Failed to load config",
				message: String(error),
			});
		}
	});

	// POST /api/config - Update configuration
	fastify.post("/", async (request, reply) => {
		try {
			const newConfig = request.body as Config;

			// Validate the config structure
			if (
				!newConfig?.libraries ||
				!Array.isArray(newConfig.libraries)
			) {
				return reply.code(400).send({
					error: "Invalid config: libraries must be an array",
				});
			}

			// Library editors omit the schedule so a stale copy cannot replace it.
			const schedule = newConfig.scanSchedule === undefined
				? undefined : ScanScheduleSchema.safeParse(newConfig.scanSchedule);
			if (schedule && !schedule.success) return reply.code(400).send({ error: "Invalid scan schedule: use a boolean enabled and an integer intervalHours from 1 to 8760" });
			const savedConfig = await updateConfig((current) => ({
				...newConfig,
				scanSchedule: schedule?.data ?? current.scanSchedule,
			}));
			console.log("✓ Config updated at:", getConfigPath());
			await scanScheduler.refresh();

			return {
				message: "Config updated successfully",
				config: savedConfig,
			};
		} catch (error) {
			return reply.code(500).send({
				error: "Failed to update config",
				message: String(error),
			});
		}
	});

	// PUT /api/config/scan-schedule - Update only scheduling settings.
	fastify.put("/scan-schedule", async (request, reply) => {
		const parsed = ScanScheduleSchema.safeParse(request.body);
		if (!parsed.success) return reply.code(400).send({ error: "Interval must be a whole number from 1 to 8760 hours; enabled must be a boolean" });
		await updateConfig((current) => ({ ...current, scanSchedule: parsed.data }));
		await scanScheduler.refresh();
		return scanScheduler.getStatus();
	});

	// GET /api/config/libraries - Get just the libraries
	fastify.get("/libraries", async (request, reply) => {
		try {
			const config = await loadConfig();
			return config.libraries;
		} catch (error) {
			return reply.code(500).send({
				error: "Failed to load libraries",
				message: String(error),
			});
		}
	});

	// ============================================
	// LIKED VIDEO ORDER ENDPOINTS
	// ============================================
	// See: LikedVideoOrderService for full explanation of the liked_order design.

	// GET /api/config/liked-order/status
	// Returns how many liked videos have a liked_order assigned vs total.
	// The Config page uses this to show whether the one-time import was done.
	fastify.get("/liked-order/status", async (request, reply) => {
		try {
			const service = new LikedVideoOrderService();
			return await service.getStatus();
		} catch (error) {
			return reply.code(500).send({
				error: "Failed to get liked order status",
				message: String(error),
			});
		}
	});

	// POST /api/config/liked-order/import
	// Accepts the txt file content as { content: string } JSON body.
	// The frontend reads the uploaded file via FileReader and sends the raw text.
	// No multipart plugin needed — simpler and works fine for a small text file.
	//
	// Body: { content: "<file text>" }
	// Response: { total, updated, notFound }
	fastify.post("/liked-order/import", async (request, reply) => {
		try {
			const body = request.body as { content?: string };

			if (!body?.content || typeof body.content !== "string") {
				return reply.code(400).send({
					error: "Missing required field: content (string)",
				});
			}

			const service = new LikedVideoOrderService();
			const result = await service.importFromText(body.content);
			return result;
		} catch (error) {
			return reply.code(500).send({
				error: "Failed to import liked order",
				message: String(error),
			});
		}
	});

	// GET /api/config/channel-images/status
	// Returns current job state plus a DB-level summary of qualifying channels.
	fastify.get("/channel-images/status", async (request, reply) => {
		try {
			const [state, summary] = await Promise.all([
				Promise.resolve(channelImageState.getState()),
				channelImageDownloader.getStatusSummary(),
			]);

			return {
				...state,
				isRunning: !!currentDownload,
				...summary,
			};
		} catch (error) {
			return reply.code(500).send({
				error: "Failed to get channel image status",
				message: String(error),
			});
		}
	});

	// POST /api/config/channel-images/download
	// Starts a fill-missing-only batch for qualifying channels.
	fastify.post("/channel-images/download", async (request, reply) => {
		if (currentDownload || scanState.getState().isRunning) {
			return reply.code(409).send({
				error: "Channel image download already in progress or scan/metadata job is running",
			});
		}

		const release = acquireBackgroundJob("channel-images");
		if (!release) return reply.code(409).send({ error: "Another background job is running" });
		currentDownload = channelImageDownloader
			.downloadMissingImages()
			.catch((error) => {
				channelImageState.addError(String(error));
				channelImageState.complete();
				fastify.log.error(error);
			})
			.finally(() => {
				currentDownload = null;
				release();
			});

		return {
			message: "Channel image download started",
		};
	});
};

export default configRoutes;
