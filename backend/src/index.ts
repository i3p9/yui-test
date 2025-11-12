// ============================================
// FASTIFY SERVER - Main Entry Point
// ============================================

import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";

// Import routes
import scanRoutes from "./routes/scan.js";
import configRoutes from "./routes/config.js";
import videoRoutes from "./routes/videos.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({
	logger: {
		level: "info",
		transport: {
			target: "pino-pretty",
			options: {
				translateTime: "HH:MM:ss",
				ignore: "pid,hostname", // Don't show process ID and hostname
			},
		},
	},
});

// REGISTER PLUGINS

await fastify.register(cors, {
	origin: "http://localhost:3000",
	credentials: true,
});

// Register API routes
await fastify.register(scanRoutes, { prefix: "/api/scan" });
await fastify.register(configRoutes, { prefix: "/api/config" });
await fastify.register(videoRoutes, { prefix: "/api/videos" });

// Health check
fastify.get("/api/health", async (request, reply) => {
	return {
		status: "ok",
		message: "YUI Backend is running!",
		timestamp: new Date().toISOString(),
	};
});

// Serve frontend static files in production
const frontendDist = path.join(__dirname, "../../frontend/dist");
await fastify.register(fastifyStatic, {
	root: frontendDist,
	prefix: "/",
	// Serve index.html for all non-API routes (SPA fallback)
	decorateReply: false,
});

// SPA fallback - serve index.html for all non-API routes
fastify.setNotFoundHandler((request, reply) => {
	if (request.url.startsWith("/api/")) {
		reply.code(404).send({ error: "Not found" });
	} else {
		reply.sendFile("index.html");
	}
});

const start = async () => {
	try {
		await fastify.listen({
			port: 3001,
			host: "0.0.0.0",
		});

		console.log("🚀 Backend server is running!");
		console.log("📍 API Endpoints:");
		console.log("   Health:  http://localhost:3001/api/health");
		console.log("   Scan:    http://localhost:3001/api/scan");
		console.log("   Config:  http://localhost:3001/api/config");
		console.log("   Videos:  http://localhost:3001/api/videos");
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();
