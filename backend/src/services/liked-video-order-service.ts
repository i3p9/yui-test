import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../lib/database.js';

export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export interface LikedOrderImportResult { total: number; updated: number; notFound: number }
export interface LikedOrderStatus { totalLiked: number; withOrder: number; isImported: boolean }

// Membership survives index rebuilds and can precede a local media file.
export class LikedVideoOrderService {
  private get prisma() { return getPrismaClient(); }

  async record(videoId: string): Promise<void> {
    if (!VIDEO_ID.test(videoId)) throw new Error('Invalid YouTube video ID');
    await this.prisma.$executeRaw`
      INSERT OR IGNORE INTO liked_video (video_id, liked_order, first_seen_at)
      VALUES (${videoId}, (SELECT COALESCE(MAX(liked_order), 0) + 1 FROM liked_video), ${new Date().toISOString()})`;
  }

  async has(videoId: string): Promise<boolean> {
    return !!await this.prisma.likedVideo.findUnique({ where: { videoId } });
  }

  async applySnapshot(oldestFirst: string[]): Promise<void> {
    const ids = [...new Set(oldestFirst)];
    if (ids.some(id => !VIDEO_ID.test(id))) throw new Error('Invalid Liked snapshot');
    await this.prisma.$transaction(async tx => {
      const previous = await tx.likedVideo.findMany({
        orderBy: [{ likedOrder: { sort: 'asc', nulls: 'last' } }, { videoId: 'asc' }],
      });
      const current = new Set(ids);
      const combined = [...previous.filter(v => !current.has(v.videoId)).map(v => v.videoId), ...ids];
      for (let i = 0; i < combined.length; i++) {
        await tx.likedVideo.upsert({ where: { videoId: combined[i] },
          create: { videoId: combined[i], likedOrder: i + 1, firstSeenAt: new Date().toISOString() },
          update: { likedOrder: i + 1 } });
      }
    }, { timeout: 60_000 });
  }

  async importFromText(content: string): Promise<LikedOrderImportResult> {
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const result = { total: lines.length, updated: 0, notFound: 0 };
    await this.prisma.$transaction(async tx => {
      for (const line of lines) {
        const match = /^(\d+)\s+([A-Za-z0-9_-]{11})$/.exec(line);
        if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1) {
          result.notFound++; continue;
        }
        await tx.likedVideo.upsert({ where: { videoId: match[2] },
          create: { videoId: match[2], likedOrder: Number(match[1]), firstSeenAt: new Date().toISOString() },
          update: { likedOrder: Number(match[1]) } });
        result.updated++;
      }
    }, { timeout: 60_000 });
    return result;
  }

  async getStatus(): Promise<LikedOrderStatus> {
    const [row] = await this.prisma.$queryRaw<{ total: bigint; ordered: bigint | null }[]>`
      SELECT COUNT(*) AS total, SUM(l.liked_order IS NOT NULL) AS ordered
      FROM liked_video l JOIN video v ON v.video_id = l.video_id WHERE v.missing_on_disk = false`;
    const totalLiked = Number(row.total), withOrder = Number(row.ordered ?? 0);
    return { totalLiked, withOrder, isImported: withOrder > 0 };
  }

  async list(options: { limit: number; skip?: number; order?: 'asc' | 'desc'; exclude?: string;
    byUpload?: boolean; before?: string; after?: string }) {
    const direction = options.order === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const sort = options.byUpload ? Prisma.sql`v.upload_date` : Prisma.sql`l.liked_order`;
    const rows = await this.prisma.$queryRaw<Array<{
      videoId: string; title: string; uploader: string | null; uploaderId: string | null;
      uploadDate: string | null; durationSeconds: number | null; thumbnailPath: string | null;
      hasThumbnails: boolean; thumbnailSource: string | null; resolution: string | null;
      mediaType: string; filesizeBytes: bigint | null; likedOrder: number | null;
    }>>(Prisma.sql`
      SELECT v.video_id AS videoId, v.title, v.uploader, v.uploader_id AS uploaderId,
        v.upload_date AS uploadDate, v.duration_seconds AS durationSeconds,
        v.thumbnail_path AS thumbnailPath, v.has_thumbnails AS hasThumbnails,
        v.thumbnail_source AS thumbnailSource, v.resolution, v.media_type AS mediaType,
        v.filesize_bytes AS filesizeBytes, l.liked_order AS likedOrder
      FROM liked_video l JOIN video v ON v.video_id = l.video_id
      WHERE v.missing_on_disk = false
        ${options.exclude ? Prisma.sql`AND v.video_id <> ${options.exclude}` : Prisma.empty}
        ${options.before !== undefined ? Prisma.sql`AND v.upload_date < ${options.before}` : Prisma.empty}
        ${options.after !== undefined ? Prisma.sql`AND v.upload_date > ${options.after}` : Prisma.empty}
      ORDER BY ${sort} IS NULL, ${sort} ${direction}, v.video_id ${direction}
      LIMIT ${options.limit} OFFSET ${options.skip ?? 0}`);
    return rows.map(v => ({ ...v, filesizeBytes: v.filesizeBytes === null ? null : Number(v.filesizeBytes) }));
  }
}
