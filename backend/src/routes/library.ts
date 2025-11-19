// ============================================
// LIBRARY ROUTES
// ============================================
// Handles library browsing: latest videos, channels, liked videos, etc.

import { FastifyPluginAsync } from 'fastify';
import { getPrismaClient } from '../lib/database.js';

const libraryRoutes: FastifyPluginAsync = async (fastify) => {
  const prisma = getPrismaClient();

  // GET /api/library/latest - Get latest videos (mixed from all libraries)
  fastify.get('/latest', async (request, reply) => {
    const query = request.query as any;
    const { page = 1, limit = 20 } = query;

    const skip = (Number(page) - 1) * Number(limit);

    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        where: { missingOnDisk: false },
        skip,
        take: Number(limit),
        orderBy: [
          { uploadDate: 'desc' },
          { lastScannedAt: 'desc' }
        ],
        select: {
          videoId: true,
          title: true,
          uploader: true,
          uploadDate: true,
          durationSeconds: true,
          thumbnailPath: true,
          generatedThumbnail: true,
          resolution: true,
          mediaType: true,
          uploaderId: true,
          filesizeBytes: true,
        },
      }),
      prisma.video.count({ where: { missingOnDisk: false } }),
    ]);

    const videosWithConvertedSize = videos.map((v) => ({
      ...v,
      filesizeBytes: v.filesizeBytes ? Number(v.filesizeBytes) : null,
    }));

    return {
      videos: videosWithConvertedSize,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    };
  });

  // GET /api/library/channels - Get all channels with video counts
  fastify.get('/channels', async (request, reply) => {
    const channels = await prisma.channel.findMany({
      orderBy: [
        { videoCount: 'desc' },
        { name: 'asc' }
      ],
    });

    return { channels };
  });

  // GET /api/library/channels/:uploaderId/videos - Get videos for a specific channel
  fastify.get('/channels/:uploaderId/videos', async (request, reply) => {
    const { uploaderId } = request.params as { uploaderId: string };
    const query = request.query as any;
    const { page = 1, limit = 20, sort = 'uploadDate' } = query;

    const skip = (Number(page) - 1) * Number(limit);

    // Validate sort field
    const validSorts = ['uploadDate', 'title', 'durationSeconds'];
    const sortField = validSorts.includes(sort) ? sort : 'uploadDate';

    const [videos, total, channel] = await Promise.all([
      prisma.video.findMany({
        where: {
          uploaderId,
          missingOnDisk: false,
        },
        skip,
        take: Number(limit),
        orderBy: { [sortField]: sortField === 'title' ? 'asc' : 'desc' },
        select: {
          videoId: true,
          title: true,
          uploader: true,
          uploadDate: true,
          durationSeconds: true,
          thumbnailPath: true,
          generatedThumbnail: true,
          resolution: true,
          mediaType: true,
          uploaderId: true,
          filesizeBytes: true,
        },
      }),
      prisma.video.count({
        where: { uploaderId, missingOnDisk: false },
      }),
      prisma.channel.findUnique({
        where: { uploaderId },
      }),
    ]);

    if (!channel) {
      return reply.code(404).send({ error: 'Channel not found' });
    }

    const videosWithConvertedSize = videos.map((v) => ({
      ...v,
      filesizeBytes: v.filesizeBytes ? Number(v.filesizeBytes) : null,
    }));

    return {
      channel,
      videos: videosWithConvertedSize,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    };
  });

  // GET /api/library/liked - Get liked videos
  fastify.get('/liked', async (request, reply) => {
    const query = request.query as any;
    const { page = 1, limit = 20 } = query;

    const skip = (Number(page) - 1) * Number(limit);

    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        where: {
          mediaType: 'liked_videos',
          missingOnDisk: false,
        },
        skip,
        take: Number(limit),
        orderBy: { uploadDate: 'desc' },
        select: {
          videoId: true,
          title: true,
          uploader: true,
          uploadDate: true,
          durationSeconds: true,
          thumbnailPath: true,
          generatedThumbnail: true,
          resolution: true,
          mediaType: true,
          uploaderId: true,
          filesizeBytes: true,
        },
      }),
      prisma.video.count({
        where: { mediaType: 'liked_videos', missingOnDisk: false },
      }),
    ]);

    const videosWithConvertedSize = videos.map((v) => ({
      ...v,
      filesizeBytes: v.filesizeBytes ? Number(v.filesizeBytes) : null,
    }));

    return {
      videos: videosWithConvertedSize,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    };
  });

  // GET /api/library/video/:videoId/related - Get related videos
  fastify.get('/video/:videoId/related', async (request, reply) => {
    const { videoId } = request.params as { videoId: string };
    const query = request.query as any;
    const { limit = 20 } = query;

    // Get the current video to determine context
    const currentVideo = await prisma.video.findUnique({
      where: { videoId },
      select: { mediaType: true, uploaderId: true },
    });

    if (!currentVideo) {
      return reply.code(404).send({ error: 'Video not found' });
    }

    let relatedVideos;

    if (currentVideo.mediaType === 'channel_archive' && currentVideo.uploaderId) {
      // Show other videos from the same channel
      relatedVideos = await prisma.video.findMany({
        where: {
          uploaderId: currentVideo.uploaderId,
          videoId: { not: videoId }, // Exclude current video
          missingOnDisk: false,
        },
        take: Number(limit),
        orderBy: { uploadDate: 'desc' },
        select: {
          videoId: true,
          title: true,
          uploader: true,
          uploadDate: true,
          durationSeconds: true,
          thumbnailPath: true,
          generatedThumbnail: true,
          resolution: true,
          mediaType: true,
          uploaderId: true,
          filesizeBytes: true,
        },
      });
    } else {
      // Show other liked videos
      relatedVideos = await prisma.video.findMany({
        where: {
          mediaType: 'liked_videos',
          videoId: { not: videoId },
          missingOnDisk: false,
        },
        take: Number(limit),
        orderBy: { uploadDate: 'desc' },
        select: {
          videoId: true,
          title: true,
          uploader: true,
          uploadDate: true,
          durationSeconds: true,
          thumbnailPath: true,
          generatedThumbnail: true,
          resolution: true,
          mediaType: true,
          uploaderId: true,
          filesizeBytes: true,
        },
      });
    }

    const videosWithConvertedSize = relatedVideos.map((v) => ({
      ...v,
      filesizeBytes: v.filesizeBytes ? Number(v.filesizeBytes) : null,
    }));

    return { videos: videosWithConvertedSize };
  });

  // GET /api/library/video/:videoId/navigation - Get prev/next video
  fastify.get('/video/:videoId/navigation', async (request, reply) => {
    const { videoId } = request.params as { videoId: string };

    // Get the current video
    const currentVideo = await prisma.video.findUnique({
      where: { videoId },
      select: { mediaType: true, uploaderId: true, uploadDate: true },
    });

    if (!currentVideo) {
      return reply.code(404).send({ error: 'Video not found' });
    }

    const uploadDate = currentVideo.uploadDate || '';
    let whereClause: any = { missingOnDisk: false };

    // Filter by context (same channel or liked videos)
    if (currentVideo.mediaType === 'channel_archive' && currentVideo.uploaderId) {
      whereClause.uploaderId = currentVideo.uploaderId;
    } else {
      whereClause.mediaType = 'liked_videos';
    }

    // Get previous video (older upload date)
    const prevVideo = await prisma.video.findFirst({
      where: {
        ...whereClause,
        uploadDate: { lt: uploadDate },
      },
      orderBy: { uploadDate: 'desc' },
      select: {
        videoId: true,
        title: true,
        uploader: true,
        uploadDate: true,
        durationSeconds: true,
        thumbnailPath: true,
        generatedThumbnail: true,
      },
    });

    // Get next video (newer upload date)
    const nextVideo = await prisma.video.findFirst({
      where: {
        ...whereClause,
        uploadDate: { gt: uploadDate },
      },
      orderBy: { uploadDate: 'asc' },
      select: {
        videoId: true,
        title: true,
        uploader: true,
        uploadDate: true,
        durationSeconds: true,
        thumbnailPath: true,
        generatedThumbnail: true,
      },
    });

    return {
      prev: prevVideo,
      next: nextVideo,
    };
  });
};

export default libraryRoutes;
