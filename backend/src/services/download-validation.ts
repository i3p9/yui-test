import { z } from 'zod';
import { VIDEO_ID } from './liked-video-order-service.js';

export class DownloadError extends Error {
  constructor(message: string, public statusCode = 400) { super(message); }
}
export const qualitySchema = z.enum(['720p', '1080p', 'best']);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Use a valid upload date');
export const sourceSchema = z.object({
  name: z.string().trim().min(1).max(200), url: z.string().trim().max(2048),
  kind: z.enum(['channel', 'playlist', 'liked']), quality: qualitySchema.default('1080p'),
  libraryPath: z.string().min(1).max(4096), enabled: z.boolean().default(true),
  useCookies: z.boolean().default(false), uploadedAfter: dateSchema.nullable().default(null),
  position: z.number().int().min(0).max(100_000).default(0),
}).strict();
export const videoSchema = z.object({
  url: z.string().trim().max(2048), quality: qualitySchema.default('1080p'),
  libraryPath: z.string().min(1).max(4096), useCookies: z.boolean().default(false),
}).strict();
export const settingsSchema = z.object({ scheduleEnabled: z.boolean(), intervalHours: z.number().int().min(1).max(8760) }).strict();
export type SourceInput = z.infer<typeof sourceSchema>;
export interface DownloadSnapshot {
  name: string; url: string; kind: SourceInput['kind'] | 'video';
  quality: z.infer<typeof qualitySchema>; libraryPath: string;
  libraryType: 'channel_archive' | 'liked_videos'; useCookies: boolean; uploadedAfter: string | null;
}

export function normalizeYoutube(input: string): { url: string; kind: DownloadSnapshot['kind']; videoId?: string } {
  let u: URL;
  try { u = new URL(input); } catch { throw new DownloadError('Enter a supported YouTube URL'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port ||
    !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(u.hostname.toLowerCase())) {
    throw new DownloadError('Only YouTube URLs without credentials or custom ports are supported');
  }
  const parts = u.pathname.split('/').filter(Boolean);
  const videoId = u.hostname.endsWith('youtu.be') ? parts[0]
    : parts[0] === 'watch' ? u.searchParams.get('v') ?? undefined
    : ['shorts', 'live', 'embed'].includes(parts[0]) ? parts[1] : undefined;
  if (videoId) {
    if (!VIDEO_ID.test(videoId)) throw new DownloadError('Invalid YouTube video ID');
    return { url: `https://www.youtube.com/watch?v=${videoId}`, kind: 'video', videoId };
  }
  if (u.pathname.replace(/\/$/, '') === '/playlist') {
    const id = u.searchParams.get('list');
    if (!id || !/^[A-Za-z0-9_-]{2,150}$/.test(id)) throw new DownloadError('Invalid YouTube playlist ID');
    return { url: `https://www.youtube.com/playlist?list=${id}`, kind: id === 'LL' ? 'liked' : 'playlist' };
  }
  const channel = /^\/@[^/\s?#]+(?:\/videos)?\/?$/.test(u.pathname) ||
    /^\/(?:channel|c|user)\/[A-Za-z0-9_.-]+(?:\/videos)?\/?$/.test(u.pathname);
  if (channel) return { url: `https://www.youtube.com${u.pathname.replace(/\/(?:videos)?\/?$/, '')}/videos`, kind: 'channel' };
  throw new DownloadError('Use a channel Videos URL, playlist URL, or individual video URL');
}

export function validateSource(input: unknown): SourceInput {
  const source = sourceSchema.parse(input);
  const normalized = normalizeYoutube(source.url);
  if (source.kind !== normalized.kind) throw new DownloadError('Source kind does not match its URL');
  if (source.kind === 'liked' && source.uploadedAfter) throw new DownloadError('Liked Videos cannot have an upload-date cutoff');
  return { ...source, url: normalized.url, useCookies: source.kind === 'liked' || source.useCookies };
}

export const activeStatuses = ['queued', 'running', 'cancelling'];
