import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { appendFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runDirectory, stateDirectory } from './download-storage.js';
import type { DownloadSnapshot } from './download-validation.js';

export const LOG_LIMIT = 10 * 1024 * 1024;
export function redact(line: string): string {
  return line.replace(/https?:\/\/[^\s"<>]+/gi, value => value.replace(/^(https?:\/\/)[^/]+@/i, '$1[redacted]@').replace(/\?.*$/, '?[redacted]'))
    .replace(/((?:cookie|authorization|set-cookie)\s*[:=]\s*).*/gi, '$1[redacted]')
    .replace(/\x1b\[[0-9;]*m/g, '');
}
export function commonYtDlpArgs(): string[] {
  return ['--ignore-config', '--no-colors', '--js-runtimes', `node:${process.execPath}`,
    '--socket-timeout', '30', '--retries', '3', '--fragment-retries', '3'];
}
export function downloadArgs(snapshot: DownloadSnapshot, id: string, stage: string): string[] {
  const layout = snapshot.libraryType === 'liked_videos'
    ? '%(channel)s - %(upload_date)s %(title)s [%(id)s]/%(upload_date)s  %(title)s [%(id)s].%(ext)s'
    : '%(channel)s/%(upload_date)s - %(title)s [%(id)s]/%(upload_date)s - %(title)s [%(id)s].%(ext)s';
  const args = ['--no-simulate', '--no-overwrites', '--write-thumbnail', '--write-info-json',
    '--write-description', '--write-subs', '--sub-langs', 'en.*', '--newline', '--progress',
    '--progress-template', 'download:YUI_PROGRESS:{"downloaded_bytes":%(progress.downloaded_bytes|null)j,"total_bytes":%(progress.total_bytes|null)j,"total_bytes_estimate":%(progress.total_bytes_estimate|null)j,"speed":%(progress.speed|null)j,"eta":%(progress.eta|null)j}',
    '--print', 'before_dl:YUI_ITEM:%(id)j',
    '--print-to-file', 'after_move:{"id":%(id)j,"filepath":%(filepath)j}', join(runDirectory(id), 'completed.jsonl'),
    '--download-archive', join(runDirectory(id), 'archive.txt'),
    '-o', join(stage.replaceAll('%', '%%'), layout)];
  if (snapshot.kind === 'video') args.push('--no-playlist');
  if (snapshot.quality !== 'best') {
    const cap = snapshot.quality === '720p' ? 720 : 1080;
    args.push('-f', `bv[height<=${cap}]+ba/b[height<=${cap}]`);
  }
  let filter = 'live_status != is_live & live_status != is_upcoming';
  if (snapshot.uploadedAfter) {
    args.push('--dateafter', snapshot.uploadedAfter.replaceAll('-', ''));
    filter += ` & upload_date >= ${snapshot.uploadedAfter.replaceAll('-', '')}`;
  }
  args.push('--match-filters', filter);
  if (snapshot.useCookies) args.push('--cookies', join(stateDirectory(), 'cookies.txt'));
  return [...args, '--', snapshot.url];
}
export function likedDiscoveryArgs(snapshot: DownloadSnapshot): string[] {
  return ['--flat-playlist', '--skip-download', '--print', '%(id)j', '--cookies', join(stateDirectory(), 'cookies.txt'), '--', snapshot.url];
}

export interface ProcessResult { exitCode: number | null; signal: string | null; error: string | null }
interface RunnerOptions {
  cwd?: string; signal?: AbortSignal; logFile?: string; onLine?: (line: string) => void;
  timeoutMs?: number;
}
// The sole yt-dlp launch path; no shell or arbitrary client flags.
export async function runYtDlp(args: string[], options: RunnerOptions = {}): Promise<ProcessResult> {
  return new Promise(resolve => {
    let child: ReturnType<typeof spawn>;
    let errorTail = '', settled = false, aborted = false, timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let size = 0;
    if (options.logFile) { try { size = statSync(options.logFile).size; } catch { /* new log */ } }
    function log(line: string) {
      const safe = redact(line).slice(0, 16_384);
      errorTail = (errorTail + '\n' + safe).slice(-4000);
      if (options.logFile && size < LOG_LIMIT) {
        const text = Buffer.from(safe + '\n').subarray(0, LOG_LIMIT - size);
        try { appendFileSync(options.logFile, text, { mode: 0o600 }); size += text.length; }
        catch { errorTail = 'Could not write download log'; abort(); }
      }
      try { options.onLine?.(line); } catch { errorTail = 'Invalid machine-readable yt-dlp output'; abort(); }
    }
    function groupSignal(signal: NodeJS.Signals) {
      if (!child?.pid) return;
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal); }
      catch (e: any) { if (e.code !== 'ESRCH') errorTail = 'Could not stop yt-dlp process group'; }
    }
    function abort() {
      if (aborted) return;
      aborted = true;
      groupSignal('SIGTERM');
      // Keep this timer even if the parent exits: ffmpeg descendants may ignore TERM.
      killTimer = setTimeout(() => groupSignal('SIGKILL'), 3000);
    }
    try {
      child = spawn(process.env.YTDLP_PATH || 'yt-dlp', [...commonYtDlpArgs(), ...args], {
        cwd: options.cwd, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch { resolve({ exitCode: null, signal: null, error: 'Could not launch yt-dlp; check tool setup' }); return; }
    const timer = setTimeout(() => { timedOut = true; abort(); }, options.timeoutMs ?? 24 * 60 * 60 * 1000);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    for (const stream of [child.stdout, child.stderr]) {
      const decoder = new StringDecoder('utf8');
      let buffer = '', dropping = false;
      const consume = (text: string) => {
        for (const piece of text.split(/(?<=\n)/)) {
          if (!dropping) buffer += piece;
          if (buffer.length > 16_384) { buffer = buffer.slice(0, 16_384); dropping = true; }
          if (piece.endsWith('\n')) { log(buffer.trimEnd()); buffer = ''; dropping = false; }
        }
      };
      stream!.on('data', chunk => consume(decoder.write(chunk)));
      stream!.on('end', () => { consume(decoder.end()); if (buffer) log(buffer); });
    }
    child.once('error', () => { errorTail = 'Could not launch yt-dlp; check executable and runtime setup'; });
    child.once('close', async (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      if (aborted) {
        // Allow a short TERM grace period then reap any remaining group members.
        await new Promise(done => setTimeout(done, 3100));
        groupSignal('SIGKILL');
      } else groupSignal('SIGKILL');
      if (killTimer) clearTimeout(killTimer);
      resolve({ exitCode: code, signal, error: timedOut ? 'yt-dlp exceeded its execution time limit'
        : code === 0 && !aborted ? null : errorTail.trim() || 'yt-dlp stopped before completion' });
    });
  });
}

export async function toolStatus() {
  let ytVersion = '';
  const result = await runYtDlp(['--version'], { timeoutMs: 10_000, onLine: line => { ytVersion = line.slice(0, 100); } });
  let ejs: string | null = null;
  // Initialization reports installed optional libraries without making a network request.
  // The missing-URL exit is expected; only its diagnostic version field is used.
  if (result.exitCode === 0) await runYtDlp(['--verbose', '--simulate'], { timeoutMs: 10_000, onLine: line => {
    if (line.startsWith('[debug] Optional libraries:')) ejs = /yt_dlp_ejs-([^,\s]+)/.exec(line)?.[1] ?? null;
  } });
  const ffmpeg = await new Promise<string | null>(resolve => {
    const child = spawn('ffmpeg', ['-version'], { shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    let line = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.stdout.on('data', chunk => { line = (line + chunk).slice(0, 200); });
    child.once('error', () => {});
    child.once('close', code => { clearTimeout(timer); resolve(code === 0 ? line.split('\n')[0] : null); });
  });
  return { node: process.version, ytDlp: result.exitCode === 0 ? ytVersion : null, ejs, ffmpeg,
    ready: result.exitCode === 0 && !!ffmpeg && !!ejs && Number(process.versions.node.split('.')[0]) >= 22 };
}
