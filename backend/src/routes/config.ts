// ============================================
// CONFIG / LIBRARY MANAGEMENT ROUTES
// ============================================

import { FastifyPluginAsync } from "fastify";
import {
	loadConfig,
	clearConfigCache,
	getConfigPath,
} from "../lib/config.js";
import { writeFile } from "fs/promises";
import type { Config } from "../types/index.js";
import { LikedVideoOrderService } from "../services/liked-video-order-service.js";

const configRoutes: FastifyPluginAsync = async (fastify) => {
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
				!newConfig.libraries ||
				!Array.isArray(newConfig.libraries)
			) {
				return reply.code(400).send({
					error: "Invalid config: libraries must be an array",
				});
			}

			// Write to config.json
			const configPath = getConfigPath();
			await writeFile(
				configPath,
				JSON.stringify(newConfig, null, 2),
				"utf-8"
			);
			console.log("✓ Config updated at:", configPath);

			// Clear cache so next load reads the new file
			clearConfigCache();

			return {
				message: "Config updated successfully",
				config: newConfig,
			};
		} catch (error) {
			return reply.code(500).send({
				error: "Failed to update config",
				message: String(error),
			});
		}
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
};

export default configRoutes;
