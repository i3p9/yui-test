#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
const args = process.argv.slice(2), value = key => args[args.indexOf(key) + 1];
const mode = process.env.FAKE_YTDLP_MODE || 'success';
if (args.includes('--version')) { console.log('2026.08.19-test'); process.exit(0); }
if (args.includes('--verbose') && !args.includes('-o')) { console.error('[debug] Optional libraries: yt_dlp_ejs-0.8.0'); process.exit(2); }
if (args.includes('--flat-playlist')) {
  for (const id of JSON.parse(process.env.FAKE_LIKES || '["bbbbbbbbbbb","aaaaaaaaaaa"]')) console.log(JSON.stringify(id));
  if (process.env.FAKE_LIKES_FAIL === '1') { console.error('Authentication failed'); process.exit(1); }
  process.exit(0);
}
if (mode === 'hang') {
  const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'], { stdio: 'ignore' });
  if (process.env.FAKE_PID_FILE) writeFileSync(process.env.FAKE_PID_FILE, JSON.stringify({ parent: process.pid, child: child.pid }));
  setInterval(() => {}, 1000);
} else {
  if (mode === 'fail') { console.error('Download failed https://example.test/media?secret=hidden'); process.exit(1); }
  if (mode === 'empty') process.exit(0);
  const archive = value('--download-archive'), template = value('-o');
  const receipts = args[args.indexOf('--print-to-file') + 2];
  const archived = existsSync(archive) ? readFileSync(archive, 'utf8') : '';
  const url = new URL(args.at(-1));
  const ids = process.env.FAKE_IDS ? JSON.parse(process.env.FAKE_IDS) : [url.searchParams.get('v') || 'aaaaaaaaaaa'];
  for (const id of ids) {
    if (archived.includes(`youtube ${id}\n`)) continue;
    const file = template.replaceAll('%(channel)s', 'Test Channel').replaceAll('%(upload_date)s', '20200102')
      .replaceAll('%(title)s', 'Test video').replaceAll('%(id)s', id).replaceAll('%(ext)s', 'mp4').replaceAll('%%', '%');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, 'fake completed video');
    if (mode !== 'missing-info') writeFileSync(file.replace(/\.mp4$/, '.info.json'), JSON.stringify({
      id, title: 'Test video', uploader: 'Test Channel', channel: 'Test Channel', channel_id: 'UC_TEST_CHANNEL',
      upload_date: '20200102', duration: 10, width: 1280, height: 720, vcodec: 'avc1', acodec: 'aac', ext: 'mp4', description: 'Test description',
    }));
    writeFileSync(file.replace(/\.mp4$/, '.description'), 'Test description');
    writeFileSync(file.replace(/\.mp4$/, '.en.vtt'), 'WEBVTT\n');
    appendFileSync(receipts, JSON.stringify({ id, filepath: file }) + '\n');
    appendFileSync(archive, `youtube ${id}\n`);
    process.stdout.write('YUI_ITEM:' + JSON.stringify(id) + '\n');
    if (mode === 'split') {
      const text = Buffer.from('Test café\nYUI_PROGRESS:{"downloaded_bytes":10,"total_bytes":20,"speed":5,"eta":2}\n');
      for (const byte of text) process.stdout.write(Buffer.from([byte]));
    }
  }
  if (mode === 'truncated') appendFileSync(receipts, '{"id":"unfinished');
  if (mode === 'noisy') {
    for (let i = 0; i < 800; i++) process.stdout.write('x'.repeat(16300) + '\n');
  }
  if (mode === 'partial') { console.error('Second item failed'); process.exit(1); }
}
