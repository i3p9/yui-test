// ============================================
// SCAN ROUTES
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { ScanOrchestrator } from '../services/scan-orchestrator.js';
import { scanState } from '../lib/scan-state.js';
import { getPrismaClient } from '../lib/database.js';

const scanRoutes: FastifyPluginAsync = async (fastify) => {
  let currentScan: Promise<any> | null = null;

  // POST /api/scan - Trigger a new scan
  fastify.post('/', async (request, reply) => {
    const body = request.body as any;
    const { libraryPath, mode = 'incremental' } = body;

    // Check if scan is already running
    if (currentScan) {
      return reply.code(409).send({
        error: 'Scan already in progress',
        currentScan: scanState.getState(),
      });
    }

    const orchestrator = new ScanOrchestrator();

    // Start scan in background
    currentScan = orchestrator
      .scan({ libraryPath, mode })
      .finally(() => {
        currentScan = null;
      });

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
      isRunning: !!currentScan,
    };
  });

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
