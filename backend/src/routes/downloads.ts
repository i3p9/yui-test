import type { FastifyPluginAsync } from 'fastify';
import { z, ZodError } from 'zod';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadService } from '../services/download-service.js';
import { DownloadError } from '../services/download-validation.js';
import { cookieStatus, deleteCookies, runDirectory, writeCookies } from '../services/download-storage.js';
import { applyImport, previewImport } from '../services/download-import.js';
import { redact, toolStatus } from '../services/yt-dlp-runner.js';

// Cookies and the shared archive are read/written by running downloads; change them only while idle.
async function whenIdle<T>(fn: () => Promise<T>): Promise<T> {
  if (downloadService.busy) throw new DownloadError('Downloads are running; try again when they finish', 409);
  return fn();
}
const downloads: FastifyPluginAsync = async app => {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: 'Invalid download settings', fields: error.flatten() });
    if (error instanceof DownloadError) return reply.code(error.statusCode).send({ error: redact(error.message) });
    if ((error as { statusCode?: number }).statusCode === 413) return reply.code(413).send({ error: 'Upload exceeds the allowed size' });
    if ([400, 415].includes((error as { statusCode?: number }).statusCode ?? 0)) return reply.code(400).send({ error: 'Invalid JSON request' });
    request.log.error({ message: 'Download operation failed' });
    return reply.code(500).send({ error: 'Download operation failed; check configuration and storage permissions' });
  });
  app.addHook('preHandler', async (_request, reply) => {
    if (downloadService.unavailableReason) {
      return reply.code(503).send({ error: `Downloader is unavailable: ${redact(downloadService.unavailableReason)}` });
    }
  });
  const id = (params: unknown) => z.object({ id: z.string().uuid() }).parse(params).id;
  app.get('/settings', () => downloadService.settings());
  app.put('/settings', request => downloadService.saveSettings(request.body));
  app.get('/sources', () => downloadService.sources());
  app.post('/sources', async (request, reply) => reply.code(201).send(await downloadService.saveSource(request.body)));
  app.patch('/sources/:id', request => downloadService.saveSource(request.body, id(request.params)));
  app.delete('/sources/:id', request => downloadService.removeSource(id(request.params)));
  app.post('/sources/:id/run', async (request, reply) => {
    const result = await downloadService.enqueueSource(id(request.params));
    return reply.code(result.created ? 202 : 200).send(result);
  });
  app.post('/run', async (request, reply) => reply.code(202).send(await downloadService.enqueueAll()));
  app.post('/videos', async (request, reply) => {
    const result = await downloadService.enqueueVideo(request.body);
    return reply.code(result.created ? 202 : 200).send(result);
  });
  app.get('/runs', request => {
    const query = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).parse(request.query);
    return downloadService.runs(query.page, query.limit);
  });
  app.get('/runs/:id', request => downloadService.getRun(id(request.params)));
  app.get('/runs/:id/log', async request => {
    const runId = id(request.params);
    await downloadService.getRun(runId);
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(65536).default(16384) }).parse(request.query);
    let file;
    try { file = await open(join(runDirectory(runId), 'output.log'), 'r'); }
    catch (error: any) { if (error.code === 'ENOENT') return { content: '' }; throw error; }
    try {
      const size = (await file.stat()).size, buffer = Buffer.alloc(Math.min(limit, size));
      await file.read(buffer, 0, buffer.length, Math.max(0, size - limit));
      return { content: buffer.toString('utf8') };
    } finally { await file.close(); }
  });
  app.post('/runs/:id/cancel', request => downloadService.cancel(id(request.params)));
  app.post('/runs/:id/retry', async (request, reply) => reply.code(202).send(await downloadService.retry(id(request.params))));
  app.post('/runs/:id/retry-scan', async (request, reply) => reply.code(202).send(await downloadService.retryScan(id(request.params))));
  app.get('/cookies', cookieStatus);
  app.put('/cookies', { bodyLimit: 2 * 1024 * 1024 }, async request => {
    const { content } = z.object({ content: z.string().max(1024 * 1024) }).strict().parse(request.body);
    await whenIdle(() => writeCookies(content)); return cookieStatus();
  });
  app.delete('/cookies', async () => { await whenIdle(deleteCookies); return cookieStatus(); });
  app.post('/import/preview', { bodyLimit: 10 * 1024 * 1024 }, request => previewImport(request.body));
  app.post('/import', { bodyLimit: 10 * 1024 * 1024 }, request => whenIdle(() => applyImport(request.body)));
  app.get('/tools', toolStatus);
};
export default downloads;
