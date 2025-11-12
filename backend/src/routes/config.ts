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
};

export default configRoutes;
