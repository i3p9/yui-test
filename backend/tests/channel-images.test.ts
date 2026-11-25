// Channel image downloads run two at a time and still store every image.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { clearConfigCache, loadConfig } from '../src/lib/config.js';
import { disconnectDatabase, getPrismaClient } from '../src/lib/database.js';
import { MigrationService } from '../src/services/migration-service.js';
import { ChannelImageDownloader } from '../src/services/channel-image-downloader.js';

test('channel images download two at a time and are stored per channel', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yui-channel-images-test-'));
  process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;
  process.env.CONFIG_PATH = join(dir, 'config.json');
  process.env.YTDLP_PATH = resolve('tests/fixtures/fake-channel-yt-dlp.mjs');
  process.env.FAKE_CHANNEL_LOG = join(dir, 'runs.log');
  clearConfigCache();
  try {
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: process.env, stdio: 'pipe' });
    await new MigrationService().runMigrations();
    await writeFile(process.env.CONFIG_PATH, JSON.stringify({ ...(await loadConfig()), libraries: [], thumbnailDir: join(dir, 'thumbs') }));
    clearConfigCache();
    const prisma = getPrismaClient();
    const ids = Array.from({ length: 5 }, (_, i) => `UC${String(i).padStart(22, '0')}`);
    for (const id of ids) await prisma.channel.create({ data: { uploaderId: id, name: id, videoCount: 5, lastScannedAt: new Date().toISOString() } });
    await prisma.channel.create({ data: { uploaderId: 'UC_small_channel_000000', name: 'small', videoCount: 1, lastScannedAt: new Date().toISOString() } });

    await new ChannelImageDownloader().downloadMissingImages();

    const stored = await prisma.channel.findMany({ where: { uploaderId: { in: ids } } });
    assert.ok(stored.every(c => c.avatarPath?.endsWith('avatar.jpg') && c.bannerPath?.endsWith('banner.jpg')));
    assert.equal((await prisma.channel.findUniqueOrThrow({ where: { uploaderId: 'UC_small_channel_000000' } })).avatarPath, null, 'below the 5-video default');

    // Replay the start/end log to find the most runs in flight at once.
    let live = 0, peak = 0;
    const events = (await readFile(process.env.FAKE_CHANNEL_LOG, 'utf8')).trim().split('\n').map(l => l.split(' '))
      .sort((a, b) => Number(a[1]) - Number(b[1]) || (a[0] === 'end' ? -1 : 1));
    for (const [kind] of events) { live += kind === 'start' ? 1 : -1; peak = Math.max(peak, live); }
    assert.equal(events.length, 10);
    assert.equal(peak, 2);
  } finally {
    await disconnectDatabase();
    await rm(dir, { recursive: true, force: true });
  }
});
