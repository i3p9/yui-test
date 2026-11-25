import { fetchAPI } from './api';

export type Quality = '720p' | '1080p' | 'best';
export interface SourceInput {
  name: string; url: string; kind: 'channel' | 'playlist' | 'liked'; quality: Quality;
  libraryPath: string; enabled: boolean; useCookies: boolean; uploadedAfter: string | null; position: number;
}
export interface DownloadSource extends SourceInput { id: string; lastRun: DownloadRun | null }
export interface DownloadSettings { scheduleEnabled: boolean; intervalHours: number; nextRunAt: string | null }
export interface DownloadRun {
  id: string; sourceId: string | null; status: string; phase: string; createdAt: string;
  endedAt: string | null; publishedCount: number; error: string | null; finalized: boolean;
  scanStatus: string; scanError: string | null;
  settings: { name: string; url: string; quality: Quality; libraryPath: string };
  progress: { item?: string; downloadedBytes?: number | null; totalBytes?: number | null; speed?: number | null; eta?: number | null } | null;
}
export interface RunsResponse {
  runs: DownloadRun[]; pagination: { page: number; pages: number; total: number };
  waitingReason: string | null; activeRun: DownloadRun | null; queuedCount: number;
}
export interface ImportInput {
  groups: { quality: Quality; libraryPath: string; useCookies: boolean; content: string }[];
  archive: string; liked?: { libraryPath: string; quality: Quality };
}
export interface ImportPreview {
  sources: SourceInput[]; conflicts: string[]; skipped: number; archive: { validCount: number; invalidLines: number[] };
}
const request = <T>(path: string, method: string, data?: unknown) => fetchAPI<T>(`/downloads${path}`, {
  method, ...(data === undefined ? {} : { body: JSON.stringify(data) }),
});
export const downloads = {
  settings: () => fetchAPI<DownloadSettings>('/downloads/settings'),
  saveSettings: (input: Pick<DownloadSettings, 'scheduleEnabled' | 'intervalHours'>) => request<DownloadSettings>('/settings', 'PUT', input),
  sources: () => fetchAPI<DownloadSource[]>('/downloads/sources'),
  saveSource: (input: SourceInput, id?: string) => request<DownloadSource>(`/sources${id ? `/${id}` : ''}`, id ? 'PATCH' : 'POST', input),
  removeSource: (id: string) => request(`/sources/${id}`, 'DELETE'),
  runSource: (id: string) => request(`/sources/${id}/run`, 'POST'),
  runAll: () => request('/run', 'POST'),
  video: (input: { url: string; quality: Quality; libraryPath: string; useCookies: boolean }) => request('/videos', 'POST', input),
  runs: (page = 1) => fetchAPI<RunsResponse>(`/downloads/runs?page=${page}`),
  action: (id: string, action: 'cancel' | 'retry' | 'retry-scan') => request(`/runs/${id}/${action}`, 'POST'),
  log: (id: string) => fetchAPI<{ content: string }>(`/downloads/runs/${id}/log`),
  cookies: () => fetchAPI<{ present: boolean; modifiedAt: string | null }>('/downloads/cookies'),
  uploadCookies: (content: string) => request('/cookies', 'PUT', { content }),
  deleteCookies: () => request('/cookies', 'DELETE'),
  previewImport: (input: ImportInput) => request<ImportPreview>('/import/preview', 'POST', input),
  import: (input: ImportInput) => request<{ imported: number; skipped: number; archiveEntries: number }>('/import', 'POST', input),
  tools: () => fetchAPI<{ ready: boolean; node: string; ytDlp: string | null; ejs: string | null; ffmpeg: string | null }>('/downloads/tools'),
};
