// ============================================
// CHANNEL IMAGE JOB STATE
// ============================================
// Tracks active channel avatar/banner downloads in memory.

import type { ChannelImageDownloadProgress } from "../types/index.js";

class ChannelImageStateManager {
	private state: ChannelImageDownloadProgress = {
		isRunning: false,
		totalEligible: 0,
		processed: 0,
		skipped: 0,
		avatarsDownloaded: 0,
		bannersDownloaded: 0,
		failed: 0,
		errors: [],
	};

	start(totalEligible: number) {
		this.state = {
			isRunning: true,
			startedAt: new Date().toISOString(),
			totalEligible,
			processed: 0,
			skipped: 0,
			avatarsDownloaded: 0,
			bannersDownloaded: 0,
			failed: 0,
			errors: [],
		};
	}

	updateProgress(updates: Partial<ChannelImageDownloadProgress>) {
		this.state = { ...this.state, ...updates };
	}

	addError(message: string) {
		const errors = [...this.state.errors, message];
		this.state = {
			...this.state,
			errors: errors.slice(-20),
		};
	}

	complete() {
		this.state = {
			...this.state,
			isRunning: false,
			completedAt: new Date().toISOString(),
			currentChannel: undefined,
		};
	}

	getState(): ChannelImageDownloadProgress {
		return {
			...this.state,
			errors: [...this.state.errors],
		};
	}
}

export const channelImageState = new ChannelImageStateManager();
