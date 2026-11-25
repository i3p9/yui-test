import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLibraries } from '../lib/api';
import { downloads, type DownloadRun, type DownloadSettings, type DownloadSource, type ImportInput,
  type ImportPreview, type Quality, type RunsResponse, type SourceInput } from '../lib/download-api';
import type { Library } from '../types';

const inputClass = 'w-full min-w-0 border-2 border-zinc-700 bg-black px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none';
const buttonClass = 'border-2 border-zinc-600 bg-zinc-900 px-3 py-2 text-xs font-bold uppercase tracking-wide hover:border-red-500 disabled:opacity-40 disabled:cursor-not-allowed';
const sectionClass = 'border-2 border-zinc-800 bg-zinc-950 p-4 md:p-6';
const activeStatuses = ['queued', 'running', 'cancelling'];
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString() : '—';
const bytes = (n?: number | null) => n == null ? 'Unknown' : `${(n / 1024 / 1024).toFixed(1)} MB`;

function QualitySelect({ value, onChange, label = 'Quality' }: { value: Quality; onChange: (q: Quality) => void; label?: string }) {
  return <label className="block text-sm">{label}<select aria-label={label} className={inputClass} value={value} onChange={e => onChange(e.target.value as Quality)}>
    <option value="720p">Up to 720p</option><option value="1080p">Up to 1080p</option><option value="best">Best available</option>
  </select></label>;
}
function Destination({ libraries, value, onChange, label = 'Destination library' }: { libraries: Library[]; value: string; onChange: (path: string) => void; label?: string }) {
  return <label className="block min-w-0 text-sm">{label}<select aria-label={label} required className={inputClass} value={value} onChange={e => onChange(e.target.value)}>
    <option value="">Choose a library</option>{libraries.filter(l => !l.skip).map(l => <option key={l.path} value={l.path}>{l.name} · {l.path}</option>)}
  </select></label>;
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
  return <form className="mt-4 space-y-4 border-2 border-red-900 p-4" onSubmit={async e => {
    e.preventDefault();
    if (await onSave({ ...form, uploadedAfter: dateFilter && form.kind !== 'liked' ? form.uploadedAfter : null }, initial?.id)) onCancel();
  }}>
    <h3 className="font-bold">{initial ? 'Edit source' : 'Add source'}</h3>
    <div className="grid gap-4 md:grid-cols-2">
      <label className="text-sm">Name<input autoFocus required maxLength={200} className={inputClass} value={form.name} onChange={e => field('name', e.target.value)} /></label>
      <label className="text-sm">Source type<select aria-label="Source type" className={inputClass} value={form.kind} onChange={e => {
        const kind = e.target.value as SourceInput['kind'];
        setForm(old => ({ ...old, kind, url: kind === 'liked' ? 'https://www.youtube.com/playlist?list=LL' : old.kind === 'liked' ? '' : old.url,
          useCookies: kind === 'liked' || old.useCookies, uploadedAfter: kind === 'liked' ? null : old.uploadedAfter }));
      }}><option value="channel">Channel videos</option><option value="playlist">Playlist</option><option value="liked">My Liked Videos</option></select></label>
    </div>
    <label className="block text-sm">YouTube URL<input required type="url" readOnly={form.kind === 'liked'} className={inputClass} value={form.url} onChange={e => field('url', e.target.value)} /></label>
    <div className="grid gap-4 md:grid-cols-2"><QualitySelect value={form.quality} onChange={q => field('quality', q)} />
      <Destination libraries={libraries} value={form.libraryPath} onChange={v => field('libraryPath', v)} /></div>
    {form.kind !== 'liked' && <div className="grid gap-4 md:grid-cols-2"><label className="text-sm">Download history<select aria-label="Download history" className={inputClass} value={dateFilter ? 'date' : 'all'} onChange={e => setDateFilter(e.target.value === 'date')}>
      <option value="all">All available videos</option><option value="date">Uploaded on or after a date</option></select></label>
      {dateFilter && <label className="text-sm">Upload date<input required type="date" className={inputClass} value={form.uploadedAfter ?? ''} onChange={e => field('uploadedAfter', e.target.value)} /></label>}</div>}
    <p className="text-xs text-zinc-400">Quality affects future downloads. Existing files are kept. A date filter uses the video's upload date; old videos newly added to a playlist and videos without a known date are excluded.</p>
    <div className="flex flex-wrap gap-4 text-sm">
      <label><input type="checkbox" checked={form.enabled} onChange={e => field('enabled', e.target.checked)} /> Include in scheduled runs</label>
      <label><input type="checkbox" disabled={form.kind === 'liked'} checked={form.useCookies} onChange={e => field('useCookies', e.target.checked)} /> Use account cookies</label>
      <label>Run order <input type="number" min={0} max={100000} className="w-24 border border-zinc-600 bg-black p-1" value={form.position} onChange={e => field('position', Number(e.target.value))} /></label>
    </div>
    <p className="text-xs text-zinc-400">Lower run order goes first. The first downloaded copy is kept when sources overlap. Edits apply to newly queued runs.</p>
    <div className="flex gap-2"><button disabled={busy} className={buttonClass}>Save source</button><button type="button" className={buttonClass} onClick={onCancel}>Close</button></div>
  </form>;
}

export function DownloadsPage() {
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
  function runCard(run: DownloadRun, featured = false) {
    const p = run.progress;
    return <article key={run.id} className={`min-w-0 border p-4 ${featured ? 'border-red-600 bg-red-950/20' : 'border-zinc-800'}`}>
      <div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-bold">{run.settings.name}</h3>
        <p className="text-xs text-zinc-400">{formatDate(run.createdAt)} · {run.settings.quality} · {run.publishedCount} published</p></div>
        <span className="text-sm font-bold uppercase">{run.status}{activeStatuses.includes(run.status) ? ` · ${run.phase}` : ''}</span></div>
      {p && <p className="mt-2 break-words text-sm">{p.item ?? 'Downloading'} · {bytes(p.downloadedBytes)} / {bytes(p.totalBytes)}
        {p.speed != null ? ` · ${bytes(p.speed)}/s` : ''}{p.eta != null ? ` · ${Math.ceil(p.eta)}s remaining` : ''}</p>}
      {run.scanStatus !== 'not_needed' && <p className="mt-2 text-sm">Library scan: {run.scanStatus}</p>}
      {(run.error || run.scanError) && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-red-300">{run.error}{run.scanError ? `\nScan: ${run.scanError}` : ''}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {activeStatuses.includes(run.status) ? <button disabled={busy || run.status === 'cancelling'} className={buttonClass} onClick={() => act(() => downloads.action(run.id, 'cancel'), 'Cancellation requested')}>Cancel</button>
          : <button disabled={busy} className={buttonClass} onClick={() => act(() => downloads.action(run.id, 'retry'), 'Retry queued')}>Retry</button>}
        {run.finalized && ['failed', 'pending'].includes(run.scanStatus) && <button disabled={busy} className={buttonClass} onClick={() => act(() => downloads.action(run.id, 'retry-scan'), 'Scan retry requested')}>Retry scan</button>}
        <button disabled={busy} className={buttonClass} onClick={() => act(async () => { const data = await downloads.log(run.id); setLog({ id: run.id, content: data.content }); })}>View log</button>
      </div>
    </article>;
  }
  return <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
    <header className="border-b-4 border-red-600 pb-5"><p className="text-xs font-mono tracking-widest text-zinc-500">ARCHIVE // SOURCES</p>
      <h1 className="mt-2 text-3xl font-black">DOWNLOADS</h1><p className="mt-3 max-w-3xl text-sm text-zinc-400">Download your channels, playlists, and likes into your libraries. Finished downloads are scanned automatically.</p></header>
    {error && <div ref={errorRef} tabIndex={-1} role="alert" className="border-2 border-red-700 p-4 text-red-300 break-words">{error}<button className={`${buttonClass} ml-3`} onClick={() => act(refresh)}>Refresh</button></div>}
    {notice && <p role="status" className="border border-green-900 p-3 text-green-300">{notice}</p>}
    {!libraries.some(l => !l.skip) && <p className={sectionClass}>Add an active, writable destination in <Link className="text-red-400 underline" to="/configure">Configure → Libraries</Link> before downloading.</p>}
    <section className={sectionClass} aria-labelledby="sources-title">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="sources-title" className="text-xl font-black">Sources</h2><div className="flex gap-2">
        <button disabled={busy || !sources.some(s => s.enabled)} className={buttonClass} onClick={() => act(downloads.runAll, 'Enabled sources queued')}>Run all enabled</button>
        <button className={buttonClass} onClick={() => setEditing('new')}>Add source</button></div></div>
      <p className="mt-2 text-xs text-zinc-400">One source runs at a time. Liked videos can share an existing channel file; unliking on YouTube keeps the archived copy.</p>
      {!sources.length && <p className="mt-4 text-zinc-400">No sources yet. Add one or import your URL lists below.</p>}
      <div className="mt-4 space-y-3">{sources.map(source => <article className="border border-zinc-800 p-4" key={source.id}>
        <div className="flex flex-wrap justify-between gap-3"><div className="min-w-0"><h3 className="font-bold break-words">{source.name}</h3><p className="break-all text-xs text-zinc-500">{source.url}</p>
          <p className="mt-1 break-all text-xs text-zinc-400">{source.quality} · {source.libraryPath} · Order {source.position} · {source.enabled ? 'Scheduled' : 'Schedule disabled'}{source.lastRun ? ` · Last: ${source.lastRun.status}` : ''}</p></div>
          <div className="flex flex-wrap items-start gap-2"><button disabled={busy} className={buttonClass} onClick={() => act(() => downloads.runSource(source.id), 'Source queued')}>Run now</button>
            <button className={buttonClass} onClick={() => setEditing(source)}>Edit</button>
            <button disabled={busy} className={buttonClass} onClick={() => act(() => downloads.saveSource({ name: source.name, url: source.url, kind: source.kind, quality: source.quality, libraryPath: source.libraryPath,
              enabled: !source.enabled, useCookies: source.useCookies, uploadedAfter: source.uploadedAfter, position: source.position }, source.id))}>{source.enabled ? 'Disable' : 'Enable'}</button>
            <button disabled={busy} className={buttonClass} onClick={() => act(() => downloads.removeSource(source.id), 'Source removed; downloaded files kept')}>Remove</button></div></div>
      </article>)}</div>
      {editing && <SourceForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} libraries={libraries} busy={busy}
        onCancel={() => setEditing(null)} onSave={(data, id) => act(() => downloads.saveSource(data, id), 'Source saved')} />}
    </section>
    <section className={sectionClass} aria-labelledby="activity-title"><h2 id="activity-title" className="text-xl font-black">Queue / Activity</h2>
      <p className="mt-2 text-sm text-zinc-400">{activity?.queuedCount ?? 0} queued{activity?.waitingReason ? ` · ${activity.waitingReason}` : ''}</p>
      <div className="mt-4 space-y-3">{activity?.activeRun && runCard(activity.activeRun, true)}
        {activity?.runs.filter(r => r.id !== activity.activeRun?.id).map(r => runCard(r))}</div>
      {!activity?.runs.length && <p className="mt-4 text-zinc-400">No download runs yet.</p>}
      <div className="mt-4 flex items-center gap-3"><button className={buttonClass} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
        <span className="text-xs">Page {page} / {Math.max(1, activity?.pagination.pages ?? 1)}</span><button className={buttonClass} disabled={page >= (activity?.pagination.pages ?? 1)} onClick={() => setPage(p => p + 1)}>Next</button></div>
      {log && <div className="mt-4"><div className="flex justify-between"><h3 className="font-bold">Run log</h3><button className={buttonClass} onClick={() => setLog(null)}>Close log</button></div>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all border border-zinc-800 bg-black p-3 text-xs">{log.content || 'No log output yet.'}</pre></div>}
    </section>
    <section className={sectionClass} aria-labelledby="setup-title"><h2 id="setup-title" className="text-xl font-black">Schedule / Setup</h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (draft) void act(() => downloads.saveSettings(draft), 'Download schedule saved'); }}>
          <h3 className="font-bold">Automatic downloads</h3>{draft && <><label className="block text-sm"><input type="checkbox" checked={draft.scheduleEnabled} onChange={e => setDraft({ ...draft, scheduleEnabled: e.target.checked })} /> Enable download schedule</label>
            <label className="block text-sm">Interval (hours)<input required type="number" min={1} max={8760} step={1} className={inputClass} value={draft.intervalHours} onChange={e => setDraft({ ...draft, intervalHours: Number(e.target.value) })} /></label></>}
          <p className="text-xs text-zinc-400">Next run: {settings?.scheduleEnabled ? formatDate(settings.nextRunAt) : 'Schedule off'}. Run now is available at any time. The separate automatic scan schedule is managed in Configure.</p>
          <button disabled={busy || !draft} className={buttonClass}>Save schedule</button>
        </form>
        <div className="space-y-3"><h3 className="font-bold">Account cookies</h3><p className="text-sm text-zinc-400">{cookies?.present ? `Uploaded ${formatDate(cookies.modifiedAt)}. Authentication is checked when a source runs.` : 'No cookies uploaded. Required for Liked Videos; optional for public sources.'}</p>
          <label className="block text-sm">Upload Netscape cookies file (up to 1 MiB)<input className={`${inputClass} mt-1`} type="file" accept=".txt" disabled={busy} onChange={async e => {
            const file = e.currentTarget.files?.[0]; e.currentTarget.value = '';
            const content = await readUpload(file, 1024 * 1024); if (content !== null) void act(() => downloads.uploadCookies(content), 'Cookies saved privately');
          }} /></label><button disabled={busy || !cookies?.present} className={buttonClass} onClick={() => act(downloads.deleteCookies, 'Cookies removed')}>Remove cookies</button>
          <p className="text-xs text-zinc-500">Replace exported cookies when YouTube authentication expires. One account is supported.</p></div>
      </div>
      <div className="mt-6 border-t border-zinc-800 pt-4"><h3 className="font-bold">Tools</h3><p className="mt-2 break-words text-xs text-zinc-400">{tools ? `${tools.ready ? 'Available' : 'Setup needed'} · Node ${tools.node} · yt-dlp ${tools.ytDlp ?? 'missing'} · EJS ${tools.ejs ?? 'not detected'} · ${tools.ffmpeg ?? 'ffmpeg missing'}` : 'Checking tools…'}</p>
        <button disabled={busy} className={`${buttonClass} mt-2`} onClick={() => act(async () => setTools(await downloads.tools()))}>Check tools</button></div>
    </section>
    <section className={sectionClass} aria-labelledby="oneoff-title"><h2 id="oneoff-title" className="text-xl font-black">Download one video</h2>
      <form className="mt-4 space-y-4" onSubmit={e => { e.preventDefault(); void act(() => downloads.video(oneOff), 'Video queued'); }}>
        <label className="block text-sm">Video URL<input required type="url" className={inputClass} value={oneOff.url} onChange={e => setOneOff({ ...oneOff, url: e.target.value })} /></label>
        <div className="grid gap-4 md:grid-cols-2"><QualitySelect value={oneOff.quality} onChange={q => setOneOff({ ...oneOff, quality: q })} label="Video quality" />
          <Destination libraries={libraries} value={oneOff.libraryPath} onChange={path => setOneOff({ ...oneOff, libraryPath: path })} label="Video destination" /></div>
        <label className="block text-sm"><input type="checkbox" checked={oneOff.useCookies} onChange={e => setOneOff({ ...oneOff, useCookies: e.target.checked })} /> Use account cookies for this video</label>
        <button disabled={busy} className={buttonClass}>Queue video</button>
      </form>
    </section>
    <section className={sectionClass} aria-labelledby="import-title"><h2 id="import-title" className="text-xl font-black">Import existing setup</h2>
      <p className="mt-2 text-sm text-zinc-400">Import URL lists and a yt-dlp archive without starting downloads. Scan existing libraries first and disable your external download jobs before running YUI downloads.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2"><Destination libraries={libraries} value={importPath} onChange={path => { setImportPath(path); setPreview(null); }} label="Import destination" />
        <div className="space-y-2 text-sm"><label className="block"><input type="checkbox" checked={importCookies} onChange={e => { setImportCookies(e.target.checked); setPreview(null); }} /> Use cookies for imported public sources</label>
          <label className="block"><input type="checkbox" checked={importLiked} onChange={e => { setImportLiked(e.target.checked); setPreview(null); }} /> Include My Liked Videos (Best quality)</label></div>
        {(['best', '1080p', '720p', 'archive'] as const).map(key => <label key={key} className="block text-sm">{key === 'archive' ? 'yt-dlp archive.txt' : `${key} source list`}
          <input type="file" accept=".txt" className={inputClass} onChange={async e => {
            const content = await readUpload(e.currentTarget.files?.[0], key === 'archive' ? 8_000_000 : 2_000_000);
            setImportFiles(old => ({ ...old, [key]: content ?? '' })); setPreview(null);
          }} /></label>)}
      </div>
      <div className="mt-4 flex gap-2"><button disabled={busy} className={buttonClass} onClick={() => act(async () => setPreview(await downloads.previewImport(importBody())))}>Preview import</button>
        <button disabled={busy || !preview || !!preview.conflicts.length || !!preview.archive.invalidLines.length} className={buttonClass} onClick={() => act(async () => {
          const result = await downloads.import(importBody()); setPreview(null); setNotice(`Imported ${result.imported} sources and ${result.archiveEntries} archive entries; ${result.skipped} sources already present.`);
        })}>Apply import</button></div>
      {preview && <div className="mt-4 space-y-2 text-sm" role="status"><p>{preview.sources.length} new sources · {preview.skipped} already present · {preview.archive.validCount} archive entries</p>
        {preview.sources.map(s => <p className="break-all text-xs text-zinc-400" key={s.url}>{s.quality} · {s.url}</p>)}
        {preview.archive.invalidLines.length > 0 && <p className="text-red-300">Invalid archive lines: {preview.archive.invalidLines.join(', ')}</p>}
        {preview.conflicts.map((c, i) => <p className="break-all text-red-300" key={i}>{c}</p>)}</div>}
    </section>
  </div>;
}
