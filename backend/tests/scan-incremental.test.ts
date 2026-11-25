// Incremental scans skip unchanged files (stat only) but must still pick up real changes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearConfigCache, loadConfig } from '../src/lib/config.js';
import { disconnectDatabase, getPrismaClient } from '../src/lib/database.js';
import { MigrationService } from '../src/services/migration-service.js';
import { ScanOrchestrator } from '../src/services/scan-orchestrator.js';

async function addVideo(dir: string, id: string, { title = `Video ${id}`, size = 100 } = {}) {
  const base = `20200101 - ${title} [${id}]`, folder = join(dir, base);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, `${base}.mp4`), Buffer.alloc(size));
  await writeFile(join(folder, `${base}.info.json`), JSON.stringify({ id, title, uploader: 'Chan', channel_id: 'UC0000000000000000000001', upload_date: '20200101', duration: 10 }));
  return folder;
}

test('incremental scan skips unchanged files but catches edits, additions, removals and duplicates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yui-incremental-test-'));
  process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;
  process.env.CONFIG_PATH = join(dir, 'config.json');
  clearConfigCache();
  try {
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: process.env, stdio: 'pipe' });
    await new MigrationService().runMigrations();
    const channels = join(dir, 'channels'), liked = join(dir, 'liked');
    const config = await loadConfig();
    await writeFile(process.env.CONFIG_PATH, JSON.stringify({ ...config, libraries: [
      { name: 'Channels', path: channels, mediaType: 'channel_archive', skip: false },
      { name: 'Liked', path: liked, mediaType: 'liked_videos', skip: false },
    ], scanOptions: { ...config.scanOptions, generateThumbnails: false, fetchMetadata: false } }));
    clearConfigCache();

    const edited = await addVideo(join(channels, 'Chan'), 'aaaaaaaaaaa');
    const removed = await addVideo(join(channels, 'Chan'), 'bbbbbbbbbbb');
    await addVideo(join(channels, 'Chan'), 'ccccccccccc', { size: 100 });
    await addVideo(liked, 'ccccccccccc', { size: 50 }); // smaller copy of a channel video
    const scan = (mode: 'full' | 'incremental' = 'incremental') => new ScanOrchestrator().scan({ mode });
    const prisma = getPrismaClient();

    const first = await scan('full');
    assert.equal(first.videosAdded, 3);

    // Nothing changed: no rewrites, and the duplicate no longer flips between copies.
    const idle = await scan();
    assert.deepEqual([idle.videosScanned, idle.videosAdded, idle.videosUpdated, idle.videosRemoved], [4, 0, 0, 0]);
    assert.ok((await prisma.likedVideo.findUnique({ where: { videoId: 'ccccccccccc' } })), 'liked membership recorded');

    // Edited info.json (newer mtime) is re-read.
    const info = join(edited, `20200101 - Video aaaaaaaaaaa [aaaaaaaaaaa].info.json`);
    await writeFile(info, JSON.stringify({ id: 'aaaaaaaaaaa', title: 'Renamed', uploader: 'Chan', upload_date: '20200101', duration: 10 }));
    await utimes(info, new Date(), new Date(Date.now() + 5000));
    // New video, deleted video, and a bigger copy of the duplicate.
    await addVideo(join(channels, 'Chan'), 'ddddddddddd');
    await rm(removed, { recursive: true });
    await addVideo(liked, 'ccccccccccc', { size: 500 });

    const changed = await scan();
    assert.equal(changed.videosAdded, 1);
    assert.equal(changed.videosRemoved, 1);
    assert.equal(changed.videosUpdated, 2); // edited + bigger duplicate
    assert.equal((await prisma.video.findUniqueOrThrow({ where: { videoId: 'aaaaaaaaaaa' } })).title, 'Renamed');
    assert.match((await prisma.video.findUniqueOrThrow({ where: { videoId: 'ccccccccccc' } })).videoPath, /liked/);

    const settled = await scan();
    assert.deepEqual([settled.videosAdded, settled.videosUpdated], [0, 0]);
    // videosRemoved reports videos currently missing (cumulative), so check the row instead.
    assert.equal((await prisma.video.findUniqueOrThrow({ where: { videoId: 'bbbbbbbbbbb' } })).missingOnDisk, true);
    assert.equal(await prisma.video.count({ where: { missingOnDisk: false } }), 3);
  } finally {
    await disconnectDatabase();
    await rm(dir, { recursive: true, force: true });
  }
});
