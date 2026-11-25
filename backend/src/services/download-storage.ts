import { access, chmod, mkdir, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getConfigPath, loadConfig } from '../lib/config.js';
import { getPrismaClient } from '../lib/database.js';
import { DownloadError, type DownloadSnapshot } from './download-validation.js';
import { VIDEO_ID } from './liked-video-order-service.js';

export function stateDirectory(): string {
  return resolve(process.env.DOWNLOAD_STATE_DIR || join(dirname(getConfigPath()), '.downloads'));
}
export function inside(root: string, child: string): boolean {
  const rel = relative(root, child);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
export async function exists(file: string): Promise<boolean> {
  try { await stat(file); return true; } catch (e: any) { if (e.code === 'ENOENT') return false; throw e; }
}
export async function atomicWrite(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temp, 'wx', 0o600);
    try { await handle.writeFile(content, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {});
    throw error;
  }
  // Persist the directory entry as well as the content on supported filesystems.
  const dir = await open(dirname(file), 'r');
  try { await dir.sync(); } catch (e: any) { if (!['EINVAL', 'ENOTSUP'].includes(e.code)) throw e; }
  finally { await dir.close(); }
}
export function parseArchive(content: string) {
  const ids = new Set<string>(), invalid: number[] = [];
  content.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    const match = /^youtube ([A-Za-z0-9_-]{11})$/.exec(line.trim());
    if (match) ids.add(match[1]); else invalid.push(i + 1);
  });
  return { ids, invalid };
}
export function archiveText(ids: Iterable<string>): string {
  return [...new Set(ids)].sort().map(id => `youtube ${id}\n`).join('');
}
export async function readArchive(): Promise<Set<string>> {
  const file = join(stateDirectory(), 'archive.txt');
  if (!await exists(file)) return new Set();
  const parsed = parseArchive(await readFile(file, 'utf8'));
  if (parsed.invalid.length) throw new DownloadError('Runtime archive is invalid; restore a valid archive before downloading', 409);
  return parsed.ids;
}
export async function unionArchive(ids: Iterable<string>): Promise<void> {
  const union = await readArchive();
  for (const id of ids) { if (!VIDEO_ID.test(id)) throw new Error('Invalid archive ID'); union.add(id); }
  await atomicWrite(join(stateDirectory(), 'archive.txt'), archiveText(union));
}
export function runDirectory(id: string): string {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new DownloadError('Invalid run ID');
  return join(stateDirectory(), 'runs', id);
}
export async function destination(snapshot: Pick<DownloadSnapshot, 'libraryPath' | 'libraryType'>, writable = true): Promise<string> {
  const config = await loadConfig();
  const lib = config.libraries.find(l => resolve(l.path) === resolve(snapshot.libraryPath));
  if (!lib || lib.skip || lib.mediaType !== snapshot.libraryType) throw new DownloadError('Destination library is missing, skipped, or changed', 409);
  let root: string;
  try {
    root = await realpath(lib.path);
    if (!(await stat(root)).isDirectory()) throw new Error('Not a directory');
    await access(root, constants.R_OK | (writable ? constants.W_OK : 0));
  } catch { throw new DownloadError('Destination must be an existing, readable and writable library directory', 409); }
  return root;
}
export async function snapshotLibrary(libraryPath: string) {
  const lib = (await loadConfig()).libraries.find(l => resolve(l.path) === resolve(libraryPath));
  if (!lib) throw new DownloadError('Choose an existing configured library');
  await destination({ libraryPath: lib.path, libraryType: lib.mediaType });
  return lib;
}
export async function stagingDirectory(id: string, snapshot: DownloadSnapshot, create = false): Promise<{ root: string; stage: string }> {
  runDirectory(id); // Validate the server-generated ID before constructing any filesystem path.
  const root = await destination(snapshot);
  const parent = join(root, '.yui-staging'), stage = join(parent, id);
  if (await exists(parent) && await realpath(parent) !== parent) throw new DownloadError('Staging directory must not be a symlink', 409);
  if (create) await mkdir(parent, { mode: 0o700, recursive: true });
  if (await exists(stage) && await realpath(stage) !== stage) throw new DownloadError('Run staging directory must not be a symlink', 409);
  if (create) await mkdir(stage, { mode: 0o700, recursive: true });
  return { root, stage };
}
export async function prepareRun(id: string, snapshot: DownloadSnapshot): Promise<string> {
  const { stage } = await stagingDirectory(id, snapshot, true);
  await mkdir(runDirectory(id), { recursive: true, mode: 0o700 });
  const ids = await readArchive();
  const videos = await getPrismaClient().video.findMany({ select: { videoId: true, videoPath: true } });
  for (const video of videos) {
    try { if ((await stat(video.videoPath)).isFile()) ids.add(video.videoId); }
    catch (e: any) { if (e.code !== 'ENOENT') throw e; }
  }
  await atomicWrite(join(runDirectory(id), 'archive.txt'), archiveText(ids));
  return stage;
}

interface Receipt { id: string; filepath: string }
export async function readReceipts(id: string): Promise<Receipt[]> {
  const file = join(runDirectory(id), 'completed.jsonl');
  if (!await exists(file)) return [];
  const receipts: Receipt[] = [];
  // readline accepts an incomplete final line; require the final newline explicitly.
  const handle = await open(file, 'r');
  let terminated = false;
  try {
    const size = (await handle.stat()).size;
    if (size) { const b = Buffer.alloc(1); await handle.read(b, 0, 1, size - 1); terminated = b[0] === 10; }
  } finally { await handle.close(); }
  let pending: string | undefined;
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
    if (pending !== undefined) parse(pending);
    pending = line;
  }
  if (terminated && pending !== undefined) parse(pending);
  return receipts;
  function parse(line: string) {
    if (!line.trim()) return;
    if (line.length > 32_768 || receipts.length >= 100_000) throw new DownloadError('Completion receipt limit exceeded', 409);
    let item: unknown;
    try { item = JSON.parse(line); } catch { throw new DownloadError('Invalid completion receipt', 409); }
    const r = item as Receipt;
    if (!r || !VIDEO_ID.test(r.id) || typeof r.filepath !== 'string' || !isAbsolute(r.filepath)) throw new DownloadError('Invalid completion receipt', 409);
    receipts.push(r);
  }
}

async function validateMedia(file: string, id: string, folder: string): Promise<void> {
  if (!inside(folder, file) || await realpath(file) !== file || !(await stat(file)).isFile() || (await stat(file)).size === 0) {
    throw new DownloadError('Completed media is missing or unsafe', 409);
  }
  if (!['.mp4', '.mkv', '.webm', '.mov', '.m4v', '.avi'].includes(extname(file).toLowerCase()) || !basename(file).includes(`[${id}]`)) {
    throw new DownloadError('Completion receipt does not name finished video media', 409);
  }
  const infoPath = file.slice(0, -extname(file).length) + '.info.json';
  if (await realpath(infoPath) !== infoPath) throw new DownloadError('Unsafe info JSON path', 409);
  const info = JSON.parse(await readFile(infoPath, 'utf8'));
  if (info.id !== id) throw new DownloadError('Media and info JSON IDs do not agree', 409);
}

// Replayable: the original staged path determines its final path even after a rename.
export async function publishRun(id: string, snapshot: DownloadSnapshot, beforePublish: () => Promise<void>, onPublished?: (count: number) => Promise<void>): Promise<number> {
  const { root, stage } = await stagingDirectory(id, snapshot);
  const receipts = await readReceipts(id);
  const published = new Set<string>();
  for (const receipt of receipts) {
    const file = resolve(receipt.filepath), folder = dirname(file);
    if (!inside(stage, file) || !inside(stage, folder)) throw new DownloadError('Receipt escapes staging', 409);
    const rel = relative(stage, folder);
    const depth = snapshot.libraryType === 'channel_archive' ? 2 : 1;
    if (rel.split(sep).length !== depth || !basename(folder).includes(`[${receipt.id}]`)) throw new DownloadError('Unexpected completed folder layout', 409);
    const finalFolder = join(root, rel), finalFile = join(finalFolder, basename(file));
    if (await exists(finalFolder)) {
      if (await realpath(finalFolder) !== finalFolder) throw new DownloadError('Unsafe destination collision', 409);
      await validateMedia(finalFile, receipt.id, finalFolder);
      await beforePublish();
    } else {
      await validateMedia(file, receipt.id, folder);
      if (await realpath(folder) !== folder) throw new DownloadError('Unsafe staging folder', 409);
      await mkdir(dirname(finalFolder), { recursive: true });
      if (!inside(root, await realpath(dirname(finalFolder)))) {
        // A liked folder's parent is the root itself.
        if (await realpath(dirname(finalFolder)) !== root) throw new DownloadError('Destination escapes library', 409);
      }
      await beforePublish();
      await rename(folder, finalFolder);
    }
    published.add(receipt.id);
    await onPublished?.(published.size);
    // Commit each successful item so an error in a later item cannot lose its history.
    await unionArchive([receipt.id]);
  }
  return published.size;
}
export async function cleanupStaging(id: string, snapshot: DownloadSnapshot): Promise<void> {
  const { stage } = await stagingDirectory(id, snapshot);
  if (await exists(stage)) await rm(stage, { recursive: true });
}
export async function cookieStatus() {
  const file = join(stateDirectory(), 'cookies.txt');
  try { const s = await stat(file); return { present: true, modifiedAt: s.mtime.toISOString() }; }
  catch (e: any) { if (e.code === 'ENOENT') return { present: false, modifiedAt: null }; throw e; }
}
export async function writeCookies(content: string): Promise<void> {
  if (Buffer.byteLength(content) > 1024 * 1024 || !/^# (?:Netscape HTTP Cookie File|HTTP Cookie File)/.test(content)) throw new DownloadError('Upload a Netscape cookies file of at most 1 MiB');
  const lines = content.split(/\r?\n/).filter(l => l.trim() && (!l.startsWith('#') || l.startsWith('#HttpOnly_')));
  if (!lines.length || lines.some(l => l.split('\t').length !== 7)) throw new DownloadError('Invalid Netscape cookie records');
  await mkdir(stateDirectory(), { recursive: true, mode: 0o700 });
  await chmod(stateDirectory(), 0o700);
  await atomicWrite(join(stateDirectory(), 'cookies.txt'), content);
}
export async function deleteCookies(): Promise<void> { await rm(join(stateDirectory(), 'cookies.txt'), { force: true }); }
