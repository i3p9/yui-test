// ============================================
// VIDEO ROUTES
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { getPrismaClient } from '../lib/database.js';

const videoRoutes: FastifyPluginAsync = async (fastify) => {
  const prisma = getPrismaClient();

  // GET /api/videos - List videos with pagination and filters
  fastify.get('/', async (request, reply) => {
    const query = request.query as any;
    const {
      page = 1,
      limit = 20,
      mediaType,
      uploader,
      missingOnDisk = 'false',
      sort = 'uploadDate',
      order = 'desc',
    } = query;

    const skip = (Number(page) - 1) * Number(limit);

    const where = {
      mediaType: mediaType || undefined,
      uploader: uploader || undefined,
      missingOnDisk: missingOnDisk === 'true',
    };

    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sort]: order },
        select: {
          videoId: true,
          title: true,
          uploader: true,
          uploadDate: true,
          durationSeconds: true,
          thumbnailPath: true,
          generatedThumbnail: true,
          resolution: true,
          metadataSource: true,
          hasCompleteMetadata: true,
          filesizeBytes: true,
          lastScannedAt: true,
        },
      }),
      prisma.video.count({ where }),
    ]);

    // Convert BigInt to Number for JSON serialization
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

  // GET /api/videos/:id - Get single video with full details
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const video = await prisma.video.findUnique({
      where: { videoId: id },
      include: {
        subtitles: true,
        watchProgress: true,
      },
    });

    if (!video) {
      return reply.code(404).send({ error: 'Video not found' });
    }

    // Convert BigInt to Number for JSON serialization
    return {
      ...video,
      filesizeBytes: video.filesizeBytes ? Number(video.filesizeBytes) : null,
    };
  });

  // GET /api/videos/stats/summary - Get overall statistics
  fastify.get('/stats/summary', async (request, reply) => {
    const [total, byType, totalSize] = await Promise.all([
      prisma.video.count({ where: { missingOnDisk: false } }),
      prisma.video.groupBy({
        by: ['mediaType'],
        where: { missingOnDisk: false },
        _count: true,
      }),
      prisma.video.aggregate({
        where: { missingOnDisk: false },
        _sum: { filesizeBytes: true },
      }),
    ]);

    // Convert BigInt to Number for JSON serialization
    const totalSizeNum = totalSize._sum.filesizeBytes
      ? Number(totalSize._sum.filesizeBytes)
      : 0;

    return {
      totalVideos: total,
      byType: byType.map((t) => ({
        mediaType: t.mediaType,
        count: t._count,
      })),
      totalSizeBytes: totalSizeNum,
    };
  });
};

export default videoRoutes;
