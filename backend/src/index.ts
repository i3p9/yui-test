// ============================================
// FASTIFY SERVER - Main Entry Point
// ============================================

import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

// Import routes
import scanRoutes from "./routes/scan.js";
import configRoutes from "./routes/config.js";
import videoRoutes from "./routes/videos.js";
import libraryRoutes from "./routes/library.js";
import streamRoutes from "./routes/stream.js";
import progressRoutes from "./routes/progress.js";

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
await fastify.register(libraryRoutes, { prefix: "/api/library" });
await fastify.register(streamRoutes, { prefix: "/api/stream" });
await fastify.register(progressRoutes, { prefix: "/api/progress" });

// Health check
fastify.get("/api/health", async (request, reply) => {
	return {
		status: "ok",
		message: "YUI Backend is running!",
		timestamp: new Date().toISOString(),
	};
});

// Serve frontend static files in production (only if dist exists)
// Try multiple possible paths to handle both dev and Docker environments
const possiblePaths = [
	path.resolve(__dirname, "../../frontend/dist"), // Dev: backend/dist -> frontend/dist
	path.resolve(__dirname, "../frontend/dist"), // Alternative: backend/dist -> frontend/dist (one level up)
	path.resolve(process.cwd(), "frontend/dist"), // From project root
	"/app/frontend/dist", // Docker absolute path
];

let frontendDist: string | null = null;
let frontendAvailable = false;

// Find the first existing path
for (const possiblePath of possiblePaths) {
	if (existsSync(possiblePath)) {
		frontendDist = possiblePath;
		break;
	}
}

if (frontendDist) {
	await fastify.register(fastifyStatic, {
		root: frontendDist,
		prefix: "/",
		// Serve index.html for all non-API routes (SPA fallback)
	});
	frontendAvailable = true;
	fastify.log.info(
		`Frontend static files enabled from: ${frontendDist}`
	);
} else {
	fastify.log.warn(
		`Frontend dist directory not found. Tried: ${possiblePaths.join(
			", "
		)}. Frontend will not be served. Build the frontend first.`
	);
}

// SPA fallback - serve index.html for all non-API routes
fastify.setNotFoundHandler((request, reply) => {
	if (request.url.startsWith("/api/")) {
		reply.code(404).send({ error: "Not found" });
	} else if (frontendAvailable) {
		// Only try to serve index.html if frontend is available
		reply.sendFile("index.html");
	} else {
		// Frontend not built - return helpful message
		reply.code(404).send({
			error: "Frontend not available",
			message:
				"Frontend has not been built. Please build the frontend first.",
		});
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
		console.log("   Health:   http://localhost:3001/api/health");
		console.log("   Scan:     http://localhost:3001/api/scan");
		console.log("   Config:   http://localhost:3001/api/config");
		console.log("   Videos:   http://localhost:3001/api/videos");
		console.log("   Library:  http://localhost:3001/api/library");
		console.log("   Stream:   http://localhost:3001/api/stream");
		console.log("   Progress: http://localhost:3001/api/progress");
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();
