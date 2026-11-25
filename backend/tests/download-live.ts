// Opt-in public smoke test; never loads the repository's config, database, cookies, or media.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getPrismaClient, disconnectDatabase } from '../src/lib/database.js';
import { clearConfigCache } from '../src/lib/config.js';
import { downloadService } from '../src/services/download-service.js';
import { readArchive } from '../src/services/download-storage.js';
import { toolStatus } from '../src/services/yt-dlp-runner.js';
import { MigrationService } from '../src/services/migration-service.js';
if (process.env.YUI_RUN_LIVE_TESTS !== '1') throw new Error('Set YUI_RUN_LIVE_TESTS=1 to allow this small public download');
const id = 'jNQXAC9IVRw'; // 19-second public video; inspect duration before downloading.
const executable = process.env.YUI_LIVE_YTDLP || 'yt-dlp';
const raw = execFileSync(executable, ['--ignore-config', '--js-runtimes', `node:${process.execPath}`, '--dump-single-json', '--skip-download',
  '--no-playlist', '--socket-timeout', '10', '--retries', '0', '--extractor-retries', '0', '--', `https://www.youtube.com/watch?v=${id}`],
  { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 60_000 });
const info = JSON.parse(raw);
assert.ok(info.duration > 0 && info.duration <= 30, 'Live fixture must remain short');
assert.ok((info.filesize_approx ?? info.filesize ?? Infinity) < 50 * 1024 * 1024, 'Live fixture exceeds size bound');
const root = await mkdtemp(join(tmpdir(), 'yui-live-test-'));
process.env.DATABASE_URL = `file:${join(root, 'test.db')}`;
process.env.CONFIG_PATH = join(root, 'config.json'); process.env.DOWNLOAD_STATE_DIR = join(root, '.downloads');
process.env.YTDLP_PATH = executable;
clearConfigCache();
try {
  const library = join(root, 'library'); await mkdir(library);
  await writeFile(process.env.CONFIG_PATH, JSON.stringify({ libraries: [{ name: 'Disposable live library', path: library, mediaType: 'channel_archive', skip: false }],
    databaseUrl: process.env.DATABASE_URL, thumbnailDir: join(root, 'thumbnails'), metadataDir: join(root, 'metadata'),
    scanOptions: { parallelism: 1, followSymlinks: false, generateThumbnails: false, thumbnailConcurrency: 1, fetchMetadata: false, metadataConcurrency: 1 } }));
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { stdio: 'pipe', env: process.env });
  await new MigrationService().runMigrations();
  await downloadService.enqueueVideo({ url: `https://www.youtube.com/watch?v=${id}`, quality: '720p', libraryPath: library, useCookies: false });
  await downloadService.start(); await downloadService.idle();
  const run = (await downloadService.runs()).runs[0];
  assert.equal(run.status, 'succeeded', run.error ?? 'Download did not succeed');
  assert.equal(run.scanStatus, 'complete', run.scanError ?? 'Scan did not complete'); assert.equal(run.publishedCount, 1);
  const video = await getPrismaClient().video.findUniqueOrThrow({ where: { videoId: id } });
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', video.videoPath], { encoding: 'utf8' }));
  const height = probe.streams.find((s: { codec_type: string }) => s.codec_type === 'video')?.height;
  assert.ok(height > 0 && height <= 720); assert.ok(probe.streams.some((s: { codec_type: string }) => s.codec_type === 'audio'));
  const before = await stat(video.videoPath);
  await downloadService.stop();
  await downloadService.enqueueVideo({ url: `https://www.youtube.com/watch?v=${id}`, quality: 'best', libraryPath: library, useCookies: false });
  await downloadService.start(); await downloadService.idle();
  const repeat = (await downloadService.runs()).runs[0];
  assert.equal(repeat.status, 'succeeded'); assert.equal(repeat.publishedCount, 0); assert.equal(repeat.scanStatus, 'not_needed');
  assert.equal((await stat(video.videoPath)).mtimeMs, before.mtimeMs);
  assert.deepEqual([...await readArchive()], [id]);
  const report = { id, duration: info.duration, height, filesize: before.size, status: run.status, scanStatus: run.scanStatus,
    repeat: { status: repeat.status, publishedCount: repeat.publishedCount }, tools: await toolStatus(), authenticated: 'not tested; no dedicated credentials' };
  await mkdir(resolve('../test-results'), { recursive: true });
  await writeFile(resolve('../test-results/downloader-live.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await downloadService.stop(); await disconnectDatabase(); await rm(root, { recursive: true, force: true });
}
