// Opt-in, no internet: real yt-dlp/ffmpeg against a disposable localhost media fixture.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getPrismaClient, disconnectDatabase } from '../src/lib/database.js';
import { clearConfigCache } from '../src/lib/config.js';
import { downloadService } from '../src/services/download-service.js';
import { runDirectory } from '../src/services/download-storage.js';
import { MigrationService } from '../src/services/migration-service.js';
if (process.env.YUI_RUN_TOOL_TESTS !== '1') throw new Error('Set YUI_RUN_TOOL_TESTS=1 to run the local toolchain test');
const root = await mkdtemp(join(tmpdir(), 'yui-toolchain-test-'));
process.env.DATABASE_URL = `file:${join(root, 'test.db')}`;
process.env.CONFIG_PATH = join(root, 'config.json'); process.env.DOWNLOAD_STATE_DIR = join(root, '.downloads');
process.env.YTDLP_PATH = resolve('tests/fixtures/local-media-yt-dlp.mjs');
process.env.YUI_LOCAL_INFO = join(root, 'info.json'); clearConfigCache();
const library = join(root, 'library'); await mkdir(library);
const server = createServer(async (req, res) => {
  const name = req.url?.slice(1);
  if (!name || !/^(720|1080|1440|audio)\.(mp4|m4a)$/.test(name)) { res.writeHead(404); res.end(); return; }
  const file = join(root, name); res.writeHead(200, { 'Content-Length': (await stat(file)).size }); createReadStream(file).pipe(res);
});
try {
  for (const [width, height] of [[1280, 720], [1920, 1080], [2560, 1440]]) {
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=black:s=${width}x${height}:d=0.2`, '-an', '-c:v', 'libx264', '-preset', 'ultrafast', join(root, `${height}.mp4`)], { timeout: 15000 });
  }
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '0.2', '-c:a', 'aac', join(root, 'audio.m4a')], { timeout: 15000 });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const formats = [720, 1080, 1440].map(height => ({ format_id: String(height), ext: 'mp4', height, width: height * 16 / 9, vcodec: 'avc1', acodec: 'none', url: `${base}/${height}.mp4` }));
  const audio = { format_id: 'audio', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128, url: `${base}/audio.m4a` };
  await writeFile(process.env.CONFIG_PATH, JSON.stringify({ libraries: [{ name: 'Local tool test', path: library, mediaType: 'channel_archive', skip: false }],
    databaseUrl: process.env.DATABASE_URL, thumbnailDir: join(root, 'thumbnails'), metadataDir: join(root, 'metadata'),
    scanOptions: { parallelism: 1, followSymlinks: false, generateThumbnails: false, thumbnailConcurrency: 1, fetchMetadata: false, metadataConcurrency: 1 } }));
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: process.env, stdio: 'pipe' });
  await new MigrationService().runMigrations();
  const reports = [];
  for (const [quality, expectedHeight, id] of [['720p', 720, 'fixture0720'], ['1080p', 1080, 'fixture1080'], ['best', 1440, 'fixturebest']] as const) {
    await writeFile(process.env.YUI_LOCAL_INFO!, JSON.stringify({ id, title: 'Local tool fixture', channel: 'Test Channel', uploader: 'Test Channel', channel_id: 'UC_TEST_CHANNEL',
      upload_date: '20200102', live_status: 'not_live', duration: 0.2, description: 'Local fixture', extractor: 'youtube', extractor_key: 'Youtube',
      webpage_url: `https://www.youtube.com/watch?v=${id}`, formats: [...formats, audio] }));
    const queued = await downloadService.enqueueVideo({ url: `https://www.youtube.com/watch?v=${id}`, quality, libraryPath: library, useCookies: false });
    await downloadService.start(); await downloadService.idle();
    const run = await downloadService.getRun(queued.run.id);
    if (run.status !== 'succeeded') console.error(await readFile(join(runDirectory(run.id), 'output.log'), 'utf8'));
    assert.equal(run.status, 'succeeded', run.error ?? 'Toolchain failure'); assert.equal(run.scanStatus, 'complete');
    const video = await getPrismaClient().video.findUniqueOrThrow({ where: { videoId: id } });
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', video.videoPath], { encoding: 'utf8' }));
    const height = probe.streams.find((s: { codec_type: string }) => s.codec_type === 'video').height;
    assert.equal(height, expectedHeight); assert.ok(probe.streams.some((s: { codec_type: string }) => s.codec_type === 'audio'));
    reports.push({ quality, height, publishedCount: run.publishedCount, scanStatus: run.scanStatus });
    await downloadService.stop();
  }
  for (const [id, cutoff, uploadDate, expectedCount] of [
    ['fixturedate', '2020-01-02', '20200102', 1],
    ['fixtureold1', '2020-01-03', '20200102', 0],
    ['fixturenull', '2020-01-01', undefined, 0],
  ] as const) {
    await writeFile(process.env.YUI_LOCAL_INFO!, JSON.stringify({ id, title: 'Date fixture', channel: 'Test Channel', uploader: 'Test Channel', channel_id: 'UC_TEST_CHANNEL',
      upload_date: uploadDate, live_status: 'not_live', duration: 0.2, extractor: 'youtube', extractor_key: 'Youtube',
      webpage_url: `https://www.youtube.com/watch?v=${id}`, formats: [...formats, audio] }));
    const source = await downloadService.saveSource({ name: id, url: `https://www.youtube.com/@${id}`, kind: 'channel', quality: '720p', libraryPath: library, uploadedAfter: cutoff });
    const queued = await downloadService.enqueueSource(source.id);
    await downloadService.start(); await downloadService.idle();
    const run = await downloadService.getRun(queued.run.id);
    assert.equal(run.status, 'succeeded', run.error ?? 'Date filter failed');
    assert.equal(run.publishedCount, expectedCount);
    reports.push({ quality: '720p', height: expectedCount ? 720 : 0, publishedCount: run.publishedCount, scanStatus: run.scanStatus });
    await downloadService.stop();
  }
  await mkdir(resolve('../test-results'), { recursive: true });
  await writeFile(resolve('../test-results/downloader-toolchain.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports));
} finally {
  await downloadService.stop(); await disconnectDatabase(); server.closeAllConnections();
  await new Promise<void>(done => server.close(() => done())); await rm(root, { recursive: true, force: true });
}
