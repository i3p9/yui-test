import { useEffect, useState } from 'react'
import { getConfig, updateConfig } from '../lib/api'
import type { Config, Library } from '../types'

export function LibraryManager() {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  // Form state
  const [formData, setFormData] = useState<Library>({
    path: '',
    name: '',
    mediaType: 'channel_archive',
    skip: false,
  })

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = () => {
    setLoading(true)
    getConfig()
      .then(setConfig)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  const handleAdd = async () => {
    if (!config) return
    if (!formData.path || !formData.name) {
      setError('Path and name are required')
      return
    }

    const updatedConfig = {
      ...config,
      libraries: [...config.libraries, formData],
    }

    // Auto-save immediately
    setSaving(true)
    setError(null)
    try {
      await updateConfig(updatedConfig)
      setFormData({
        path: '',
        name: '',
        mediaType: 'channel_archive',
        skip: false,
      })
      setShowAddForm(false)
      loadConfig()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (index: number) => {
    if (!config) return
    const updatedLibraries = [...config.libraries]
    updatedLibraries[index] = formData
    const updatedConfig = {
      ...config,
      libraries: updatedLibraries,
    }

    // Auto-save immediately
    setSaving(true)
    setError(null)
    try {
      await updateConfig(updatedConfig)
      setEditingIndex(null)
      setFormData({
        path: '',
        name: '',
        mediaType: 'channel_archive',
        skip: false,
      })
      loadConfig()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (index: number) => {
    if (!config) return
    if (!confirm('Are you sure you want to delete this library?')) {
      return
    }

    const updatedLibraries = config.libraries.filter((_, i) => i !== index)
    const updatedConfig = {
      ...config,
      libraries: updatedLibraries,
    }

    // Auto-save immediately
    setSaving(true)
    setError(null)
    try {
      await updateConfig(updatedConfig)
      loadConfig()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleSkip = async (index: number) => {
    if (!config) return
    const updatedLibraries = [...config.libraries]
    updatedLibraries[index] = {
      ...updatedLibraries[index],
      skip: !updatedLibraries[index].skip,
    }
    const updatedConfig = {
      ...config,
      libraries: updatedLibraries,
    }
    setConfig(updatedConfig)

    // Auto-save immediately
    setSaving(true)
    try {
      await updateConfig(updatedConfig)
      loadConfig()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (index: number) => {
    if (!config) return
    setFormData(config.libraries[index])
    setEditingIndex(index)
    setShowAddForm(false)
  }

  const startAdd = () => {
    setFormData({
      path: '',
      name: '',
      mediaType: 'channel_archive',
      skip: false,
    })
    setShowAddForm(true)
    setEditingIndex(null)
  }

  const cancelEdit = () => {
    setEditingIndex(null)
    setShowAddForm(false)
    setFormData({
      path: '',
      name: '',
      mediaType: 'channel_archive',
      skip: false,
    })
  }

  if (loading) {
    return (
      <div className="border-4 border-zinc-900 bg-zinc-950 p-5 shadow-[8px_8px_0_0_#09090b]">
        <p className="text-xs font-mono uppercase tracking-[0.25em] text-zinc-500">Library Control</p>
        <h2 className="mt-1 text-base font-black uppercase tracking-widest text-white">Library Management</h2>
        <p className="mt-4 text-xs font-mono uppercase tracking-widest text-zinc-500">Loading...</p>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="border-4 border-zinc-900 bg-zinc-950 p-5 shadow-[8px_8px_0_0_#09090b]">
        <p className="text-xs font-mono uppercase tracking-[0.25em] text-zinc-500">Library Control</p>
        <h2 className="mt-1 text-base font-black uppercase tracking-widest text-white">Library Management</h2>
        <p className="mt-4 text-xs font-mono uppercase tracking-widest text-red-400">
          Error: {error || 'Failed to load config'}
        </p>
      </div>
    )
  }

  return (
    <div className="border-4 border-zinc-900 bg-zinc-950 p-5 shadow-[8px_8px_0_0_#09090b]">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.25em] text-zinc-500">Library Control</p>
          <h2 className="mt-1 text-base font-black uppercase tracking-widest text-white">Library Management</h2>
        </div>
        <div className="flex items-center gap-3">
          {saving && (
            <div className="flex items-center gap-2 border-2 border-blue-600 bg-blue-950 px-3 py-1 text-xs font-black uppercase tracking-[0.25em] text-blue-300">
              <div className="h-3 w-3 animate-spin border-2 border-blue-400 border-t-transparent" />
              Saving
            </div>
          )}
          <button
            onClick={startAdd}
            disabled={showAddForm || editingIndex !== null}
            className="border-2 border-green-600 bg-green-950 px-3 py-2 text-xs font-black uppercase tracking-[0.25em] text-green-300 transition-colors hover:border-green-500 hover:text-green-200 disabled:opacity-50"
          >
            + Add
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 border-2 border-red-600 bg-red-950 p-3">
          <p className="text-xs font-mono uppercase tracking-[0.25em] text-red-300">{error}</p>
        </div>
      )}

      {/* Add/Edit Form */}
      {(showAddForm || editingIndex !== null) && (
        <div className={`mb-4 border-2 p-4 shadow-[4px_4px_0_0_#09090b] ${
          showAddForm ? 'border-green-600 bg-green-950/10' : 'border-blue-600 bg-blue-950/10'
        }`}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-widest text-white">
              {showAddForm ? 'Add New Library' : 'Edit Library'}
            </h3>
            <span className={`inline-flex items-center border px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${
              showAddForm ? 'border-green-600 bg-green-950 text-green-300' : 'border-blue-600 bg-blue-950 text-blue-300'
            }`}>
              {showAddForm ? 'New' : 'Editing'}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Library Name"
              className="border-2 border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none transition-all focus:border-green-500 focus:bg-zinc-950"
            />
            <select
              value={formData.mediaType}
              onChange={(e) => setFormData({ ...formData, mediaType: e.target.value })}
              className="border-2 border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none transition-all focus:border-green-500 focus:bg-zinc-950"
            >
              <option value="channel_archive">Channel Archive</option>
              <option value="liked_videos">Liked Videos</option>
              <option value="watch_later">Watch Later</option>
              <option value="playlist">Playlist</option>
            </select>
            <input
              type="text"
              value={formData.path}
              onChange={(e) => setFormData({ ...formData, path: e.target.value })}
              placeholder="/path/to/library"
              className="border-2 border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-mono text-white outline-none transition-all focus:border-green-500 focus:bg-zinc-950"
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.skip || false}
                onChange={(e) => setFormData({ ...formData, skip: e.target.checked })}
                className="h-4 w-4 border-2 border-zinc-700 bg-zinc-900 accent-green-500"
              />
              <span className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-400">Skip during scans</span>
            </label>
            <div className="flex gap-2">
              <button
                onClick={showAddForm ? handleAdd : () => handleEdit(editingIndex!)}
                className={`border-2 px-4 py-2 text-xs font-black uppercase tracking-[0.25em] transition-colors ${
                  showAddForm 
                    ? 'border-green-600 bg-green-950 text-green-200 hover:border-green-500' 
                    : 'border-blue-600 bg-blue-950 text-blue-200 hover:border-blue-500'
                }`}
              >
                {showAddForm ? 'Add' : 'Save'}
              </button>
              <button
                onClick={cancelEdit}
                className="border-2 border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-black uppercase tracking-[0.25em] text-zinc-300 transition-colors hover:border-zinc-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Libraries Table */}
      {config.libraries.length > 0 ? (
        <div className="border-2 border-zinc-800 bg-zinc-900 shadow-[4px_4px_0_0_#09090b]">
          {/* Header */}
          <div className="border-b-2 border-zinc-800 px-3 py-2 text-xs font-mono uppercase tracking-[0.15em] text-zinc-400">
            <div className="grid grid-cols-5 gap-4 lg:grid-cols-6">
              <div>Name</div>
              <div>Type</div>
              <div className="col-span-2">Path</div>
              <div>Status</div>
              <div className="hidden lg:block">Actions</div>
            </div>
          </div>
          
          {/* Library rows */}
          {config.libraries.map((lib, index) => (
            <div
              key={index}
              className={`px-3 py-3 text-xs font-mono ${
                index !== config.libraries.length - 1 ? 'border-b border-zinc-800' : ''
              } ${lib.skip ? 'bg-zinc-900/60 opacity-60' : ''}`}
            >
              <div className="grid grid-cols-5 gap-4 lg:grid-cols-6 items-center">
                <div className="font-black text-white uppercase tracking-[0.1em] truncate">
                  {lib.name}
                </div>
                <div className="text-zinc-300 uppercase tracking-[0.1em] text-[11px]">
                  {lib.mediaType.replace('_', ' ').substring(0, 8)}
                </div>
                <div className="col-span-2 text-zinc-400 text-[11px] normal-case tracking-normal truncate">
                  {lib.path}
                </div>
                <div>
                  <button
                    onClick={() => handleToggleSkip(index)}
                    disabled={saving}
                    className={`inline-flex items-center border px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] transition-colors disabled:opacity-50 ${
                      lib.skip
                        ? 'border-red-600 bg-red-950 text-red-300 hover:border-red-500'
                        : 'border-green-600 bg-green-950 text-green-300 hover:border-green-500'
                    }`}
                  >
                    {lib.skip ? 'Disabled' : 'Active'}
                  </button>
                </div>
                <div className="hidden lg:flex gap-1">
                  <button
                    onClick={() => startEdit(index)}
                    disabled={saving || showAddForm || editingIndex !== null}
                    className="border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(index)}
                    disabled={saving}
                    className="border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-red-300 hover:border-red-600 hover:text-red-200 disabled:opacity-50"
                  >
                    Del
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : !showAddForm ? (
        <div className="border-2 border-dashed border-zinc-800 bg-zinc-900 py-6 text-center">
          <p className="text-xs font-mono uppercase tracking-[0.25em] text-zinc-500">
            No libraries configured
          </p>
        </div>
      ) : null}
    </div>
  )
}
