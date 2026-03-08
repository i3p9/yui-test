// ============================================
// AUTH
// ============================================
// Simple password-gate auth for the YUI app.
//
// Design
// ------
// On login the server generates a random 64-char hex token and keeps it in an
// in-memory Set. The client stores the token in localStorage and sends it as:
//   Authorization: Bearer <token>     (all normal API requests)
//   ?token=<token>                    (stream URLs — browsers can't set headers
//                                     on <video src="..."> requests)
//
// Server restart invalidates all sessions — users just log in again. This is
// fine for a personal archive accessed by a handful of people.
//
// Password source (in priority order):
//   1. AUTH_PASSWORD env var        — good for Docker / no config-file editing
//   2. config.json  auth.password   — set via the config file directly
//
// If neither is set, auth is disabled and all routes are public.

import { randomBytes } from "crypto";
import { loadConfig } from "./config.js";
import type { FastifyRequest, FastifyReply } from "fastify";

// In-memory token store. A Set is enough — we never need to look up by user.
const validTokens = new Set<string>();

/** Generate and register a new session token. */
export function createSession(): string {
	const token = randomBytes(32).toString("hex");
	validTokens.add(token);
	return token;
}

/** Check whether a token is currently valid. */
export function isValidToken(token: string): boolean {
	return validTokens.has(token);
}

/** Invalidate a token (logout). */
export function revokeSession(token: string): void {
	validTokens.delete(token);
}

/**
 * Return the configured password, or null if auth is disabled.
 * Env var takes priority so Docker users don't need to edit config.json.
 */
export async function getConfiguredPassword(): Promise<string | null> {
	if (process.env.AUTH_PASSWORD) return process.env.AUTH_PASSWORD;
	try {
		const config = await loadConfig();
		return config.auth?.password ?? null;
	} catch {
		return null;
	}
}

/** True when a password is configured (auth is active). */
export async function isAuthEnabled(): Promise<boolean> {
	return (await getConfiguredPassword()) !== null;
}

/**
 * Fastify onRequest hook — applied globally to all /api/* routes.
 *
 * Skipped for:
 *   /api/auth/*   — login endpoint must be public
 *   /api/health   — health check stays public for monitoring
 *
 * Accepts the token as:
 *   Authorization: Bearer <token>   — standard header
 *   ?token=<token>                  — query param (for video/stream URLs)
 */
export async function authMiddleware(
	request: FastifyRequest,
	reply: FastifyReply
): Promise<void> {
	if (!(await isAuthEnabled())) return; // open access

	const url = request.url;

	// Public routes — no token required
	if (
		url === "/api/health" ||
		url.startsWith("/api/auth/")
	) {
		return;
	}

	// Only guard API routes (static frontend files are not prefixed /api/)
	if (!url.startsWith("/api/")) return;

	// Extract token from header or query string
	const authHeader = request.headers.authorization;
	const headerToken = authHeader?.startsWith("Bearer ")
		? authHeader.slice(7)
		: null;
	const queryToken = (request.query as Record<string, string>).token ?? null;

	const token = headerToken ?? queryToken;

	if (!token || !isValidToken(token)) {
		return reply
			.code(401)
			.send({ error: "Unauthorized", message: "Invalid or missing token" });
	}
}
