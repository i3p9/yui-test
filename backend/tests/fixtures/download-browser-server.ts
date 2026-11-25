import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import downloads from '../../src/routes/downloads.js';
import config from '../../src/routes/config.js';
import library from '../../src/routes/library.js';
import videos from '../../src/routes/videos.js';
import auth from '../../src/routes/auth.js';
import progress from '../../src/routes/progress.js';
import search from '../../src/routes/search.js';
import scan from '../../src/routes/scan.js';
import { authMiddleware } from '../../src/lib/auth.js';
import { downloadService } from '../../src/services/download-service.js';
import { MigrationService } from '../../src/services/migration-service.js';
import { disconnectDatabase } from '../../src/lib/database.js';
const root = await mkdtemp(join(tmpdir(), 'yui-browser-test-'));
process.env.CONFIG_PATH = join(root, 'config.json');
process.env.DATABASE_URL = `file:${join(root, 'test.db')}`;
process.env.DOWNLOAD_STATE_DIR = join(root, '.downloads');
process.env.YTDLP_PATH = resolve('tests/fixtures/fake-yt-dlp.mjs');
process.env.FAKE_YTDLP_MODE = 'success';
delete process.env.AUTH_PASSWORD; delete process.env.FAKE_IDS; delete process.env.FAKE_LIKES;
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { stdio: 'pipe', env: process.env });
const libraryPath = join(root, 'library'); await mkdir(libraryPath);
await writeFile(process.env.CONFIG_PATH, JSON.stringify({ libraries: [{ name: 'Browser test library', path: libraryPath, mediaType: 'channel_archive', skip: false }],
  databaseUrl: process.env.DATABASE_URL, thumbnailDir: join(root, 'thumbs'), metadataDir: join(root, 'metadata'),
  scanOptions: { parallelism: 1, followSymlinks: false, generateThumbnails: false, thumbnailConcurrency: 1, fetchMetadata: false, metadataConcurrency: 1 } }));
await new MigrationService().runMigrations();
const app = Fastify(); app.addHook('onRequest', authMiddleware);
for (const [prefix, routes] of [['downloads', downloads], ['config', config], ['library', library], ['videos', videos], ['auth', auth], ['progress', progress], ['search', search], ['scan', scan]] as const) {
  await app.register(routes, { prefix: `/api/${prefix}` });
}
app.post('/api/test/scenario', async req => {
  const mode = (req.body as { mode: string }).mode;
  if (!['success', 'partial', 'hang', 'fail'].includes(mode)) throw new Error('Invalid test mode');
  process.env.FAKE_YTDLP_MODE = mode; return { ok: true };
});
await app.register(fastifyStatic, { root: resolve('../frontend/dist'), prefix: '/' });
app.setNotFoundHandler((req, reply) => req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html'));
await downloadService.start();
const url = await app.listen({ port: 0, host: '127.0.0.1' });
console.log('YUI_BROWSER_READY:' + JSON.stringify({ url, library: libraryPath }));
async function stop() { await downloadService.stop(); await app.close(); await disconnectDatabase(); await rm(root, { recursive: true, force: true }); process.exit(0); }
process.once('SIGTERM', () => void stop()); process.once('SIGINT', () => void stop());
