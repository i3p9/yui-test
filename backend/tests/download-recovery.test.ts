import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

// Real process exits at distinct publication boundaries; a new worker replays the same disk/DB state.
for (const point of ['receipt', 'pending', 'rename', 'archive', 'finalized', 'scan-running']) {
  test(`process restart recovers the ${point} checkpoint without duplicate files or archive loss`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'yui-recovery-'));
    const env = { ...process.env, YUI_TEST_ROOT: root, DATABASE_URL: `file:${join(root, 'test.db')}`,
      CONFIG_PATH: join(root, 'config.json'), DOWNLOAD_STATE_DIR: join(root, '.downloads'),
      YTDLP_PATH: resolve('tests/fixtures/fake-yt-dlp.mjs'), FAKE_YTDLP_MODE: 'success' };
    try {
      await mkdir(join(root, 'library'));
      await writeFile(env.CONFIG_PATH, JSON.stringify({ libraries: [{ path: join(root, 'library'), name: 'Recovery', mediaType: 'channel_archive', skip: false }],
        databaseUrl: env.DATABASE_URL, thumbnailDir: join(root, 'thumbs'), metadataDir: join(root, 'metadata'),
        scanOptions: { parallelism: 1, followSymlinks: false, generateThumbnails: false, thumbnailConcurrency: 1, fetchMetadata: false, metadataConcurrency: 1 } }));
      execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env, stdio: 'pipe' });
      const crashed = spawnSync(process.execPath, ['--import', 'tsx', 'tests/fixtures/download-recovery-harness.ts', 'prepare', point], { env, encoding: 'utf8', timeout: 15000 });
      assert.equal(crashed.status, 91, crashed.stderr || crashed.stdout);
      for (let replay = 0; replay < 2; replay++) {
        const recovered = spawnSync(process.execPath, ['--import', 'tsx', 'tests/fixtures/download-recovery-harness.ts', 'recover'], { env, encoding: 'utf8', timeout: 15000 });
        assert.equal(recovered.status, 0, recovered.stderr || recovered.stdout);
        const result = JSON.parse(recovered.stdout.split('YUI_RESULT:')[1].trim());
        assert.deepEqual(result.archive, ['aaaaaaaaaaa']); assert.equal(result.count, 1);
        assert.equal(result.status, 'interrupted'); assert.equal(result.finalized, true);
        assert.equal(result.scanStatus, 'complete'); assert.equal(result.publishedCount, 1);
        assert.ok(!result.videoPath.includes('.yui-staging'));
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

test('real legacy SQL migration chain backfills likes and preserves playback records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yui-migration-'));
  try {
    const script = `
import sqlite3, pathlib, sys, json
conn = sqlite3.connect(sys.argv[1])
paths = sorted(pathlib.Path(sys.argv[2]).glob('*/migration.sql'))
for path in paths[:-1]: conn.executescript(path.read_text())
for vid, kind, rank in [('aaaaaaaaaaa', 'liked_videos', 7), ('bbbbbbbbbbb', 'channel_archive', 3), ('ccccccccccc', 'channel_archive', None), ('ddddddddddd', 'liked_videos', None)]:
 conn.execute("INSERT INTO video (video_id,title,media_type,library_path,video_path,metadata_source,first_seen_at,last_scanned_at,liked_order) VALUES (?,?,?,?,?,?,?,?,?)", (vid,'Old video',kind,'/old','/old/'+vid+'.mp4','info_json','2020','2020',rank))
conn.execute("INSERT INTO watch_progress (video_id,position_seconds,last_watched_at) VALUES ('aaaaaaaaaaa',42,'2020')")
conn.commit()
conn.executescript(paths[-1].read_text())
print(json.dumps({'likes': conn.execute('SELECT video_id,liked_order FROM liked_video ORDER BY video_id').fetchall(), 'path': conn.execute("SELECT video_path FROM video WHERE video_id='aaaaaaaaaaa'").fetchone()[0], 'position':conn.execute('SELECT position_seconds FROM watch_progress').fetchone()[0], 'enabled':conn.execute('SELECT scheduleEnabled FROM download_settings').fetchone()[0]}))
`;
    const result = JSON.parse(execFileSync('python3', ['-c', script, join(root, 'old.db'), resolve('prisma/migrations')], { encoding: 'utf8' }));
    assert.deepEqual(result.likes, [['aaaaaaaaaaa', 7], ['bbbbbbbbbbb', 3], ['ddddddddddd', null]]);
    assert.equal(result.position, 42); assert.equal(result.path, '/old/aaaaaaaaaaa.mp4'); assert.equal(result.enabled, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
