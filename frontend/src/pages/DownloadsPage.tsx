import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLibraries } from '../lib/api';
import { downloads, type DownloadRun, type DownloadSettings, type DownloadSource, type ImportInput,
  type ImportPreview, type Quality, type RunsResponse, type SourceInput } from '../lib/download-api';
import type { Library } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button, Checkbox, Collapsible, Drawer, ErrorBanner, Field, Input, Page, PageHeader, Section, Select,
  StatusBadge, label } from '../components/ui';

const activeStatuses = ['queued', 'running', 'cancelling'];
const formatDate = (value: string | null) => value
  ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const bytes = (n?: number | null) => n == null ? '?' : `${(n / 1024 / 1024).toFixed(1)} MB`;
const kindLabel = { channel: 'Channel', playlist: 'Playlist', liked: 'Liked' } as const;
const tone = (status: string) => ({
  running: 'active', cancelling: 'active', succeeded: 'success', partial: 'warning', failed: 'error',
} as const)[status] ?? 'neutral';
const hint = 'text-xs text-zinc-500';

function QualitySelect({ value, onChange, label = 'Quality' }: { value: Quality; onChange: (q: Quality) => void; label?: string }) {
  return <Field label={label}><Select value={value} onChange={e => onChange(e.target.value as Quality)}>
    <option value="720p">Up to 720p</option><option value="1080p">Up to 1080p</option><option value="best">Best available</option>
  </Select></Field>;
}
function Destination({ libraries, value, onChange, label = 'Destination library' }: { libraries: Library[]; value: string; onChange: (path: string) => void; label?: string }) {
  return <Field label={label}><Select required value={value} onChange={e => onChange(e.target.value)}>
    <option value="">Choose a library</option>{libraries.filter(l => !l.skip).map(l => <option key={l.path} value={l.path}>{l.name} · {l.path}</option>)}
  </Select></Field>;
}
function SourceForm({ initial, libraries, busy, onSave, onCancel }: {
  initial?: DownloadSource; libraries: Library[]; busy: boolean;
  onSave: (input: SourceInput, id?: string) => Promise<boolean>; onCancel: () => void;
}) {
  const [form, setForm] = useState<SourceInput>(initial ? {
    name: initial.name, url: initial.url, kind: initial.kind, quality: initial.quality, libraryPath: initial.libraryPath,
    enabled: initial.enabled, useCookies: initial.useCookies, uploadedAfter: initial.uploadedAfter, position: initial.position,
  } : { name: '', url: '', kind: 'channel', quality: '1080p', libraryPath: libraries.find(l => !l.skip)?.path ?? '', enabled: true, useCookies: false, uploadedAfter: null, position: 0 });
  const [dateFilter, setDateFilter] = useState(!!initial?.uploadedAfter);
  const field = <K extends keyof SourceInput>(key: K, value: SourceInput[K]) => setForm(old => ({ ...old, [key]: value }));
  return <form className="space-y-3" onSubmit={async e => {
    e.preventDefault();
    if (await onSave({ ...form, uploadedAfter: dateFilter && form.kind !== 'liked' ? form.uploadedAfter : null }, initial?.id)) onCancel();
  }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name"><Input autoFocus required maxLength={200} value={form.name} onChange={e => field('name', e.target.value)} /></Field>
      <Field label="Source type"><Select value={form.kind} onChange={e => {
        const kind = e.target.value as SourceInput['kind'];
        setForm(old => ({ ...old, kind, url: kind === 'liked' ? 'https://www.youtube.com/playlist?list=LL' : old.kind === 'liked' ? '' : old.url,
          useCookies: kind === 'liked' || old.useCookies, uploadedAfter: kind === 'liked' ? null : old.uploadedAfter }));
      }}><option value="channel">Channel videos</option><option value="playlist">Playlist</option><option value="liked">My Liked Videos</option></Select></Field>
    </div>
    <Field label="YouTube URL"><Input required type="url" readOnly={form.kind === 'liked'} value={form.url} onChange={e => field('url', e.target.value)} /></Field>
    <div className="grid gap-3 sm:grid-cols-2"><QualitySelect value={form.quality} onChange={q => field('quality', q)} />
      <Destination libraries={libraries} value={form.libraryPath} onChange={v => field('libraryPath', v)} /></div>
    {form.kind !== 'liked' && <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Download history"><Select value={dateFilter ? 'date' : 'all'} onChange={e => setDateFilter(e.target.value === 'date')}>
        <option value="all">All available videos</option><option value="date">Uploaded on or after a date</option></Select></Field>
      {dateFilter && <Field label="Upload date"><Input required type="date" value={form.uploadedAfter ?? ''} onChange={e => field('uploadedAfter', e.target.value)} /></Field>}
    </div>}
    {form.kind !== 'liked' && dateFilter && <p className={hint}>Videos without a known upload date are skipped.</p>}
    <div className="flex flex-col gap-2 border-t-2 border-zinc-900 pt-3">
      <Checkbox label="Include in scheduled runs" checked={form.enabled} onChange={e => field('enabled', e.target.checked)} />
      <Checkbox label="Use account cookies" disabled={form.kind === 'liked'} checked={form.useCookies} onChange={e => field('useCookies', e.target.checked)} />
    </div>
    <Field label="Run order" className="w-32"><Input type="number" min={0} max={100000} value={form.position} onChange={e => field('position', Number(e.target.value))} /></Field>
    <p className={hint}>Lower runs first.</p>
    <div className="flex gap-2 pt-1"><Button type="submit" variant="primary" disabled={busy}>Save source</Button><Button onClick={onCancel}>Cancel</Button></div>
  </form>;
}

export function DownloadsPage() {
  useDocumentTitle('Downloads');
  const [sources, setSources] = useState<DownloadSource[]>([]), [libraries, setLibraries] = useState<Library[]>([]);
  const [settings, setSettings] = useState<DownloadSettings | null>(null), [draft, setDraft] = useState<Pick<DownloadSettings, 'scheduleEnabled' | 'intervalHours'> | null>(null);
  const [activity, setActivity] = useState<RunsResponse | null>(null), [page, setPage] = useState(1);
  const [cookies, setCookies] = useState<{ present: boolean; modifiedAt: string | null } | null>(null);
  const [tools, setTools] = useState<Awaited<ReturnType<typeof downloads.tools>> | null>(null);
  const [editing, setEditing] = useState<DownloadSource | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ id: string; content: string } | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [oneOff, setOneOff] = useState({ url: '', quality: '1080p' as Quality, libraryPath: '', useCookies: false });
  const [importFiles, setImportFiles] = useState<Partial<Record<Quality | 'archive', string>>>({});
  const [importPath, setImportPath] = useState(''), [importCookies, setImportCookies] = useState(false), [importLiked, setImportLiked] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const refresh = useCallback(async () => {
    const [s, a, prefs, libs, cookieInfo] = await Promise.all([downloads.sources(), downloads.runs(page), downloads.settings(), getLibraries(), downloads.cookies()]);
    setSources(s); setActivity(a); setSettings(prefs); setLibraries(libs); setCookies(cookieInfo);
    setDraft(old => old ?? { scheduleEnabled: prefs.scheduleEnabled, intervalHours: prefs.intervalHours });
  }, [page]);
  useEffect(() => { void refresh().catch(e => setError(e.message)); }, [refresh]);
  useEffect(() => { void downloads.tools().then(setTools).catch(e => setError(e.message)); }, []);
  const isActive = !!activity?.activeRun || !!activity?.queuedCount || activity?.runs.some(r => r.scanStatus === 'running');
  useEffect(() => {
    const timer = setInterval(() => { void refresh().catch(e => setError(e.message)); }, isActive ? 2000 : 10000);
    return () => clearInterval(timer);
  }, [isActive, refresh]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  async function act(action: () => Promise<unknown>, success?: string): Promise<boolean> {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); if (success) setNotice(success); await refresh(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); return false; }
    finally { setBusy(false); }
  }
  const importBody = (): ImportInput => ({
    groups: (['best', '1080p', '720p'] as Quality[]).filter(q => importFiles[q]).map(q => ({ content: importFiles[q]!, quality: q, libraryPath: importPath, useCookies: importCookies })),
    archive: importFiles.archive ?? '', ...(importLiked ? { liked: { libraryPath: importPath, quality: 'best' as Quality } } : {}),
  });
  async function readUpload(file: File | undefined, max: number): Promise<string | null> {
    if (!file) return null;
    if (file.size > max) { setError('Selected file exceeds the size limit'); return null; }
    return file.text();
  }
  const closeEditor = useCallback(() => setEditing(null), []);
  const closeLog = useCallback(() => setLog(null), []);

  function runActions(run: DownloadRun) {
    return <div className="flex flex-wrap gap-1.5">
      {activeStatuses.includes(run.status)
        ? <Button size="sm" disabled={busy || run.status === 'cancelling'} onClick={() => act(() => downloads.action(run.id, 'cancel'), 'Cancellation requested')}>Cancel</Button>
        : <Button size="sm" disabled={busy} onClick={() => act(() => downloads.action(run.id, 'retry'), 'Retry queued')}>Retry</Button>}
      {run.finalized && ['failed', 'pending'].includes(run.scanStatus) && <Button size="sm" disabled={busy} onClick={() => act(() => downloads.action(run.id, 'retry-scan'), 'Scan retry requested')}>Retry scan</Button>}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(async () => { const data = await downloads.log(run.id); setLog({ id: run.id, content: data.content }); })}>View log</Button>
    </div>;
  }
  const runStatus = (run: DownloadRun) => <StatusBadge tone={tone(run.status)}>
    {run.status}{activeStatuses.includes(run.status) ? ` · ${run.phase}` : ''}
  </StatusBadge>;
  const runErrors = (run: DownloadRun) => (run.error || run.scanError) &&
    <p className="mt-1.5 whitespace-pre-wrap break-words text-xs text-red-300">{run.error}{run.scanError ? `\nScan: ${run.scanError}` : ''}</p>;
  const scanText = (run: DownloadRun) => run.scanStatus !== 'not_needed' && <span>Library scan: {run.scanStatus}</span>;

  function activeRun(run: DownloadRun) {
    const p = run.progress;
    const pct = p?.totalBytes ? Math.min(100, Math.round(((p.downloadedBytes ?? 0) / p.totalBytes) * 100)) : null;
    return <article key={run.id} className="border-2 border-red-700 bg-red-950/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">{runStatus(run)}<h3 className="truncate text-sm font-bold">{run.settings.name}</h3></div>
        {runActions(run)}
      </div>
      {p && <>
        <div className="mt-3 h-1.5 bg-zinc-800" role="progressbar" aria-label="Download progress" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full bg-red-600 transition-[width] ${pct == null ? 'w-1/3 animate-pulse' : ''}`} style={pct == null ? undefined : { width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 break-words font-mono text-[11px] text-zinc-400">
          {p.item ?? 'Downloading'} · {bytes(p.downloadedBytes)} / {bytes(p.totalBytes)}
          {p.speed != null ? ` · ${bytes(p.speed)}/s` : ''}{p.eta != null ? ` · ${Math.ceil(p.eta)}s left` : ''}
        </p>
      </>}
      <p className="mt-1 font-mono text-[11px] text-zinc-500">{formatDate(run.createdAt)} · {run.settings.quality} · {run.publishedCount} published {scanText(run) && <>· {scanText(run)}</>}</p>
      {runErrors(run)}
    </article>;
  }
  function historyRow(run: DownloadRun) {
    return <li key={run.id} className="py-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
        <div>{runStatus(run)}</div>
        <div className="order-last col-span-2 min-w-0 sm:order-none sm:col-span-1">
          <h3 className="truncate text-sm font-semibold">{run.settings.name}</h3>
          <p className="font-mono text-[11px] text-zinc-500">{formatDate(run.createdAt)} · {run.settings.quality} · {run.publishedCount} published {scanText(run) && <>· {scanText(run)}</>}</p>
        </div>
        {runActions(run)}
      </div>
      {runErrors(run)}
    </li>;
  }

  const running = activity?.activeRun;
  const writable = libraries.some(l => !l.skip);
  const pages = Math.max(1, activity?.pagination.pages ?? 1);
  const summary = [
    running ? `Running: ${running.settings.name}` : 'Idle',
    `${activity?.queuedCount ?? 0} queued`,
    settings?.scheduleEnabled ? `next run ${formatDate(settings.nextRunAt)}` : 'schedule off',
  ].join(' · ');

  return <Page className="mx-auto max-w-6xl space-y-4">
    <PageHeader title="Downloads" meta={summary} actions={<>
      <Button onClick={() => setEditing('new')}>Add source</Button>
      <Button variant="primary" disabled={busy || !sources.some(s => s.enabled)} onClick={() => act(downloads.runAll, 'Enabled sources queued')}>Run all enabled</Button>
    </>} />

    {error && <div ref={errorRef} tabIndex={-1} className="focus:outline-none"><ErrorBanner onRetry={() => act(refresh)}>{error}</ErrorBanner></div>}
    {notice && <p role="status" className="border-2 border-emerald-900 px-3 py-2 text-sm text-emerald-300">{notice}</p>}
    {!writable && <p className="border-2 border-amber-800 px-3 py-2 text-sm text-amber-200">Add an active, writable destination in <Link className="underline hover:text-white" to="/configure">Config → Libraries</Link> before downloading.</p>}

    <Section id="sources" title="Sources">
      {!sources.length ? <p className="text-sm text-zinc-400">No sources yet.</p> : <>
        <ul className="-my-2.5 divide-y divide-zinc-900">{sources.map(source => <li key={source.id}>
          <article className={`grid gap-2 py-2.5 md:grid-cols-[minmax(0,1fr)_9rem_auto] md:items-center md:gap-3 ${source.enabled ? '' : 'opacity-60'}`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-bold">{source.name}</h3>
                <span className="font-mono text-[11px] uppercase text-zinc-500">{kindLabel[source.kind]}</span>
                {!source.enabled && <StatusBadge>Not scheduled</StatusBadge>}
              </div>
              <p className="truncate font-mono text-[11px] text-zinc-500" title={source.url}>{source.url}</p>
              <p className="truncate font-mono text-[11px] text-zinc-400" title={source.libraryPath}>
                {source.quality} → {source.libraryPath} · order {source.position}{source.useCookies ? ' · cookies' : ''}{source.uploadedAfter ? ` · since ${source.uploadedAfter}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 md:block">
              {source.lastRun ? <>
                <StatusBadge tone={tone(source.lastRun.status)}>Last: {source.lastRun.status}</StatusBadge>
                <p className="font-mono text-[11px] text-zinc-500 md:mt-1">{formatDate(source.lastRun.createdAt)}</p>
              </> : <span className="font-mono text-[11px] text-zinc-600">Never run</span>}
            </div>
            <div className="flex flex-wrap gap-1.5 md:flex-nowrap md:justify-end">
              <Button size="sm" disabled={busy} onClick={() => act(() => downloads.runSource(source.id), 'Source queued')}>Run now</Button>
              <Button size="sm" onClick={() => setEditing(source)}>Edit</Button>
              <Button size="sm" disabled={busy} onClick={() => act(() => downloads.saveSource({ name: source.name, url: source.url, kind: source.kind, quality: source.quality, libraryPath: source.libraryPath,
                enabled: !source.enabled, useCookies: source.useCookies, uploadedAfter: source.uploadedAfter, position: source.position }, source.id))}>{source.enabled ? 'Disable' : 'Enable'}</Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => act(() => downloads.removeSource(source.id), 'Source removed; downloaded files kept')}>Remove</Button>
            </div>
          </article>
        </li>)}</ul>
      </>}
    </Section>

    <Section id="activity" title="Activity" description={activity?.waitingReason ?? undefined}
      actions={pages > 1 && <div className="flex items-center gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
        <span className="font-mono text-[11px] text-zinc-400">{page} / {pages}</span>
        <Button size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
      </div>}>
      <div aria-live="polite">{running && activeRun(running)}</div>
      {activity?.runs.length
        ? <ul className={`divide-y divide-zinc-900 ${running ? 'mt-2' : ''}`}>{activity.runs.filter(r => r.id !== running?.id).map(historyRow)}</ul>
        : <p className="text-sm text-zinc-400">No download runs yet.</p>}
    </Section>

    <div className="space-y-2">
      <h2 className={label}>Setup</h2>
      <Collapsible title="Schedule" summary={settings ? (settings.scheduleEnabled ? `Every ${settings.intervalHours}h · next ${formatDate(settings.nextRunAt)}` : 'Off') : undefined}>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (draft) void act(() => downloads.saveSettings(draft), 'Download schedule saved'); }}>
          {draft && <div className="flex flex-wrap items-end gap-4">
            <Checkbox label="Enable download schedule" className="h-8" checked={draft.scheduleEnabled} onChange={e => setDraft({ ...draft, scheduleEnabled: e.target.checked })} />
            <Field label="Interval (hours)" className="w-32"><Input required type="number" min={1} max={8760} step={1} value={draft.intervalHours} onChange={e => setDraft({ ...draft, intervalHours: Number(e.target.value) })} /></Field>
            <Button type="submit" disabled={busy}>Save schedule</Button>
          </div>}
                  </form>
      </Collapsible>

      <Collapsible title="Account cookies" summary={cookies ? (cookies.present ? `Uploaded ${formatDate(cookies.modifiedAt)}` : 'Not uploaded') : undefined}>
        <div className="space-y-3">
          {!cookies?.present && <p className="text-sm text-zinc-400">Needed for Liked Videos and private playlists.</p>}
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Upload Netscape cookies file (up to 1 MiB)" className="min-w-64 flex-1"><Input type="file" accept=".txt" disabled={busy} onChange={async e => {
              const file = e.currentTarget.files?.[0]; e.currentTarget.value = '';
              const content = await readUpload(file, 1024 * 1024); if (content !== null) void act(() => downloads.uploadCookies(content), 'Cookies saved privately');
            }} /></Field>
            <Button variant="danger" disabled={busy || !cookies?.present} onClick={() => act(downloads.deleteCookies, 'Cookies removed')}>Remove cookies</Button>
          </div>
        </div>
      </Collapsible>

      <Collapsible title="Tools" summary={tools ? `${tools.ready ? 'Ready' : 'Setup needed'} · yt-dlp ${tools.ytDlp ?? 'missing'}` : 'Checking…'}>
        {tools && <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 font-mono text-xs">
          {([['Status', tools.ready ? 'Ready' : 'Setup needed'], ['Node', tools.node], ['yt-dlp', tools.ytDlp ?? 'missing'], ['EJS', tools.ejs ?? 'not detected'], ['ffmpeg', tools.ffmpeg ?? 'missing']] as const)
            .map(([k, v]) => <div key={k} className="contents"><dt className="text-zinc-500">{k}</dt><dd className="truncate text-zinc-300" title={v}>{v}</dd></div>)}
        </dl>}
        <Button className="mt-3" disabled={busy} onClick={() => act(async () => setTools(await downloads.tools()))}>Check tools</Button>
      </Collapsible>

      <Collapsible title="Download one video">
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); void act(() => downloads.video(oneOff), 'Video queued'); }}>
          <Field label="Video URL"><Input required type="url" value={oneOff.url} onChange={e => setOneOff({ ...oneOff, url: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><QualitySelect value={oneOff.quality} onChange={q => setOneOff({ ...oneOff, quality: q })} label="Video quality" />
            <Destination libraries={libraries} value={oneOff.libraryPath} onChange={path => setOneOff({ ...oneOff, libraryPath: path })} label="Video destination" /></div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Checkbox label="Use account cookies for this video" checked={oneOff.useCookies} onChange={e => setOneOff({ ...oneOff, useCookies: e.target.checked })} />
            <Button type="submit" variant="primary" disabled={busy}>Queue video</Button>
          </div>
        </form>
      </Collapsible>

      <Collapsible title="Import existing setup">
        <p className="text-sm text-zinc-400">Adds sources from URL lists and a yt-dlp archive without downloading. Turn off other download jobs before running YUI downloads.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Destination libraries={libraries} value={importPath} onChange={path => { setImportPath(path); setPreview(null); }} label="Import destination" />
          <div className="flex flex-col justify-end gap-1.5">
            <Checkbox label="Use cookies for imported public sources" checked={importCookies} onChange={e => { setImportCookies(e.target.checked); setPreview(null); }} />
            <Checkbox label="Include My Liked Videos (Best quality)" checked={importLiked} onChange={e => { setImportLiked(e.target.checked); setPreview(null); }} />
          </div>
          {(['best', '1080p', '720p', 'archive'] as const).map(key => <Field key={key} label={key === 'archive' ? 'yt-dlp archive.txt' : `${key} source list`}>
            <Input type="file" accept=".txt" onChange={async e => {
              const content = await readUpload(e.currentTarget.files?.[0], key === 'archive' ? 8_000_000 : 2_000_000);
              setImportFiles(old => ({ ...old, [key]: content ?? '' })); setPreview(null);
            }} /></Field>)}
        </div>
        <div className="mt-3 flex gap-2">
          <Button disabled={busy} onClick={() => act(async () => setPreview(await downloads.previewImport(importBody())))}>Preview import</Button>
          <Button variant="primary" disabled={busy || !preview || !!preview.conflicts.length || !!preview.archive.invalidLines.length} onClick={() => act(async () => {
            const result = await downloads.import(importBody()); setPreview(null); setNotice(`Imported ${result.imported} sources and ${result.archiveEntries} archive entries; ${result.skipped} sources already present.`);
          })}>Apply import</Button>
        </div>
        {preview && <div className="mt-3 space-y-1 border-t-2 border-zinc-900 pt-3 text-sm" role="status">
          <p>{preview.sources.length} new sources · {preview.skipped} already present · {preview.archive.validCount} archive entries</p>
          {preview.sources.map(s => <p className="break-all font-mono text-[11px] text-zinc-400" key={s.url}>{s.quality} · {s.url}</p>)}
          {preview.archive.invalidLines.length > 0 && <p className="text-red-300">Invalid archive lines: {preview.archive.invalidLines.join(', ')}</p>}
          {preview.conflicts.map((c, i) => <p className="break-all text-red-300" key={i}>{c}</p>)}
        </div>}
      </Collapsible>
    </div>

    {editing && <Drawer title={editing === 'new' ? 'Add source' : 'Edit source'} onClose={closeEditor}>
      <SourceForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} libraries={libraries} busy={busy}
        onCancel={closeEditor} onSave={(data, id) => act(() => downloads.saveSource(data, id), 'Source saved')} />
    </Drawer>}
    {log && <Drawer wide title="Run log" onClose={closeLog}>
      <pre className="whitespace-pre-wrap break-all font-mono text-xs text-zinc-300">{log.content || 'No log output yet.'}</pre>
    </Drawer>}
  </Page>;
}
