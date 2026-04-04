// ============================================
// SEARCH SERVICE (FTS5)
// ============================================
// Handles video and channel search using FTS5 full-text search

import { getPrismaClient } from '../lib/database.js';

export interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  types?: ('videos' | 'channels')[];
}

export interface VideoSearchResult {
  videoId: string;
  title: string;
  uploader?: string;
  uploaderId?: string;
  uploadDate?: string;
  durationSeconds?: number;
  thumbnailPath?: string;
  hasThumbnails: boolean;
  description?: string;
  filesizeBytes?: number;
}

export interface ChannelSearchResult {
  uploaderId: string;
  name: string;
  videoCount: number;
  thumbnailPath?: string;
  avatarPath?: string;
  lastUploadDate?: string;
}

export interface AutocompleteResults {
  query: string;
  channels: ChannelSearchResult[];
  videos: VideoSearchResult[];
}

export interface SearchResults {
  query: string;
  results: {
    channels: {
      items: ChannelSearchResult[];
      total: number;
    };
    videos: {
      items: VideoSearchResult[];
      total: number;
      pagination: {
        page: number;
        limit: number;
        pages: number;
      };
    };
  };
  totalResults: number;
}

export class SearchService {
  private prisma = getPrismaClient();

  /**
   * Autocomplete search for quick dropdown results
   */
  async autocomplete(query: string, limits = { channels: 3, videos: 8 }): Promise<AutocompleteResults> {
    if (query.length < 2) {
      return { query, channels: [], videos: [] };
    }

    const [channels, videos] = await Promise.all([
      this.searchChannels(query, { limit: limits.channels }),
      this.searchVideos(query, { limit: limits.videos }),
    ]);

    return {
      query,
      channels,
      videos,
    };
  }

  /**
   * Full search with pagination
   */
  async search(
    query: string, 
    options: { 
      page?: number; 
      limit?: number; 
      types?: ('videos' | 'channels')[] 
    } = {}
  ): Promise<SearchResults> {
    const { page = 1, limit = 20, types = ['videos', 'channels'] } = options;
    const offset = (page - 1) * limit;

    const results: {
      channels: { items: ChannelSearchResult[], total: number },
      videos: { items: VideoSearchResult[], total: number, pagination: { page: number, limit: number, pages: number } }
    } = {
      channels: { items: [], total: 0 },
      videos: { items: [], total: 0, pagination: { page, limit, pages: 0 } },
    };

    if (types.includes('channels')) {
      const [channelItems, channelTotal] = await Promise.all([
        this.searchChannels(query, { limit: 50 }), // Show more channels since no pagination
        this.countChannels(query),
      ]);
      results.channels = { items: channelItems, total: channelTotal };
    }

    if (types.includes('videos')) {
      const [videoItems, videoTotal] = await Promise.all([
        this.searchVideos(query, { limit, offset }),
        this.countVideos(query),
      ]);
      results.videos = {
        items: videoItems,
        total: videoTotal,
        pagination: {
          page,
          limit,
          pages: Math.ceil(videoTotal / limit),
        },
      };
    }

    return {
      query,
      results,
      totalResults: results.channels.total + results.videos.total,
    };
  }

  /**
   * Search channels using FTS5
   */
  private async searchChannels(
    query: string, 
    options: { limit?: number; offset?: number } = {}
  ): Promise<ChannelSearchResult[]> {
    const { limit = 10, offset = 0 } = options;
    const searchQuery = this.prepareFTS5Query(query);

    const results = await this.prisma.$queryRawUnsafe(`
      SELECT 
        c.uploader_id as "uploaderId",
        c.name,
        c.video_count as "videoCount", 
        c.thumbnail_path as "thumbnailPath",
        c.avatar_path as "avatarPath",
        c.last_upload_date as "lastUploadDate"
      FROM channels_fts fts
      JOIN channel c ON fts.rowid = c.rowid
      WHERE channels_fts MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `, searchQuery, limit, offset);

    return this.convertBigIntFields(results as any[]);
  }

  /**
   * Search videos using FTS5
   */
  private async searchVideos(
    query: string, 
    options: { limit?: number; offset?: number } = {}
  ): Promise<VideoSearchResult[]> {
    const { limit = 20, offset = 0 } = options;
    const searchQuery = this.prepareFTS5Query(query);

    const results = await this.prisma.$queryRawUnsafe(`
      SELECT 
        v.video_id as "videoId",
        v.title,
        v.uploader,
        v.uploader_id as "uploaderId",
        v.upload_date as "uploadDate",
        v.duration_seconds as "durationSeconds",
        v.thumbnail_path as "thumbnailPath",
        v.has_thumbnails as "hasThumbnails",
        v.description,
        v.filesize_bytes as "filesizeBytes"
      FROM videos_fts fts
      JOIN video v ON fts.rowid = v.rowid
      WHERE videos_fts MATCH ? AND v.missing_on_disk = false
      ORDER BY rank
      LIMIT ? OFFSET ?
    `, searchQuery, limit, offset);

    return this.convertBigIntFields(results as any[]);
  }

  /**
   * Count matching channels using FTS5
   */
  private async countChannels(query: string): Promise<number> {
    const searchQuery = this.prepareFTS5Query(query);

    const result = await this.prisma.$queryRawUnsafe<[{ count: number | bigint }]>(`
      SELECT COUNT(*) as count
      FROM channels_fts
      WHERE channels_fts MATCH ?
    `, searchQuery);

    const count = result[0]?.count || 0;
    return typeof count === 'bigint' ? Number(count) : count;
  }

  /**
   * Count matching videos using FTS5
   */
  private async countVideos(query: string): Promise<number> {
    const searchQuery = this.prepareFTS5Query(query);

    const result = await this.prisma.$queryRawUnsafe<[{ count: number | bigint }]>(`
      SELECT COUNT(*) as count
      FROM videos_fts fts
      JOIN video v ON fts.rowid = v.rowid
      WHERE videos_fts MATCH ? AND v.missing_on_disk = false
    `, searchQuery);

    const count = result[0]?.count || 0;
    return typeof count === 'bigint' ? Number(count) : count;
  }

  /**
   * Prepare query for FTS5 (handle special characters and syntax)
   */
  private prepareFTS5Query(query: string): string {
    // Escape special FTS5 characters and add prefix matching
    return query
      .trim()
      .replace(/[^\w\s]/g, ' ') // Replace special chars with spaces
      .split(/\s+/) // Split on whitespace
      .filter(term => term.length > 0)
      .map(term => `${term}*`) // Add prefix matching
      .join(' '); // Join with AND (default)
  }

  /**
   * Convert BigInt fields to numbers for JSON serialization
   */
  private convertBigIntFields(results: any[]): any[] {
    return results.map(item => {
      const converted = { ...item };
      
      // Convert any BigInt fields to numbers
      Object.keys(converted).forEach(key => {
        if (typeof converted[key] === 'bigint') {
          converted[key] = Number(converted[key]);
        }
      });
      
      return converted;
    });
  }

  /**
   * Sync a single video with FTS5 (called when video is added/updated)
   */
  async syncVideo(videoId: string): Promise<void> {
    try {
      // Get video data
      const video = await this.prisma.video.findUnique({
        where: { videoId },
        select: { 
          videoId: true, 
          title: true, 
          uploader: true, 
          description: true,
          missingOnDisk: true
        }
      });

      if (!video) return;

      // Remove from FTS5 first (in case it exists)
      await this.prisma.$executeRawUnsafe(`
        DELETE FROM videos_fts WHERE video_id = ?
      `, videoId);

      // Add to FTS5 if not missing on disk
      if (!video.missingOnDisk) {
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO videos_fts(video_id, title, uploader, description)
          VALUES (?, ?, ?, ?)
        `,
          video.videoId,
          video.title || '',
          video.uploader || '',
          video.description || ''
        );
      }
    } catch (error) {
      console.error(`Failed to sync video ${videoId} with FTS5:`, error);
    }
  }

  /**
   * Sync a single channel with FTS5 (called when channel is added/updated)
   */
  async syncChannel(uploaderId: string): Promise<void> {
    try {
      // Get channel data
      const channel = await this.prisma.channel.findUnique({
        where: { uploaderId },
        select: { uploaderId: true, name: true }
      });

      if (!channel) return;

      // Remove from FTS5 first (in case it exists)
      await this.prisma.$executeRawUnsafe(`
        DELETE FROM channels_fts WHERE uploader_id = ?
      `, uploaderId);

      // Add to FTS5
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO channels_fts(uploader_id, name)
        VALUES (?, ?)
      `, channel.uploaderId, channel.name || '');
    } catch (error) {
      console.error(`Failed to sync channel ${uploaderId} with FTS5:`, error);
    }
  }
}
