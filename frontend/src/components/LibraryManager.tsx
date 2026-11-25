import { useCallback, useEffect, useState } from 'react'
import { getConfig, updateConfig } from '../lib/api'
import type { Config, Library } from '../types'
import { mediaTypeHumanReadable } from '../utils/utils'
import { Button, Checkbox, Drawer, EmptyState, ErrorBanner, Field, Input, Section, Select, Spinner, StatusBadge } from './ui'

const emptyLibrary: Library = { path: '', name: '', mediaType: 'channel_archive', skip: false }

export function LibraryManager() {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // null = closed, -1 = adding, otherwise the index being edited
  const [editing, setEditing] = useState<number | null>(null)
  const [formData, setFormData] = useState<Library>(emptyLibrary)

  const loadConfig = () => {
    setLoading(true)
    getConfig()
      .then(setConfig)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }
  useEffect(loadConfig, [])

  // Every change saves immediately.
  const save = async (libraries: Library[]) => {
    if (!config) return false
    setSaving(true)
    setError(null)
    try {
      await updateConfig({ ...config, libraries })
      loadConfig()
      return true
    } catch (err: any) {
      setError(err.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  const close = useCallback(() => setEditing(null), [])
  const open = (index: number) => {
    setFormData(index === -1 ? emptyLibrary : config!.libraries[index])
    setEditing(index)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!config || editing === null) return
    const libraries = editing === -1
      ? [...config.libraries, formData]
      : config.libraries.map((lib, i) => (i === editing ? formData : lib))
    if (await save(libraries)) setEditing(null)
  }

  const remove = (index: number) => {
    if (!config || !confirm(`Remove library "${config.libraries[index].name}"? Files on disk are not touched.`)) return
    void save(config.libraries.filter((_, i) => i !== index))
  }

  const toggleSkip = (index: number) => {
    if (!config) return
    void save(config.libraries.map((lib, i) => (i === index ? { ...lib, skip: !lib.skip } : lib)))
  }

  return (
    <Section
      id="libraries"
      title="Libraries"
      actions={<>
        {saving && <StatusBadge tone="active">Saving</StatusBadge>}
        <Button size="sm" variant="primary" onClick={() => open(-1)} disabled={!config}>Add library</Button>
      </>}
    >
      {error && <ErrorBanner className="mb-3" onRetry={loadConfig}>{error}</ErrorBanner>}
      {loading && !config ? (
        <Spinner label="Loading" className="py-6" />
      ) : !config?.libraries.length ? (
        <EmptyState title="No libraries yet">Add the folder that holds your downloaded channels or liked videos.</EmptyState>
      ) : (
        <ul className="-my-2 divide-y divide-zinc-900">
          {config.libraries.map((lib, index) => (
            <li key={`${lib.path}-${index}`} className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-2 ${lib.skip ? 'opacity-60' : ''}`}>
              <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-bold">{lib.name}</h3>
                  <span className="whitespace-nowrap font-mono text-[11px] uppercase text-zinc-500">{mediaTypeHumanReadable(lib.mediaType)}</span>
                </div>
                <p className="truncate font-mono text-[11px] text-zinc-400" title={lib.path}>{lib.path}</p>
              </div>
              <StatusBadge tone={lib.skip ? 'neutral' : 'success'}>{lib.skip ? 'Skipped' : 'Active'}</StatusBadge>
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => open(index)} disabled={saving}>Edit</Button>
                <Button size="sm" onClick={() => toggleSkip(index)} disabled={saving}>{lib.skip ? 'Include' : 'Skip'}</Button>
                <Button size="sm" variant="danger" onClick={() => remove(index)} disabled={saving}>Remove</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <Drawer title={editing === -1 ? 'Add library' : 'Edit library'} onClose={close}>
          <form className="space-y-3" onSubmit={submit}>
            <Field label="Name"><Input autoFocus required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Channels" /></Field>
            <Field label="Type">
              <Select value={formData.mediaType} onChange={(e) => setFormData({ ...formData, mediaType: e.target.value })}>
                <option value="channel_archive">Channel Archive</option>
                <option value="liked_videos">Liked Videos</option>
              </Select>
            </Field>
            <Field label="Path" hint="Path inside the server or container.">
              <Input required className="font-mono" value={formData.path} onChange={(e) => setFormData({ ...formData, path: e.target.value })} placeholder="/media/channels" />
            </Field>
            <Checkbox label="Skip during scans" checked={!!formData.skip} onChange={(e) => setFormData({ ...formData, skip: e.target.checked })} />
            <div className="flex gap-2 pt-1">
              <Button type="submit" variant="primary" disabled={saving}>{editing === -1 ? 'Add library' : 'Save'}</Button>
              <Button onClick={close}>Cancel</Button>
            </div>
          </form>
        </Drawer>
      )}
    </Section>
  )
}
