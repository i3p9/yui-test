import { z } from 'zod';
import { getPrismaClient } from '../lib/database.js';
import { DownloadError, normalizeYoutube, qualitySchema, validateSource, type SourceInput } from './download-validation.js';
import { parseArchive, snapshotLibrary, unionArchive } from './download-storage.js';

const importSchema = z.object({
  groups: z.array(z.object({ content: z.string().max(2_000_000), quality: qualitySchema,
    libraryPath: z.string(), useCookies: z.boolean().default(false) }).strict()).max(100).default([]),
  liked: z.object({ libraryPath: z.string(), quality: qualitySchema.default('best') }).strict().optional(),
  archive: z.string().max(8_000_000).default(''),
}).strict();

async function prepare(input: unknown) {
  const data = importSchema.parse(input), sources: SourceInput[] = [], conflicts: string[] = [];
  const seen = new Map<string, SourceInput>();
  const db = getPrismaClient();
  let skipped = 0;
  const current = await db.downloadSource.findMany();
  const add = (source: SourceInput) => {
    const existing = seen.get(source.url) ?? current.find(s => s.url === source.url);
    if (existing) {
      if (existing.quality !== source.quality || existing.libraryPath !== source.libraryPath || existing.useCookies !== source.useCookies) {
        conflicts.push(`${source.url}: different quality, destination, or cookie setting. Edit the source/list before importing.`);
      } else skipped++;
      return;
    }
    seen.set(source.url, source); sources.push(source);
  };
  const maxPosition = current.reduce((max, s) => Math.max(max, s.position + 1), 0);
  for (const group of data.groups) {
    const lib = await snapshotLibrary(group.libraryPath);
    for (const line of group.content.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'))) {
      try {
        const normalized = normalizeYoutube(line);
        if (!['channel', 'playlist'].includes(normalized.kind)) throw new Error('Use the Liked source control or one-off form for this URL');
        add(validateSource({ name: normalized.url, url: normalized.url, kind: normalized.kind,
          quality: group.quality, libraryPath: lib.path, useCookies: group.useCookies,
          position: maxPosition + sources.length }));
      } catch (error) { conflicts.push(`${line.slice(0, 200)}: ${error instanceof Error ? error.message : 'Invalid URL'}`); }
    }
  }
  if (data.liked) {
    const lib = await snapshotLibrary(data.liked.libraryPath);
    add(validateSource({ name: 'Liked Videos', url: 'https://www.youtube.com/playlist?list=LL', kind: 'liked',
      quality: data.liked.quality, libraryPath: lib.path, useCookies: true, position: maxPosition + sources.length }));
  }
  const archive = parseArchive(data.archive);
  return { sources, conflicts, skipped, archive };
}
export async function previewImport(input: unknown) {
  const result = await prepare(input);
  return { sources: result.sources, conflicts: result.conflicts, skipped: result.skipped,
    archive: { validCount: result.archive.ids.size, invalidLines: result.archive.invalid } };
}
export async function applyImport(input: unknown) {
  const prepared = await prepare(input);
  if (prepared.conflicts.length || prepared.archive.invalid.length) throw new DownloadError('Resolve import conflicts and invalid archive lines before applying');
  // File first: retrying a failed DB transaction unions the same history safely.
  await unionArchive(prepared.archive.ids);
  await getPrismaClient().$transaction(async tx => {
    for (const source of prepared.sources) {
      await tx.downloadSource.create({ data: { ...source, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
    }
  }, { timeout: 60_000 });
  return { imported: prepared.sources.length, skipped: prepared.skipped, archiveEntries: prepared.archive.ids.size, invalid: 0 };
}
