// ============================================
// LIKED VIDEO ORDER SERVICE
// ============================================
// Manages the liked_order column on liked_videos rows.
//
// Background
// ----------
// YouTube's API provides no "liked at" timestamp, so we can't determine
// the chronological like order from the API alone. The solution:
//
//   1. One-time txt import  — User uploads a file (via Config page) that
//      maps serial numbers to YouTube IDs. Serial 1 = oldest like, N = newest.
//      This populates liked_order for all existing videos in the DB.
//
//   2. Auto-assign on scan — When a brand-new liked video is discovered during
//      a scan (i.e. it wasn't in the DB yet), DatabaseService assigns it
//      MAX(liked_order)+1 automatically. Since a video is only "new" if it
//      just appeared in the liked playlist, this is a safe assumption for
//      ordering: recent discoveries go last.
//
// txt file format (one entry per line, space-separated):
//   <serial>  <youtube_id>
// Example:
//   1 w28ZREQe3_Q
//   2 EO3XKf08aNU
//
// NULLs
// -----
// Videos where liked_order IS NULL are sorted last in the UI (NULLS LAST).
// This covers: non-liked videos (where liked_order is always NULL), and liked
// videos added before the user ran the import on a fresh database.

import { getPrismaClient } from '../lib/database.js';

export interface LikedOrderImportResult {
  /** Total non-empty lines parsed from the uploaded file */
  total: number;
  /** Lines that matched a video in the DB and were updated */
  updated: number;
  /** Lines where the YouTube ID was not found in the DB */
  notFound: number;
}

export interface LikedOrderStatus {
  /** Total liked_videos in DB (excluding missing_on_disk) */
  totalLiked: number;
  /** How many of those have a liked_order value */
  withOrder: number;
  /** True if at least one liked video has a liked_order */
  isImported: boolean;
}

export class LikedVideoOrderService {
  private prisma = getPrismaClient();

  /**
   * Parse the uploaded txt file content and update liked_order for each
   * matching video in the database.
   *
   * Lines that don't match the expected format or whose YouTube ID doesn't
   * exist in the DB as a liked_video are silently counted as notFound.
   *
   * This is designed to be idempotent — running it multiple times with the
   * same file is safe; it just overwrites liked_order with the same values.
   */
  async importFromText(content: string): Promise<LikedOrderImportResult> {
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    let updated = 0;
    let notFound = 0;

    for (const line of lines) {
      // Split on any whitespace — handles spaces and tabs
      const parts = line.split(/\s+/);
      if (parts.length < 2) {
        notFound++;
        continue;
      }

      const serial = parseInt(parts[0], 10);
      const videoId = parts[1];

      if (isNaN(serial) || !videoId) {
        notFound++;
        continue;
      }

      // Only update rows that exist as liked_videos. Using updateMany so we
      // get a count back without throwing if the video isn't in the DB.
      const result = await this.prisma.video.updateMany({
        where: { videoId, mediaType: 'liked_videos' },
        data: { likedOrder: serial },
      });

      if (result.count > 0) {
        updated++;
      } else {
        notFound++;
      }
    }

    return { total: lines.length, updated, notFound };
  }

  /**
   * Return a summary of how many liked videos have an order assigned.
   * Used by the Config page to show whether the import has been done.
   */
  async getStatus(): Promise<LikedOrderStatus> {
    const [totalLiked, withOrder] = await Promise.all([
      this.prisma.video.count({
        where: { mediaType: 'liked_videos', missingOnDisk: false },
      }),
      this.prisma.video.count({
        where: {
          mediaType: 'liked_videos',
          missingOnDisk: false,
          likedOrder: { not: null },
        },
      }),
    ]);

    return {
      totalLiked,
      withOrder,
      isImported: withOrder > 0,
    };
  }
}
