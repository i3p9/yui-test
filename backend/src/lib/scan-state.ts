// ============================================
// SCAN STATE MANAGER
// ============================================
// Tracks current scan progress in memory

export interface ScanProgress {
  isRunning: boolean;
  scanId?: number;
  startedAt?: string;
  libraryPath?: string;
  mode?: 'full' | 'incremental';
  currentLibrary?: string;
  videosScanned: number;
  videosAdded: number;
  videosUpdated: number;
  errors: string[];
}

class ScanStateManager {
  private state: ScanProgress = {
    isRunning: false,
    videosScanned: 0,
    videosAdded: 0,
    videosUpdated: 0,
    errors: [],
  };

  start(scanId: number, libraryPath?: string, mode: 'full' | 'incremental' = 'full') {
    this.state = {
      isRunning: true,
      scanId,
      startedAt: new Date().toISOString(),
      libraryPath,
      mode,
      videosScanned: 0,
      videosAdded: 0,
      videosUpdated: 0,
      errors: [],
    };
  }

  updateProgress(updates: Partial<ScanProgress>) {
    this.state = { ...this.state, ...updates };
  }

  complete() {
    this.state.isRunning = false;
  }

  getState(): ScanProgress {
    return { ...this.state };
  }

  reset() {
    this.state = {
      isRunning: false,
      videosScanned: 0,
      videosAdded: 0,
      videosUpdated: 0,
      errors: [],
    };
  }
}

// Singleton instance
export const scanState = new ScanStateManager();
