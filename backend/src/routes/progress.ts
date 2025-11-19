// ============================================
// WATCH PROGRESS ROUTES
// ============================================
// Handles video watch progress tracking

import { FastifyPluginAsync } from 'fastify';
import { getPrismaClient } from '../lib/database.js';

const progressRoutes: FastifyPluginAsync = async (fastify) => {
  const prisma = getPrismaClient();

  // POST /api/progress/:videoId - Update watch progress
  fastify.post('/:videoId', async (request, reply) => {
    const { videoId } = request.params as { videoId: string };
    const body = request.body as any;
    const { positionSeconds, durationSeconds } = body;

    if (typeof positionSeconds !== 'number') {
      return reply.code(400).send({ error: 'positionSeconds is required and must be a number' });
    }

    // Check if video exists
    const video = await prisma.video.findUnique({
      where: { videoId },
      select: { videoId: true, durationSeconds: true },
    });

    if (!video) {
      return reply.code(404).send({ error: 'Video not found' });
    }

    // Determine if video is completed (>95% watched)
    const totalDuration = durationSeconds || video.durationSeconds || 0;
    const completed = totalDuration > 0 && positionSeconds / totalDuration > 0.95;

    // Upsert watch progress
    const progress = await prisma.watchProgress.upsert({
      where: { videoId },
      create: {
        videoId,
        positionSeconds: Math.floor(positionSeconds),
        durationSeconds: totalDuration,
        lastWatchedAt: new Date().toISOString(),
        completed,
      },
      update: {
        positionSeconds: Math.floor(positionSeconds),
        durationSeconds: totalDuration,
        lastWatchedAt: new Date().toISOString(),
        completed,
      },
    });

    return { success: true, progress };
  });

  // GET /api/progress/:videoId - Get watch progress
  fastify.get('/:videoId', async (request, reply) => {
    const { videoId } = request.params as { videoId: string };

    const progress = await prisma.watchProgress.findUnique({
      where: { videoId },
    });

    if (!progress) {
      return { progress: null };
    }

    return { progress };
  });

  // DELETE /api/progress/:videoId - Clear watch progress
  fastify.delete('/:videoId', async (request, reply) => {
    const { videoId } = request.params as { videoId: string };

    try {
      await prisma.watchProgress.delete({
        where: { videoId },
      });
      return { success: true };
    } catch (error) {
      // Progress doesn't exist - that's fine
      return { success: true };
    }
  });
};

export default progressRoutes;
