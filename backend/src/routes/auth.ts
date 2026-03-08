// ============================================
// AUTH ROUTES
// ============================================
// POST /api/auth/login   — verify password, get session token
// GET  /api/auth/status  — is auth enabled? (public, used by frontend on load)
// POST /api/auth/logout  — revoke current token

import { FastifyPluginAsync } from "fastify";
import {
	getConfiguredPassword,
	isAuthEnabled,
	createSession,
	revokeSession,
	isValidToken,
} from "../lib/auth.js";

const authRoutes: FastifyPluginAsync = async (fastify) => {
	// GET /api/auth/status
	// Called by the frontend on app load to decide whether to show the login gate.
	// Always public — no token required.
	fastify.get("/status", async () => {
		return { authEnabled: await isAuthEnabled() };
	});

	// POST /api/auth/login
	// Body: { password: string }
	// Returns: { token: string }  on success
	//          401               on wrong password
	fastify.post("/login", async (request, reply) => {
		const { password } = request.body as { password?: string };

		if (!password) {
			return reply.code(400).send({ error: "password is required" });
		}

		const authEnabled = await isAuthEnabled();
		if (!authEnabled) {
			// Auth is disabled — hand out a no-op token so the client
			// doesn't need special-case logic.
			return { token: "no-auth-required" };
		}

		const configPassword = await getConfiguredPassword();
		if (password !== configPassword) {
			return reply.code(401).send({ error: "Wrong password" });
		}

		const token = createSession();
		return { token };
	});

	// POST /api/auth/logout
	// Revokes the current session token. Best-effort — no error if token is
	// already invalid or missing.
	fastify.post("/logout", async (request) => {
		const authHeader = request.headers.authorization;
		const token = authHeader?.startsWith("Bearer ")
			? authHeader.slice(7)
			: null;

		if (token && isValidToken(token)) {
			revokeSession(token);
		}

		return { ok: true };
	});
};

export default authRoutes;
