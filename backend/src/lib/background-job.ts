// Reserve before asynchronous preparation so background jobs cannot overlap.
let activeJob: symbol | null = null;

export function acquireBackgroundJob(name: string): (() => void) | null {
	if (activeJob) return null;
	const token = Symbol(name);
	activeJob = token;
	return () => { if (activeJob === token) activeJob = null; };
}
