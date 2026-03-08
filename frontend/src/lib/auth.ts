// Token storage helpers.
// The session token is a random hex string returned by POST /api/auth/login.
// It lives in localStorage — simple, persistent across tabs, cleared on logout.

const TOKEN_KEY = "yui_auth_token";

export function getToken(): string | null {
	return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
	localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
	localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
	return getToken() !== null;
}
