import { Prisma, type DownloadRun, type DownloadSource } from '@prisma/client';
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getPrismaClient } from '../lib/database.js';
import { loadConfig } from '../lib/config.js';
import { scanState } from '../lib/scan-state.js';
import { beginScan } from './scan-service.js';
import { LikedVideoOrderService, VIDEO_ID } from './liked-video-order-service.js';
import { activeStatuses, DownloadError, normalizeYoutube, settingsSchema, validateSource, videoSchema,
  type DownloadSnapshot } from './download-validation.js';
import { atomicWrite, cleanupStaging, cookieStatus, destination, exists, prepareRun,
  publishRun, readReceipts, runDirectory, snapshotLibrary } from './download-storage.js';
import { downloadArgs, likedDiscoveryArgs, redact, runYtDlp } from './yt-dlp-runner.js';

const nowISO = () => new Date().toISOString();
const terminal = { notIn: activeStatuses };
export class DownloadService {
  private get db() { return getPrismaClient(); }
  private mutations: Promise<unknown> = Promise.resolve();
  private pumping: Promise<void> | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private stopped = true;
  private active: { id: string; controller: AbortController } | null = null;
  private queueTime = 0;
  private scanFirst = false;
  private progress = new Map<string, Record<string, unknown>>();
  waitingReason: string | null = null;
  /** Set when the downloader could not start; its API then reports 503 and the rest of the app is unaffected. */
  unavailableReason: string | null = null;

  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.mutations.then(action);
    this.mutations = operation.catch(() => {});
    return operation;
  }
  private queueTimestamp() {
    this.queueTime = Math.max(Date.now(), this.queueTime + 1);
    return new Date(this.queueTime).toISOString();
  }
  async settings() {
    return this.db.downloadSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  }
  async saveSettings(input: unknown) {
    const data = settingsSchema.parse(input);
    return this.exclusive(async () => {
      const old = await this.settings();
      const changed = old.scheduleEnabled !== data.scheduleEnabled || old.intervalHours !== data.intervalHours;
      return this.db.downloadSettings.update({ where: { id: 1 }, data: { ...data,
        nextRunAt: changed ? data.scheduleEnabled ? new Date(Date.now() + data.intervalHours * 3_600_000).toISOString() : null : old.nextRunAt } });
    });
  }
  async sources() {
    const sources = await this.db.downloadSource.findMany({ orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
    return Promise.all(sources.map(async source => ({ ...source,
      lastRun: await this.db.downloadRun.findFirst({ where: { sourceId: source.id }, orderBy: { createdAt: 'desc' } }) })));
  }
  async saveSource(input: unknown, id?: string) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DownloadError('Source settings must be an object');
    return this.exclusive(async () => {
      const old = id ? await this.db.downloadSource.findUnique({ where: { id } }) : null;
      if (id && !old) throw new DownloadError('Source not found', 404);
      const data = validateSource(id ? { ...oldInput(old!), ...(input as object) } : input);
      const lib = old && resolve(old.libraryPath) === resolve(data.libraryPath)
        ? (await loadConfig()).libraries.find(l => resolve(l.path) === resolve(data.libraryPath))
        : await snapshotLibrary(data.libraryPath);
      if (!lib) throw new DownloadError('Choose an existing configured library');
      data.libraryPath = lib.path;
      const duplicate = await this.db.downloadSource.findUnique({ where: { url: data.url } });
      if (duplicate && duplicate.id !== id) throw new DownloadError('This source already exists', 409);
      const source = await this.db.$transaction(async tx => {
        const source = id ? await tx.downloadSource.update({ where: { id }, data: { ...data, updatedAt: nowISO() } })
          : await tx.downloadSource.create({ data: { ...data, createdAt: nowISO(), updatedAt: nowISO() } });
        if (!data.enabled) await tx.downloadRun.updateMany({ where: { sourceId: source.id, status: 'queued' },
          data: { status: 'cancelled', endedAt: nowISO(), finalized: true } });
        return source;
      });
      return source;
    });
  }
  async removeSource(id: string) {
    return this.exclusive(async () => {
      if (!await this.db.downloadSource.findUnique({ where: { id } })) throw new DownloadError('Source not found', 404);
      const active = await this.db.downloadRun.findFirst({ where: { sourceId: id, status: { in: ['running', 'cancelling'] } } });
      if (active) throw new DownloadError('Cancel the active run before removing its source', 409);
      await this.db.$transaction(async tx => {
        await tx.downloadRun.updateMany({ where: { sourceId: id, status: 'queued' }, data: { status: 'cancelled', finalized: true, endedAt: nowISO() } });
        await tx.downloadSource.delete({ where: { id } });
      });
      return { ok: true };
    });
  }
  private async snapshot(source: DownloadSource): Promise<DownloadSnapshot> {
    const library = (await loadConfig()).libraries.find(l => resolve(l.path) === resolve(source.libraryPath));
    if (!library) throw new DownloadError('Source destination is no longer configured', 409);
    return { name: source.name, url: source.url, kind: source.kind as DownloadSnapshot['kind'],
      quality: source.quality as DownloadSnapshot['quality'], libraryPath: library.path,
      libraryType: library.mediaType, useCookies: source.useCookies, uploadedAfter: source.uploadedAfter };
  }
  private async enqueue(tx: Prisma.TransactionClient, snapshot: DownloadSnapshot, trigger: string, sourceId: string | null) {
    const videoKey = snapshot.kind === 'video' ? normalizeYoutube(snapshot.url).videoId! : null;
    const existing = await tx.downloadRun.findFirst({ where: {
      ...(sourceId ? { sourceId } : videoKey ? { videoKey } : { sourceId: null, snapshot: JSON.stringify(snapshot) }), status: { in: activeStatuses },
    } });
    if (existing) return { run: existing, created: false };
    const run = await tx.downloadRun.create({ data: { sourceId, videoKey, trigger, snapshot: JSON.stringify(snapshot), createdAt: this.queueTimestamp() } });
    return { run, created: true };
  }
  async enqueueSource(id: string) {
    const result = await this.exclusive(async () => {
      const source = await this.db.downloadSource.findUnique({ where: { id } });
      if (!source) throw new DownloadError('Source not found', 404);
      const snapshot = await this.snapshot(source);
      return this.db.$transaction(tx => this.enqueue(tx, snapshot, 'manual', id));
    });
    this.wake(); return result;
  }
  async enqueueAll() {
    const result = await this.exclusive(async () => {
      const sources = await this.db.downloadSource.findMany({ where: { enabled: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
      const snapshots = await Promise.all(sources.map(s => this.snapshot(s)));
      return this.db.$transaction(async tx => {
        const results = [];
        for (let i = 0; i < sources.length; i++) results.push(await this.enqueue(tx, snapshots[i], 'manual', sources[i].id));
        return results;
      });
    });
    this.wake(); return result;
  }
  async enqueueVideo(input: unknown) {
    const data = videoSchema.parse(input), normalized = normalizeYoutube(data.url);
    if (normalized.kind !== 'video') throw new DownloadError('One-off downloads require an individual video URL');
    const library = await snapshotLibrary(data.libraryPath);
    const snapshot: DownloadSnapshot = { ...data, url: normalized.url, name: normalized.videoId!, kind: 'video',
      libraryPath: library.path, libraryType: library.mediaType, uploadedAfter: null };
    const result = await this.exclusive(() => this.db.$transaction(tx => this.enqueue(tx, snapshot, 'manual', null)));
    this.wake(); return result;
  }
  async tick(now = Date.now()): Promise<void> {
    await this.exclusive(async () => {
      const settings = await this.settings();
      if (!settings.scheduleEnabled || !settings.nextRunAt || Date.parse(settings.nextRunAt) > now) return;
      const sources = await this.db.downloadSource.findMany({ where: { enabled: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
      const snapshots = await Promise.all(sources.map(s => this.snapshot(s)));
      await this.db.$transaction(async tx => {
        for (let i = 0; i < sources.length; i++) await this.enqueue(tx, snapshots[i], 'scheduled', sources[i].id);
        await tx.downloadSettings.update({ where: { id: 1 }, data: { nextRunAt: new Date(now + settings.intervalHours * 3_600_000).toISOString() } });
      });
    });
    this.wake();
  }
  async getRun(id: string) {
    const run = await this.db.downloadRun.findUnique({ where: { id } });
    if (!run) throw new DownloadError('Run not found', 404);
    return { ...run, settings: JSON.parse(run.snapshot) as DownloadSnapshot, progress: this.progress.get(id) ?? null };
  }
  async runs(page = 1, limit = 25) {
    const [rows, total, active, queuedCount] = await Promise.all([
      this.db.downloadRun.findMany({ skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }),
      this.db.downloadRun.count(),
      this.db.downloadRun.findFirst({ where: { status: { in: ['running', 'cancelling'] } } }),
      this.db.downloadRun.count({ where: { status: 'queued' } }),
    ]);
    return { runs: rows.map(run => ({ ...run, settings: JSON.parse(run.snapshot), progress: this.progress.get(run.id) ?? null })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }, waitingReason: this.waitingReason,
      activeRun: active ? { ...active, settings: JSON.parse(active.snapshot), progress: this.progress.get(active.id) ?? null } : null, queuedCount };
  }
  async cancel(id: string) {
    await this.exclusive(async () => {
      const run = await this.getRun(id);
      if (run.status === 'queued') await this.db.downloadRun.update({ where: { id }, data: { status: 'cancelled', finalized: true, endedAt: nowISO() } });
      else if (['running', 'cancelling'].includes(run.status)) {
        await this.db.downloadRun.update({ where: { id }, data: { status: 'cancelling' } });
        if (this.active?.id === id) this.active.controller.abort();
      }
    });
    return this.getRun(id);
  }
  async retry(id: string) {
    const old = await this.getRun(id);
    if (activeStatuses.includes(old.status)) throw new DownloadError('This run is still active', 409);
    if (!old.finalized) await this.finalize(old);
    await destination(old.settings);
    const result = await this.exclusive(() => this.db.$transaction(tx => this.enqueue(tx, old.settings, 'retry', old.sourceId)));
    this.wake(); return result;
  }
  async retryScan(id: string) {
    const run = await this.getRun(id);
    if (!run.finalized || !['pending', 'failed'].includes(run.scanStatus)) throw new DownloadError('This run has no retryable scan', 409);
    await this.db.downloadRun.update({ where: { id }, data: { scanStatus: 'pending', scanError: null } });
    this.scanFirst = true; this.wake(); return { ok: true };
  }
  async start(): Promise<void> {
    if (!this.stopped) return;
    await this.settings();
    await this.db.downloadRun.updateMany({ where: { status: { in: ['running', 'cancelling'] } },
      data: { status: 'interrupted', endedAt: nowISO(), error: 'Application stopped during this attempt' } });
    await this.db.downloadRun.updateMany({ where: { scanStatus: 'running' }, data: { scanStatus: 'pending' } });
    const unfinished = await this.db.downloadRun.findMany({ where: { finalized: false, status: terminal }, orderBy: { createdAt: 'asc' } });
    for (const run of unfinished) {
      try { await this.finalize(run); }
      catch (error) { await this.db.downloadRun.update({ where: { id: run.id }, data: { error: safeError(error) } }); }
    }
    this.stopped = false; this.scanFirst = true;
    this.timer = setInterval(() => { void this.tick().catch(() => { this.waitingReason = 'Could not update download schedule'; }); }, 60_000);
    this.timer.unref();
    // A bad source (e.g. its library was removed from config) must not block startup.
    await this.tick().catch(error => { this.waitingReason = `Could not update download schedule: ${safeError(error)}`; });
  }
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.active?.controller.abort();
    await this.pumping;
    await this.mutations;
  }
  private wake() {
    if (this.stopped || this.pumping) return;
    this.pumping = this.pump().catch(error => { this.waitingReason = safeError(error); })
      .finally(() => { this.pumping = null; });
  }
  // Useful for deterministic integration tests and orderly shutdown; not an HTTP endpoint.
  async idle() { await this.pumping; }
  /** True while the worker is processing the queue (downloading, publishing or handing off a scan). */
  get busy() { return this.pumping !== null; }
  private async pump(): Promise<void> {
    this.waitingReason = null;
    if (this.scanFirst) { this.scanFirst = false; await this.ingestPending(); }
    while (!this.stopped) {
      const unresolved = await this.db.downloadRun.findFirst({ where: { finalized: false, status: terminal } });
      if (unresolved) {
        await this.ingestPending();
        this.waitingReason = 'An interrupted publication needs recovery; retry that run before downloading'; return;
      }
      // No shared background-job lock: yt-dlp writes only to hidden staging (ignored by
      // scans) and publishing is an atomic folder rename, so other jobs keep running.
      const run = await this.exclusive(async () => {
        const next = await this.db.downloadRun.findFirst({ where: { status: 'queued' }, orderBy: { createdAt: 'asc' } });
        if (!next || this.stopped) return null;
        return this.db.downloadRun.update({ where: { id: next.id }, data: { status: 'running', startedAt: nowISO() } });
      });
      if (!run) break;
      const controller = new AbortController();
      this.active = { id: run.id, controller };
      try {
        if ((await this.db.downloadRun.findUniqueOrThrow({ where: { id: run.id } })).status === 'cancelling') controller.abort();
        await this.execute(run, controller.signal);
      } finally { this.active = null; }
    }
    if (!this.stopped) await this.ingestPending();
    await this.prune();
  }
  private async execute(run: DownloadRun, signal: AbortSignal) {
    const snapshot: DownloadSnapshot = JSON.parse(run.snapshot);
    let result: { exitCode: number | null; error: string | null } = { exitCode: null, error: null };
    try {
      const stage = await prepareRun(run.id, snapshot);
      if (snapshot.useCookies && !(await cookieStatus()).present) throw new DownloadError('Upload cookies before downloading this authenticated source', 409);
      if (signal.aborted) throw new Error('Attempt stopped before download');
      if (snapshot.kind === 'liked') {
        await this.db.downloadRun.update({ where: { id: run.id }, data: { phase: 'discovering' } });
        const ids: string[] = [];
        const discovery = await runYtDlp(likedDiscoveryArgs(snapshot), { signal, timeoutMs: 60 * 60_000,
          logFile: join(runDirectory(run.id), 'output.log'), onLine: line => {
            if (!line.startsWith('"')) return;
            const id = JSON.parse(line);
            if (typeof id === 'string' && VIDEO_ID.test(id)) ids.push(id);
            if (ids.length > 100_000) throw new Error('Liked playlist exceeds discovery limit');
          } });
        if (discovery.exitCode !== 0 || discovery.error || signal.aborted) throw new Error(discovery.error || 'Liked discovery did not complete');
        // YouTube LL is returned newest first. Keep its complete snapshot durably before applying.
        const oldestFirst = [...new Set(ids)].reverse();
        await atomicWrite(join(runDirectory(run.id), 'liked-snapshot.json'), JSON.stringify(oldestFirst));
        await new LikedVideoOrderService().applySnapshot(oldestFirst);
      }
      if (signal.aborted) throw new Error('Attempt stopped before download');
      await this.db.downloadRun.update({ where: { id: run.id }, data: { phase: 'downloading' } });
      result = await runYtDlp(downloadArgs(snapshot, run.id, stage), { signal,
        logFile: join(runDirectory(run.id), 'output.log'), onLine: line => {
          if (line.startsWith('YUI_ITEM:')) this.progress.set(run.id, { item: JSON.parse(line.slice(9)) });
          if (line.startsWith('YUI_PROGRESS:')) {
            const p = JSON.parse(line.slice(13));
            this.progress.set(run.id, { ...this.progress.get(run.id), downloadedBytes: numeric(p.downloaded_bytes),
              totalBytes: numeric(p.total_bytes ?? p.total_bytes_estimate), speed: numeric(p.speed), eta: numeric(p.eta) });
          }
        } });
    } catch (error) { result.error = safeError(error); }
    try { await this.finalize(run); }
    catch (error) { result.error = safeError(error); }
    const current = await this.db.downloadRun.findUniqueOrThrow({ where: { id: run.id } });
    const cancelled = current.status === 'cancelling';
    const status = this.stopped ? 'interrupted' : cancelled ? 'cancelled'
      : result.error || result.exitCode !== 0 ? current.publishedCount ? 'partial' : 'failed' : 'succeeded';
    await this.db.downloadRun.update({ where: { id: run.id }, data: { status, phase: 'finalizing',
      exitCode: result.exitCode, error: result.error, endedAt: nowISO() } });
    this.progress.delete(run.id);
  }
  private async finalize(run: DownloadRun): Promise<void> {
    const snapshot: DownloadSnapshot = JSON.parse(run.snapshot);
    await this.db.downloadRun.update({ where: { id: run.id }, data: { phase: 'finalizing' } });
    // Discovery was complete before this file was atomically committed. Replay is idempotent.
    const likedFile = join(runDirectory(run.id), 'liked-snapshot.json');
    if (snapshot.kind === 'liked' && await exists(likedFile)) {
      await new LikedVideoOrderService().applySnapshot(JSON.parse(await readFile(likedFile, 'utf8')));
    }
    if (!(await readReceipts(run.id)).length) {
      if (run.publishedCount) throw new Error('Published run is missing its completion receipts');
      await this.db.downloadRun.update({ where: { id: run.id }, data: { finalized: true } });
      try { await cleanupStaging(run.id, snapshot); } catch { /* No successful output depends on this staging directory. */ }
      return;
    }
    const count = await publishRun(run.id, snapshot,
      async () => { await this.db.downloadRun.update({ where: { id: run.id }, data: { scanStatus: 'pending' } }); },
      async publishedCount => { await this.db.downloadRun.update({ where: { id: run.id }, data: { publishedCount } }); });
    await this.db.downloadRun.update({ where: { id: run.id }, data: { finalized: true, publishedCount: count } });
    await cleanupStaging(run.id, snapshot);
  }
  private async ingestPending(): Promise<void> {
    const runs = await this.db.downloadRun.findMany({ where: { scanStatus: 'pending', status: terminal,
      OR: [{ finalized: true }, { publishedCount: { gt: 0 } }] } });
    const groups = new Map<string, DownloadRun[]>();
    for (const run of runs) {
      const snapshot: DownloadSnapshot = JSON.parse(run.snapshot);
      groups.set(snapshot.libraryPath, [...(groups.get(snapshot.libraryPath) ?? []), run]);
    }
    for (const [libraryPath, batch] of groups) {
      if (this.stopped) return;
      try { await destination(JSON.parse(batch[0].snapshot), false); }
      catch (error) {
        await this.db.downloadRun.updateMany({ where: { id: { in: batch.map(r => r.id) } }, data: { scanError: safeError(error) } });
        continue;
      }
      const completion = beginScan({ libraryPath, mode: 'incremental' });
      if (!completion) { this.waitingReason = 'Waiting to scan completed downloads'; return; }
      // Handle rejection immediately, including while the durable handoff update awaits SQLite.
      const outcome = completion.then(result => result.errors, error => [safeError(error)]);
      const ids = batch.map(r => r.id);
      try {
        await this.db.downloadRun.updateMany({ where: { id: { in: ids } }, data: { scanStatus: 'running', scanError: null } });
        const errors = await outcome;
        await this.db.downloadRun.updateMany({ where: { id: { in: ids } }, data: {
          scanStatus: errors.length ? 'failed' : 'complete', scanError: errors.length ? redact(errors.join('\n')).slice(0, 4000) : null,
          scanId: scanState.getState().scanId ?? null,
        } });
      } catch (error) {
        await outcome;
        await this.db.downloadRun.updateMany({ where: { id: { in: ids } }, data: { scanStatus: 'failed', scanError: safeError(error) } });
      }
    }
  }
  private async prune() {
    const old = await this.db.downloadRun.findMany({ where: { finalized: true, status: terminal, scanStatus: { in: ['complete', 'not_needed'] } },
      orderBy: { createdAt: 'desc' }, skip: 100 });
    for (const run of old) {
      await rm(runDirectory(run.id), { recursive: true, force: true });
      await this.db.downloadRun.delete({ where: { id: run.id } });
    }
  }
  async assertLibraryChanges(libraries: { path: string; skip: boolean; mediaType: string }[]) {
    const sources = await this.db.downloadSource.findMany();
    const runs = await this.db.downloadRun.findMany({ where: { OR: [
      { status: { in: activeStatuses } }, { scanStatus: { in: ['pending', 'running', 'failed'] } }, { finalized: false },
    ] } });
    const needed = [...sources.map(s => ({ libraryPath: s.libraryPath })), ...runs.map(r => ({ ...JSON.parse(r.snapshot) as DownloadSnapshot, status: r.status }))];
    for (const reference of needed) {
      const next = libraries.find(l => resolve(l.path) === resolve(reference.libraryPath));
      if (!next) throw new DownloadError('Move/remove download source references and resolve pending runs before removing this library', 409);
      if ('libraryType' in reference && next.mediaType !== reference.libraryType) throw new DownloadError('Cannot change a library type while downloads reference it', 409);
      if ('status' in reference && typeof reference.status === 'string' && ['running', 'cancelling'].includes(reference.status) && next.skip) throw new DownloadError('Wait for the active download before skipping its library', 409);
    }
  }
}
function oldInput(source: DownloadSource) {
  const { name, url, kind, quality, libraryPath, enabled, useCookies, uploadedAfter, position } = source;
  return { name, url, kind, quality, libraryPath, enabled, useCookies, uploadedAfter, position };
}
function safeError(error: unknown): string { return redact(error instanceof Error ? error.message : String(error)).slice(0, 4000); }
function numeric(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
// DOWNLOADS_ENABLED=false turns the downloader off entirely: no worker, no schedule, API returns 503.
export function downloadsEnabled(): boolean { return process.env.DOWNLOADS_ENABLED !== 'false'; }
export const downloadService = new DownloadService();
