// ============================================
// STREAMING ROUTES
// ============================================
// Handles video streaming and thumbnail serving

import { FastifyPluginAsync } from 'fastify';
import { getPrismaClient } from '../lib/database.js';
import { createReadStream, statSync, existsSync } from 'fs';
import path from 'path';
import { loadConfig } from '../lib/config.js';

const streamRoutes: FastifyPluginAsync = async (fastify) => {
  const prisma = getPrismaClient();

  // GET /api/stream/:videoId - Stream video file with range request support
  fastify.get('/:videoId', async (request, reply) => {
    const { videoId } = request.params as { videoId: string };

    // Get video from database
    const video = await prisma.video.findUnique({
      where: { videoId },
      select: { videoPath: true, title: true },
    });

    if (!video || !video.videoPath) {
      return reply.code(404).send({ error: 'Video not found' });
    }

    const videoPath = video.videoPath;

    // Check if file exists
    if (!existsSync(videoPath)) {
      return reply.code(404).send({ error: 'Video file not found on disk' });
    }

    // Get file stats
    const stat = statSync(videoPath);
    const fileSize = stat.size;

    // Get range header
    const range = request.headers.range;

    // Determine MIME type based on file extension
    const ext = path.extname(videoPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.m4v': 'video/x-m4v',
      '.flv': 'video/x-flv',
    };
    const contentType = mimeTypes[ext] || 'video/mp4';

    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      // Create stream for the requested range
      const stream = createReadStream(videoPath, { start, end });

      // Set response headers for partial content
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Length', chunkSize);
      reply.header('Content-Type', contentType);

      return reply.send(stream);
    } else {
      // No range request - send entire file
      const stream = createReadStream(videoPath);

      reply.header('Content-Length', fileSize);
      reply.header('Content-Type', contentType);
      reply.header('Accept-Ranges', 'bytes');

      return reply.send(stream);
    }
  });

  // GET /api/stream/thumbnail/:videoId/:size - Serve optimized thumbnail with fallback
  // size can be 'small' or 'large'
  fastify.get('/thumbnail/:videoId/:size', async (request, reply) => {
    const { videoId, size } = request.params as { videoId: string; size: string };

    // Validate size parameter
    if (!['small', 'large'].includes(size)) {
      return reply.code(400).send({ error: 'Size must be "small" or "large"' });
    }

    // Load config to get thumbnail directory
    const config = await loadConfig();
    const optimizedPath = path.join(
      config.thumbnailDir,
      videoId,
      `thumb_${size}.jpg`
    );

    // Try to serve optimized thumbnail first
    if (existsSync(optimizedPath)) {
      const stat = statSync(optimizedPath);
      const stream = createReadStream(optimizedPath);

      reply.header('Content-Type', 'image/jpeg');
      reply.header('Content-Length', stat.size);
      reply.header('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

      return reply.send(stream);
    }

    // Fallback: Try to serve original thumbnail from database
    const video = await prisma.video.findUnique({
      where: { videoId },
      select: { thumbnailPath: true },
    });

    if (video?.thumbnailPath && existsSync(video.thumbnailPath)) {
      const ext = path.extname(video.thumbnailPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
      };
      const contentType = mimeTypes[ext] || 'image/jpeg';

      const stat = statSync(video.thumbnailPath);
      const stream = createReadStream(video.thumbnailPath);

      reply.header('Content-Type', contentType);
      reply.header('Content-Length', stat.size);
      reply.header('Cache-Control', 'public, max-age=86400'); // Cache for 1 day (shorter since it's original)

      return reply.send(stream);
    }

    // No thumbnail found
    return reply.code(404).send({ error: 'Thumbnail not found' });
  });

  // Legacy endpoint for backwards compatibility (if needed)
  // GET /api/stream/thumbnail/:filename - Serve thumbnail by filename
  fastify.get('/thumbnail/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };

    // Load config to get thumbnail directory
    const config = await loadConfig();
    const thumbnailPath = path.join(config.thumbnailDir, filename);

    // Check if file exists
    if (!existsSync(thumbnailPath)) {
      return reply.code(404).send({ error: 'Thumbnail not found' });
    }

    // Determine MIME type
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    const contentType = mimeTypes[ext] || 'image/jpeg';

    // Get file stats for size
    const stat = statSync(thumbnailPath);

    // Stream the thumbnail
    const stream = createReadStream(thumbnailPath);

    reply.header('Content-Type', contentType);
    reply.header('Content-Length', stat.size);
    reply.header('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

    return reply.send(stream);
  });
};

export default streamRoutes;
