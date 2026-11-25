import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getPrismaClient, disconnectDatabase } from '../../src/lib/database.js';
import { downloadService } from '../../src/services/download-service.js';
import { atomicWrite, prepareRun, publishRun, readArchive, runDirectory } from '../../src/services/download-storage.js';
import { downloadArgs, runYtDlp } from '../../src/services/yt-dlp-runner.js';
import { MigrationService } from '../../src/services/migration-service.js';
import type { DownloadSnapshot } from '../../src/services/download-validation.js';

const root = process.env.YUI_TEST_ROOT;
if (!root || !root.includes('yui-recovery-') || process.env.DATABASE_URL !== `file:${join(root, 'test.db')}`) throw new Error('Isolated test environment required');
const db = getPrismaClient();
if (process.argv[2] === 'prepare') {
  const library = join(root, 'library'); await mkdir(library, { recursive: true });
  const snapshot: DownloadSnapshot = { name: 'Recovery test', kind: 'video', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    quality: '720p', libraryPath: library, libraryType: 'channel_archive', useCookies: false, uploadedAfter: null };
  const run = await db.downloadRun.create({ data: { snapshot: JSON.stringify(snapshot), trigger: 'manual', status: 'running', createdAt: new Date().toISOString() } });
  const stage = await prepareRun(run.id, snapshot);
  const result = await runYtDlp(downloadArgs(snapshot, run.id, stage));
  if (result.exitCode !== 0) throw new Error(result.error ?? 'Fake download failed');
  const point = process.argv[3];
  if (point === 'receipt') process.exit(91);
  await publishRun(run.id, snapshot, async () => {
    await db.downloadRun.update({ where: { id: run.id }, data: { scanStatus: 'pending' } });
    if (point === 'pending') process.exit(91);
  }, async publishedCount => {
    await db.downloadRun.update({ where: { id: run.id }, data: { publishedCount } });
    if (point === 'rename') process.exit(91);
  });
  if (point === 'archive') process.exit(91);
  await db.downloadRun.update({ where: { id: run.id }, data: { finalized: true } });
  if (point === 'scan-running') await db.downloadRun.update({ where: { id: run.id }, data: { scanStatus: 'running' } });
  process.exit(91);
} else {
  await new MigrationService().runMigrations();
  await downloadService.start(); await downloadService.idle(); await downloadService.stop();
  const run = await db.downloadRun.findFirstOrThrow();
  const video = await db.video.findUniqueOrThrow({ where: { videoId: 'aaaaaaaaaaa' } });
  console.log('YUI_RESULT:' + JSON.stringify({ status: run.status, finalized: run.finalized, scanStatus: run.scanStatus,
    publishedCount: run.publishedCount, archive: [...await readArchive()], count: await db.video.count(), videoPath: video.videoPath }));
  await disconnectDatabase();
}
