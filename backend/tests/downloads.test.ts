import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat, symlink, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import Fastify from 'fastify';
import downloadsRoutes from '../src/routes/downloads.js';
import configRoutes from '../src/routes/config.js';
import libraryRoutes from '../src/routes/library.js';
import dangerRoutes from '../src/routes/danger.js';
import { authMiddleware } from '../src/lib/auth.js';
import { clearConfigCache, loadConfig } from '../src/lib/config.js';
import { getPrismaClient, disconnectDatabase } from '../src/lib/database.js';
import { acquireBackgroundJob } from '../src/lib/background-job.js';
import { downloadService } from '../src/services/download-service.js';
import { downloadArgs, redact, runYtDlp } from '../src/services/yt-dlp-runner.js';
import { normalizeYoutube, type DownloadSnapshot } from '../src/services/download-validation.js';
import { atomicWrite, readArchive, unionArchive, runDirectory, prepareRun, publishRun, readReceipts, writeCookies } from '../src/services/download-storage.js';
import { LikedVideoOrderService } from '../src/services/liked-video-order-service.js';
import { MigrationService } from '../src/services/migration-service.js';
import { ScanOrchestrator } from '../src/services/scan-orchestrator.js';
import { DatabaseService } from '../src/services/database-service.js';
import { Scanner } from '../src/services/scanner.js';

const fake = resolve('tests/fixtures/fake-yt-dlp.mjs');
const idA = 'aaaaaaaaaaa', idB = 'bbbbbbbbbbb';
async function fixture(fn: (f: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  const env = { ...process.env };
  const f = await setup();
  try { await fn(f); }
  finally {
    await downloadService.stop(); await f.app.close(); await disconnectDatabase(); clearConfigCache();
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
    await rm(f.dir, { recursive: true, force: true });
  }
}
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yui-download-test-'));
  process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;
  process.env.CONFIG_PATH = join(dir, 'config.json');
  process.env.DOWNLOAD_STATE_DIR = join(dir, '.downloads');
  process.env.YTDLP_PATH = fake;
  delete process.env.AUTH_PASSWORD;
  delete process.env.FAKE_IDS; delete process.env.FAKE_LIKES_FAIL; delete process.env.FAKE_LIKES;
  process.env.FAKE_YTDLP_MODE = 'success';
  clearConfigCache();
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: process.env, stdio: 'pipe' });
  await new MigrationService().runMigrations();
  const library = join(dir, 'library'); await mkdir(library);
  const config = await loadConfig();
  await writeFile(process.env.CONFIG_PATH, JSON.stringify({ ...config, libraries: [{ name: 'Test', path: library, mediaType: 'channel_archive', skip: false }],
    scanOptions: { ...config.scanOptions, generateThumbnails: false, fetchMetadata: false } }));
  clearConfigCache();
  const app = Fastify(); app.addHook('onRequest', authMiddleware);
  await app.register(downloadsRoutes, { prefix: '/api/downloads' });
  await app.register(configRoutes, { prefix: '/api/config' });
  await app.register(libraryRoutes, { prefix: '/api/library' });
  await app.register(dangerRoutes, { prefix: '/api/danger' });
  await app.ready();
  const snapshot: DownloadSnapshot = { name: 'Test', url: `https://www.youtube.com/watch?v=${idA}`, kind: 'video', quality: '720p',
    libraryPath: library, libraryType: 'channel_archive', useCookies: false, uploadedAfter: null };
  return { dir, library, app, db: getPrismaClient(), snapshot };
}
async function source(f: Awaited<ReturnType<typeof setup>>, extra = {}) {
  const result = await f.app.inject({ method: 'POST', url: '/api/downloads/sources', payload: {
    name: 'Channel', kind: 'channel', url: 'https://www.youtube.com/@test', quality: '720p', libraryPath: f.library, ...extra,
  } });
  assert.equal(result.statusCode, 201, result.body); return result.json();
}
async function runSource(f: Awaited<ReturnType<typeof setup>>, sourceId: string) {
  const response = await f.app.inject({ method: 'POST', url: `/api/downloads/sources/${sourceId}/run` });
  assert.ok([200, 202].includes(response.statusCode), response.body);
  return response.json().run.id as string;
}
async function finish(f: Awaited<ReturnType<typeof setup>>) {
  await downloadService.start(); await downloadService.idle();
  return (await downloadService.runs()).runs[0];
}
async function waitUntil(check: () => Promise<boolean>) {
  for (let i = 0; i < 200; i++) { if (await check()) return; await delay(20); }
  throw new Error('Timed out waiting for condition');
}

test('URL normalization and argument policies reject unsafe inputs and preserve quality/date scope', async () => {
  assert.equal(normalizeYoutube('http://youtube.com/@example/').url, 'https://www.youtube.com/@example/videos');
  assert.equal(normalizeYoutube('https://youtube.com/channel/UC123/videos').kind, 'channel');
  assert.equal(normalizeYoutube(`https://youtu.be/${idA}?list=PL123`).url, `https://www.youtube.com/watch?v=${idA}`);
  assert.equal(normalizeYoutube(`https://youtube.com/shorts/${idA}`).kind, 'video');
  for (const input of ['--exec=whoami', 'file:///tmp/file', 'https://youtube.com.evil.test/watch?v=aaaaaaaaaaa', 'https://user:pass@youtube.com/@test', 'https://youtube.com:444/@test']) assert.throws(() => normalizeYoutube(input));
  await fixture(async f => {
    for (const quality of ['720p', '1080p', 'best'] as const) {
      const args = downloadArgs({ ...f.snapshot, quality, uploadedAfter: '2020-01-01' }, 'test', f.library);
      assert.ok(args.includes('--no-simulate')); assert.ok(args.includes('--no-playlist'));
      assert.equal(args.filter(a => a === '--match-filters').length, 1);
      assert.ok(args[args.indexOf('--match-filters') + 1].includes('upload_date >= 20200101'));
      assert.equal(args[args.indexOf('--dateafter') + 1], '20200101');
      if (quality === 'best') assert.ok(!args.includes('-f'));
      else assert.equal(args[args.indexOf('-f') + 1], `bv[height<=${quality === '720p' ? 720 : 1080}]+ba/b[height<=${quality === '720p' ? 720 : 1080}]`);
    }
    assert.ok(!downloadArgs(f.snapshot, 'test', f.library).includes('--dateafter'));
  });
});

test('fresh migration, API validation, durable schedule and active-run deduplication', async () => fixture(async f => {
  assert.equal((await downloadService.settings()).scheduleEnabled, false);
  assert.equal((await downloadService.settings()).intervalHours, 24);
  for (const intervalHours of [0, 1.5, 8761, '24']) {
    const r = await f.app.inject({ method: 'PUT', url: '/api/downloads/settings', payload: { scheduleEnabled: true, intervalHours } });
    assert.equal(r.statusCode, 400);
  }
  const s = await source(f);
  assert.equal((await f.app.inject({ method: 'PATCH', url: `/api/downloads/sources/${s.id}`, payload: [] })).statusCode, 400);
  const id = await runSource(f, s.id);
  assert.equal(await runSource(f, s.id), id);
  const saved = await downloadService.saveSettings({ scheduleEnabled: true, intervalHours: 24 });
  assert.ok(saved.nextRunAt);
  assert.equal((await downloadService.saveSettings({ scheduleEnabled: true, intervalHours: 24 })).nextRunAt, saved.nextRunAt);
  const due = Date.parse(saved.nextRunAt!);
  await Promise.all([downloadService.tick(due + 72 * 3_600_000), downloadService.tick(due + 72 * 3_600_000)]);
  assert.equal(await f.db.downloadRun.count(), 1);
  assert.equal((await downloadService.settings()).nextRunAt, new Date(due + 96 * 3_600_000).toISOString());
  const copy = await source(f, { name: 'Other', url: 'https://youtube.com/@other', position: 1 });
  await downloadService.enqueueAll();
  assert.equal(await f.db.downloadRun.count(), 2);
  await downloadService.saveSource({ enabled: false }, copy.id);
  assert.equal((await f.db.downloadRun.findFirstOrThrow({ where: { sourceId: copy.id } })).status, 'cancelled');
  const old = await f.db.downloadRun.findUniqueOrThrow({ where: { id } });
  await downloadService.saveSource({ quality: 'best' }, s.id);
  assert.equal(JSON.parse(old.snapshot).quality, '720p');
  assert.equal((await downloadService.getRun(id)).settings.quality, '720p');
  assert.equal((await downloadService.saveSettings({ scheduleEnabled: false, intervalHours: 24 })).nextRunAt, null);
  assert.equal((await f.app.inject('/api/downloads/runs?limit=-1')).statusCode, 400);
}));

test('successful worker publishes sidecars, ingests once and never upgrades an archived video', async () => fixture(async f => {
  const s = await source(f); const id = await runSource(f, s.id);
  let scans = 0; const original = ScanOrchestrator.prototype.scan;
  ScanOrchestrator.prototype.scan = async function(options) { scans++; return original.call(this, options); };
  try {
    const result = await finish(f);
    assert.equal(result.status, 'succeeded', result.error ?? ''); assert.equal(result.scanStatus, 'complete');
    assert.equal(result.publishedCount, 1); assert.equal(scans, 1);
    const video = await f.db.video.findUniqueOrThrow({ where: { videoId: idA } });
    assert.ok(!video.videoPath.includes('.yui-staging')); assert.equal(await readFile(video.videoPath, 'utf8'), 'fake completed video');
    const before = await stat(video.videoPath);
    assert.deepEqual([...await readArchive()], [idA]);
    await f.db.watchProgress.create({ data: { videoId: idA, positionSeconds: 5, lastWatchedAt: new Date().toISOString() } });
    await downloadService.stop(); await downloadService.saveSource({ quality: 'best' }, s.id); await runSource(f, s.id);
    const again = await finish(f);
    assert.equal(again.publishedCount, 0); assert.equal(again.scanStatus, 'not_needed'); assert.equal(scans, 1);
    assert.equal((await stat(video.videoPath)).mtimeMs, before.mtimeMs);
    assert.equal((await f.db.watchProgress.findUniqueOrThrow({ where: { videoId: idA } })).positionSeconds, 5);
    const retry = await f.app.inject({ method: 'POST', url: `/api/downloads/runs/${id}/retry-scan` });
    assert.equal(retry.statusCode, 409, retry.body);
  } finally { ScanOrchestrator.prototype.scan = original; }
}));

test('overlapping sources coalesce scans and liked discovery survives archive skipping', async () => fixture(async f => {
  await source(f);
  const liked = await source(f, { name: 'Likes', url: 'https://www.youtube.com/playlist?list=LL', kind: 'liked', quality: 'best', position: 1 });
  await writeCookies('# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\ttest\tfixture-only\n');
  process.env.FAKE_IDS = JSON.stringify([idA]); process.env.FAKE_LIKES = JSON.stringify([idA]);
  await downloadService.enqueueAll();
  let scans = 0; const original = ScanOrchestrator.prototype.scan;
  ScanOrchestrator.prototype.scan = async function(options) { scans++; return original.call(this, options); };
  try { await finish(f); } finally { ScanOrchestrator.prototype.scan = original; }
  assert.equal(scans, 1); assert.equal(await f.db.video.count(), 1);
  assert.equal(await f.db.likedVideo.count(), 1);
  assert.equal((await f.app.inject('/api/library/liked')).json().pagination.total, 1);
  assert.equal((await f.app.inject('/api/library/liked')).json().videos[0].mediaType, 'channel_archive');
  assert.equal((await f.db.downloadRun.findFirstOrThrow({ where: { sourceId: liked.id } })).publishedCount, 0);
  const service = new LikedVideoOrderService();
  await service.applySnapshot([idB, idA]);
  await service.applySnapshot([idA]);
  assert.deepEqual((await f.db.likedVideo.findMany({ orderBy: { likedOrder: 'asc' } })).map(v => v.videoId), [idB, idA]);
  const before = await f.db.likedVideo.findMany();
  await downloadService.stop(); process.env.FAKE_LIKES_FAIL = '1'; await runSource(f, liked.id);
  const result = await finish(f); assert.equal(result.status, 'failed');
  assert.deepEqual(await f.db.likedVideo.findMany(), before);
}));

test('partial exit preserves successes; scan failure is separate and retry scan does not download', async () => fixture(async f => {
  process.env.FAKE_YTDLP_MODE = 'partial';
  const s = await source(f); await runSource(f, s.id);
  const original = ScanOrchestrator.prototype.scan;
  ScanOrchestrator.prototype.scan = async () => ({ videosScanned: 0, videosAdded: 0, videosUpdated: 0, videosRemoved: 0, duration: 0, errors: ['Test traversal error'] });
  let result;
  try { result = await finish(f); } finally { ScanOrchestrator.prototype.scan = original; }
  assert.equal(result.status, 'partial'); assert.equal(result.scanStatus, 'failed'); assert.equal(result.publishedCount, 1);
  assert.ok((await readArchive()).has(idA));
  process.env.FAKE_YTDLP_MODE = 'fail';
  await downloadService.retryScan(result.id); await downloadService.idle();
  assert.equal((await downloadService.getRun(result.id)).scanStatus, 'complete');
  assert.equal(await f.db.downloadRun.count(), 1); assert.equal(await f.db.video.count(), 1);
}));

test('missing sidecars do not commit history; imported missing-file history remains skipped', async () => fixture(async f => {
  process.env.FAKE_YTDLP_MODE = 'missing-info';
  const s = await source(f); await runSource(f, s.id);
  const result = await finish(f); assert.equal(result.status, 'failed'); assert.equal(result.finalized, false);
  assert.equal((await readArchive()).size, 0); assert.equal(await f.db.video.count(), 0);
  // A separate generated ID proves imported historical skips without repairing missing media.
  await unionArchive([idB]); process.env.FAKE_IDS = JSON.stringify([idB]);
  await downloadService.stop();
  // Resolve the failed fixture's sidecar so explicit recovery can finish safely.
  const receipt = (await readReceipts(result.id))[0];
  await writeFile(receipt.filepath.replace(/\.mp4$/, '.info.json'), JSON.stringify({ id: idA }));
  await downloadService.retry(result.id); await downloadService.start(); await downloadService.idle();
  assert.ok((await readArchive()).has(idB)); assert.equal(await f.db.video.count({ where: { videoId: idB } }), 0);
}));

test('downloads never block other jobs; cancellation, descendant cleanup and subsequent queue work', async () => fixture(async f => {
  const s = await source(f); const first = await runSource(f, s.id);
  // Another background job (e.g. a scan) does not stop the download itself.
  const release = acquireBackgroundJob('test-scan'); assert.ok(release);
  await downloadService.start(); await downloadService.idle(); release();
  assert.equal((await downloadService.getRun(first)).status, 'succeeded');
  const id = await runSource(f, s.id);
  process.env.FAKE_YTDLP_MODE = 'hang'; process.env.FAKE_PID_FILE = join(f.dir, 'pids.json');
  await downloadService.tick();
  await waitUntil(async () => { try { await stat(process.env.FAKE_PID_FILE!); return true; } catch { return false; } });
  const pids = JSON.parse(await readFile(process.env.FAKE_PID_FILE, 'utf8'));
  // Other jobs stay available while a download runs.
  const scanLock = acquireBackgroundJob('test-scan-during-download'); assert.ok(scanLock); scanLock();
  const reset = await f.app.inject({ method: 'POST', url: '/api/danger/reset' }); assert.equal(reset.statusCode, 200, reset.body);
  // Cookies are in use by the running download, so changing them waits.
  assert.equal((await f.app.inject({ method: 'DELETE', url: '/api/downloads/cookies' })).statusCode, 409);
  await downloadService.cancel(id); await downloadService.idle();
  assert.equal((await downloadService.getRun(id)).status, 'cancelled');
  await waitUntil(async () => { try { process.kill(pids.child, 0); return false; } catch { return true; } });
  assert.throws(() => process.kill(pids.parent, 0));
  process.env.FAKE_YTDLP_MODE = 'success'; await downloadService.retry(id); await downloadService.idle();
  assert.equal((await downloadService.runs()).runs[0].status, 'succeeded');
}));

test('imports preview without mutation, apply idempotently and reject conflicts/secrets', async () => fixture(async f => {
  const input = { groups: [{ quality: '720p', libraryPath: f.library, content: '# comment\nhttps://youtube.com/@test\n' }], archive: `youtube ${idA}\nyoutube ${idA}\n` };
  let r = await f.app.inject({ method: 'POST', url: '/api/downloads/import/preview', payload: input });
  assert.equal(r.statusCode, 200, r.body); assert.equal(r.json().sources.length, 1); assert.equal(await f.db.downloadSource.count(), 0);
  assert.equal((await readArchive()).size, 0);
  r = await f.app.inject({ method: 'POST', url: '/api/downloads/import', payload: input }); assert.equal(r.statusCode, 200, r.body);
  r = await f.app.inject({ method: 'POST', url: '/api/downloads/import', payload: input }); assert.equal(r.json().skipped, 1);
  assert.equal(await f.db.downloadSource.count(), 1); assert.equal(await f.db.downloadRun.count(), 0);
  assert.equal((await downloadService.settings()).scheduleEnabled, false);
  const changed = { ...input, groups: [{ ...input.groups[0], quality: 'best' }] };
  assert.equal((await f.app.inject({ method: 'POST', url: '/api/downloads/import', payload: changed })).statusCode, 400);
  assert.equal((await f.app.inject({ method: 'PUT', url: '/api/downloads/cookies', payload: { content: 'invalid' } })).statusCode, 400);
  const content = '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\ttest\tprivate-test-value\n';
  r = await f.app.inject({ method: 'PUT', url: '/api/downloads/cookies', payload: { content } }); assert.equal(r.statusCode, 200);
  assert.ok(!r.body.includes('private-test-value'));
  assert.equal((await stat(join(process.env.DOWNLOAD_STATE_DIR!, 'cookies.txt'))).mode & 0o777, 0o600);
  // Unrelated background jobs (scans, metadata) do not block cookie changes.
  const release = acquireBackgroundJob('test-cookie-use'); assert.ok(release);
  assert.equal((await f.app.inject({ method: 'DELETE', url: '/api/downloads/cookies' })).statusCode, 200); release();
  assert.ok(!redact('https://example.test/video?token=secret').includes('secret'));
  assert.ok(!redact('https://user:private-password@proxy.test/video').includes('private-password'));
}));

test('authentication fails closed on invalid config and library references block removal', async () => fixture(async f => {
  await source(f); const config = await loadConfig();
  const r = await f.app.inject({ method: 'POST', url: '/api/config', payload: { ...config, libraries: [] } });
  assert.equal(r.statusCode, 409, r.body);
  await writeFile(process.env.CONFIG_PATH!, '{broken'); clearConfigCache();
  assert.equal((await f.app.inject('/api/downloads/sources')).statusCode, 503);
  await writeFile(process.env.CONFIG_PATH!, JSON.stringify({ ...config, auth: { password: 'test-password' } })); clearConfigCache();
  assert.equal((await f.app.inject('/api/downloads/sources')).statusCode, 401);
}));

test('legacy liked scans and order import retain membership through index reset', async () => fixture(async f => {
  const service = new LikedVideoOrderService();
  assert.equal((await service.importFromText(`1 ${idA}\n2 ${idB}\nbad`)).updated, 2);
  assert.equal(await f.db.video.count(), 0);
  await source(f); await downloadService.enqueueAll(); await finish(f); await downloadService.stop();
  const video = await f.db.video.findUniqueOrThrow({ where: { videoId: idA } });
  await f.db.likedVideo.deleteMany();
  const metadata = { ...video, mediaType: 'liked_videos', filesizeBytes: Number(video.filesizeBytes), subtitles: [], hasCompleteMetadata: true } as any;
  await new DatabaseService().upsertVideo(metadata, { path: f.library, name: 'Legacy likes', mediaType: 'liked_videos', skip: false }, { skipFtsSync: true });
  assert.equal(await service.has(idA), true);
  assert.equal((await f.db.video.findUniqueOrThrow({ where: { videoId: idA } })).videoPath, video.videoPath);
  const archive = await readArchive();
  assert.equal((await f.app.inject({ method: 'POST', url: '/api/danger/reset' })).statusCode, 200);
  assert.equal(await f.db.video.count(), 0); assert.equal(await service.has(idA), true);
  assert.deepEqual(await readArchive(), archive); assert.equal(await f.db.downloadSource.count(), 1);
}));

test('hidden staging is excluded and failed traversal cannot mark indexed videos missing', async () => fixture(async f => {
  await source(f); await downloadService.enqueueAll(); await finish(f); await downloadService.stop();
  const stage = await prepareRun('test-hidden', f.snapshot);
  const hiddenFile = join(stage, `unfinished [${idB}].mp4`); await writeFile(hiddenFile, 'incomplete');
  assert.equal((await new Scanner().scanLibrary({ path: f.library, name: 'Test', mediaType: 'channel_archive', skip: false })).length, 1);
  const inaccessible = join(f.dir, 'offline-library');
  await rm(f.library, { recursive: true });
  const result = await new ScanOrchestrator().scan({ libraryPath: f.library });
  assert.ok(result.errors.length > 0);
  assert.equal((await f.db.video.findUniqueOrThrow({ where: { videoId: idA } })).missingOnDisk, false);
}));

test('staging symlinks are rejected before creating anything outside the library', async () => fixture(async f => {
  const outside = join(f.dir, 'outside'); await mkdir(outside);
  await symlink(outside, join(f.library, '.yui-staging'));
  await assert.rejects(() => prepareRun('unsafe-test', f.snapshot), /must not be a symlink/);
  await assert.rejects(() => stat(join(outside, 'unsafe-test')), { code: 'ENOENT' });
  await assert.rejects(() => prepareRun('../escape', f.snapshot), /Invalid run ID/);
}));

test('split UTF-8/progress and a truncated receipt retain completed media', async () => fixture(async f => {
  const run = await f.db.downloadRun.create({ data: { snapshot: JSON.stringify(f.snapshot), trigger: 'manual', createdAt: new Date().toISOString() } });
  const stage = await prepareRun(run.id, f.snapshot), lines: string[] = [];
  process.env.FAKE_YTDLP_MODE = 'split';
  const result = await runYtDlp(downloadArgs(f.snapshot, run.id, stage), { onLine: line => lines.push(line) });
  assert.equal(result.exitCode, 0); assert.ok(lines.includes('Test café'));
  assert.equal(JSON.parse(lines.find(l => l.startsWith('YUI_PROGRESS:'))!.slice(13)).total_bytes, 20);
  const receiptFile = await open(join(runDirectory(run.id), 'completed.jsonl'), 'a');
  await receiptFile.writeFile('{"id":"incomplete'); await receiptFile.close();
  assert.equal((await readReceipts(run.id)).length, 1);
  assert.equal(await publishRun(run.id, f.snapshot, async () => {}), 1);
  assert.ok((await readArchive()).has(idA));
}));

test('archive commit failure after rename recovers without overwriting completed media', async () => fixture(async f => {
  const run = await f.db.downloadRun.create({ data: { snapshot: JSON.stringify(f.snapshot), trigger: 'manual', createdAt: new Date().toISOString() } });
  const stage = await prepareRun(run.id, f.snapshot);
  assert.equal((await runYtDlp(downloadArgs(f.snapshot, run.id, stage))).exitCode, 0);
  const receipt = (await readReceipts(run.id))[0], archivePath = join(process.env.DOWNLOAD_STATE_DIR!, 'archive.txt');
  await mkdir(archivePath);
  await assert.rejects(() => publishRun(run.id, f.snapshot, async () => {}));
  assert.equal((await readReceipts(run.id)).length, 1);
  const finalFile = receipt.filepath.replace(join(f.library, '.yui-staging', run.id), f.library), before = await stat(finalFile);
  await rm(archivePath, { recursive: true });
  assert.equal(await publishRun(run.id, f.snapshot, async () => {}), 1);
  assert.equal((await stat(finalFile)).mtimeMs, before.mtimeMs); assert.ok((await readArchive()).has(idA));
}));

test('missing destinations fail without creating a replacement mount or blocking later work', async () => fixture(async f => {
  const s = await source(f); await runSource(f, s.id); await rm(f.library, { recursive: true });
  const failed = await finish(f);
  assert.equal(failed.status, 'failed'); assert.equal(failed.finalized, true);
  await assert.rejects(() => stat(f.library), { code: 'ENOENT' });
  await downloadService.saveSource({ enabled: false }, s.id); await mkdir(f.library);
  await downloadService.retry(failed.id); await downloadService.idle();
  assert.equal((await downloadService.runs()).runs[0].status, 'succeeded');
}));

test('a disappearing subtree is recorded as a traversal error without aborting the walk', async () => fixture(async f => {
  const nested = join(f.library, 'nested'); await mkdir(nested);
  await writeFile(join(f.library, `root [${idA}].mp4`), 'media');
  await writeFile(join(f.library, `other [${idB}].mp4`), 'media');
  const scanner = new Scanner();
  const iterator = scanner.walkLibrary(f.library);
  assert.equal((await iterator.next()).done, false); await rm(nested, { recursive: true });
  for await (const candidate of iterator) { /* drain the remaining walk */ }
  assert.equal(scanner.getTraversalErrors().length, 1);
  assert.match(scanner.getTraversalErrors()[0], /Cannot read directory/);
}));

test('an unreadable folder still indexes readable videos and marks nothing missing', async () => fixture(async f => {
  const readable = join(f.library, 'Readable'), locked = join(f.library, 'Locked');
  await mkdir(readable); await mkdir(locked);
  await writeFile(join(readable, `one [${idA}].mp4`), 'media');
  await writeFile(join(locked, `two [${idB}].mp4`), 'media');
  let result = await new ScanOrchestrator().scan({ libraryPath: f.library });
  assert.deepEqual(result.errors, []);
  assert.equal(await f.db.video.count({ where: { missingOnDisk: false } }), 2);
  const idC = 'ccccccccccc';
  await writeFile(join(readable, `three [${idC}].mp4`), 'media');
  const { chmod } = await import('node:fs/promises');
  await chmod(locked, 0o000);
  try { result = await new ScanOrchestrator().scan({ libraryPath: f.library }); }
  finally { await chmod(locked, 0o755); }
  assert.ok(result.errors.some(e => /Cannot read directory/.test(e)), JSON.stringify(result.errors));
  assert.equal((await f.db.video.findUniqueOrThrow({ where: { videoId: idB } })).missingOnDisk, false);
  assert.ok(await f.db.video.findUnique({ where: { videoId: idC } }), 'readable new video is still indexed');
}));

test('skipped scan handoff stays pending and scan retry does not download again', async () => fixture(async f => {
  await source(f); await downloadService.enqueueAll();
  const original = ScanOrchestrator.prototype.scan;
  ScanOrchestrator.prototype.scan = async () => { throw new Error('Temporary scan failure'); };
  let run;
  try { run = await finish(f); } finally { ScanOrchestrator.prototype.scan = original; }
  assert.equal(run.status, 'succeeded'); assert.equal(run.scanStatus, 'failed'); await downloadService.stop();
  const config = await loadConfig(); config.libraries[0].skip = true;
  let response = await f.app.inject({ method: 'POST', url: '/api/config', payload: config }); assert.equal(response.statusCode, 200, response.body);
  await downloadService.retryScan(run.id); await downloadService.start(); await downloadService.idle();
  assert.equal((await downloadService.getRun(run.id)).scanStatus, 'pending');
  config.libraries[0].skip = false;
  response = await f.app.inject({ method: 'POST', url: '/api/config', payload: config }); assert.equal(response.statusCode, 200, response.body);
  process.env.FAKE_YTDLP_MODE = 'fail'; await downloadService.tick(); await downloadService.idle();
  assert.equal((await downloadService.getRun(run.id)).scanStatus, 'complete'); assert.equal(await f.db.downloadRun.count(), 1);
}));

test('retrying removed-source history does not select an unrelated queued source', async () => fixture(async f => {
  const original = await source(f); const id = await runSource(f, original.id);
  process.env.FAKE_YTDLP_MODE = 'empty'; await finish(f); await downloadService.stop();
  await downloadService.removeSource(original.id);
  const other = await source(f, { url: 'https://youtube.com/@another', name: 'Another' });
  const otherRun = await runSource(f, other.id);
  const retried = await downloadService.retry(id);
  assert.equal(retried.created, true); assert.notEqual(retried.run.id, otherRun);
  assert.equal(retried.run.sourceId, null); assert.equal(JSON.parse(retried.run.snapshot).url, 'https://www.youtube.com/@test/videos');
  assert.equal((await downloadService.retry(id)).run.id, retried.run.id);
}));

test('large child output is capped on disk and the API returns only a bounded tail', async () => fixture(async f => {
  process.env.FAKE_YTDLP_MODE = 'noisy';
  const s = await source(f); const id = await runSource(f, s.id);
  const run = await finish(f); assert.equal(run.status, 'succeeded');
  assert.equal((await stat(join(runDirectory(id), 'output.log'))).size, 10 * 1024 * 1024);
  const response = await f.app.inject(`/api/downloads/runs/${id}/log?limit=65536`);
  assert.equal(response.statusCode, 200); assert.ok(Buffer.byteLength(response.json().content) <= 65536);
  assert.equal((await f.app.inject(`/api/downloads/runs/${id}/log?limit=65537`)).statusCode, 400);
}));
