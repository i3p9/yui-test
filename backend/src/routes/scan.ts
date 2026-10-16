// ============================================
// SCAN ROUTES
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { startScan } from '../services/scan-service.js';
import { z } from 'zod';
import { scanScheduler } from '../services/scan-scheduler.js';
import { scanState } from '../lib/scan-state.js';
import { getPrismaClient } from '../lib/database.js';

const scanRoutes: FastifyPluginAsync = async (fastify) => {

  // POST /api/scan - Trigger a new scan
  fastify.post('/', async (request, reply) => {
    const parsed = z.object({
      libraryPath: z.string().optional(),
      mode: z.enum(['full', 'incremental']).default('incremental'),
    }).safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid scan options' });
    const { libraryPath, mode } = parsed.data;
    if (!startScan({ libraryPath, mode })) {
      return reply.code(409).send({
        error: 'Another background job is already in progress',
        currentScan: scanState.getState(),
      });
    }

    return {
      message: 'Scan started',
      mode,
      libraryPath: libraryPath || 'all',
    };
  });

  // GET /api/scan/status - Get current scan status
  fastify.get('/status', async (request, reply) => {
    const state = scanState.getState();

    return {
      ...state,
      isRunning: state.isRunning,
    };
  });

  fastify.get('/schedule', async () => scanScheduler.getStatus());

  // GET /api/scan/history - Get scan history
  fastify.get('/history', async (request, reply) => {
    const prisma = getPrismaClient();

    const logs = await prisma.scanLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 20,
    });

    return logs;
  });

  // GET /api/scan/latest - Get latest scan log
  fastify.get('/latest', async (request, reply) => {
    const prisma = getPrismaClient();

    const latest = await prisma.scanLog.findFirst({
      orderBy: { startedAt: 'desc' },
    });

    if (!latest) {
      return reply.code(404).send({ error: 'No scans found' });
    }

    return latest;
  });
};

export default scanRoutes;
