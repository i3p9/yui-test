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
      <div className="border-4 border-zinc-900 bg-zinc-950 p-6 shadow-[10px_10px_0_0_#09090b]">
        <p className="text-xs font-mono uppercase tracking-[0.3em] text-zinc-500">Library Control</p>
        <h2 className="mt-2 text-lg font-black uppercase tracking-widest text-white">Library Management</h2>
        <p className="mt-6 text-xs font-mono uppercase tracking-widest text-zinc-500">Loading...</p>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="border-4 border-zinc-900 bg-zinc-950 p-6 shadow-[10px_10px_0_0_#09090b]">
        <p className="text-xs font-mono uppercase tracking-[0.3em] text-zinc-500">Library Control</p>
        <h2 className="mt-2 text-lg font-black uppercase tracking-widest text-white">Library Management</h2>
        <p className="mt-6 text-xs font-mono uppercase tracking-widest text-red-400">
          Error: {error || 'Failed to load config'}
        </p>
      </div>
    )
  }

  return (
    <div className="border-4 border-zinc-900 bg-zinc-950 p-6 shadow-[10px_10px_0_0_#09090b]">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.3em] text-zinc-500">Library Control</p>
          <h2 className="mt-2 text-lg font-black uppercase tracking-widest text-white">Library Management</h2>
          <p className="mt-3 text-xs font-mono uppercase tracking-[0.3em] text-zinc-500">
            Manage your video library sources
          </p>
        </div>
        {saving && (
          <div className="flex items-center gap-2 border-2 border-blue-600 bg-blue-950 px-3 py-2 text-xs font-black uppercase tracking-[0.3em] text-blue-300">
            <div className="h-3 w-3 animate-spin border-2 border-blue-400 border-t-transparent" />
            Saving
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 border-2 border-red-600 bg-red-950 p-4">
          <p className="text-xs font-mono uppercase tracking-[0.3em] text-red-300">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        {config.libraries.map((lib, index) => (
          <div key={index}>
            {editingIndex === index ? (
              // Edit Form
              <div className="border-2 border-blue-600 bg-zinc-950 p-6 shadow-[6px_6px_0_0_#09090b] space-y-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-black uppercase tracking-widest text-white">Edit Library</h3>
                  <span className="inline-flex items-center border-2 border-blue-600 bg-blue-950 px-3 py-1 text-xs font-mono uppercase tracking-[0.3em] text-blue-300">
                    Editing
                  </span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-mono uppercase tracking-[0.3em] text-zinc-500">
                      Name
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full border-2 border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none transition-all focus:border-blue-500 focus:bg-zinc-950"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-mono uppercase tracking-[0.3em] text-zinc-500">
                      Media Type
                    </label>
                    <select
                      value={formData.mediaType}
                      onChange={(e) => setFormData({ ...formData, mediaType: e.target.value })}
                      className="w-full border-2 border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none transition-all focus:border-blue-500 focus:bg-zinc-950"
                    >
                      <option value="channel_archive">Channel Archive</option>
                      <option value="liked_videos">Liked Videos</option>
                      <option value="watch_later">Watch Later</option>
                      <option value="playlist">Playlist</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-mono uppercase tracking-[0.3em] text-zinc-500">
                    Path
                  </label>
                  <input
                    type="text"
                    value={formData.path}
                    onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                    className="w-full border-2 border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-mono text-white outline-none transition-all focus:border-blue-500 focus:bg-zinc-950"
                  />
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="checkbox"
                    checked={formData.skip || false}
                    onChange={(e) => setFormData({ ...formData, skip: e.target.checked })}
                    className="h-4 w-4 border-2 border-zinc-700 bg-zinc-900 accent-blue-500 focus:ring-0"
                  />
                  <label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">
                    Skip during scans
                  </label>
                </div>
                <div className="flex flex-col gap-3 border-t-2 border-zinc-800 pt-4 sm:flex-row">
                  <button
                    onClick={() => handleEdit(index)}
                    className="flex-1 border-2 border-blue-600 bg-blue-950 px-4 py-3 text-xs font-black uppercase tracking-[0.3em] text-blue-200 transition-colors hover:border-blue-500 hover:text-blue-100"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="border-2 border-zinc-800 bg-zinc-900 px-4 py-3 text-xs font-black uppercase tracking-[0.3em] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // Library Card
              <div
                className={`group border-2 p-5 shadow-[6px_6px_0_0_#09090b] transition-transform ${
                  lib.skip
                    ? 'border-zinc-800 bg-zinc-900/60 opacity-60'
                    : 'border-zinc-800 bg-zinc-900 hover:-translate-y-1 hover:border-red-600'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-black uppercase tracking-widest text-white">{lib.name}</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="inline-flex items-center border-2 border-zinc-800 bg-zinc-950 px-2 py-1 text-xs font-mono uppercase tracking-[0.3em] text-zinc-300">
                          {lib.mediaType.replace('_', ' ')}
                        </span>
                        {lib.skip && (
                          <span className="inline-flex items-center border-2 border-red-600 bg-red-950 px-2 py-1 text-xs font-mono uppercase tracking-[0.3em] text-red-300">
                            Disabled
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Toggle */}
                    <button
                      onClick={() => handleToggleSkip(index)}
                      disabled={saving}
                      className={`border-2 px-3 py-2 text-xs font-black uppercase tracking-[0.3em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        lib.skip
                          ? 'border-green-600 bg-green-950 text-green-300 hover:border-green-500 hover:text-green-200'
                          : 'border-red-600 bg-red-950 text-red-300 hover:border-red-500 hover:text-red-200'
                      }`}
                      title={lib.skip ? 'Enable library' : 'Disable library'}
                    >
                      {lib.skip ? 'Enable' : 'Disable'}
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="truncate font-mono text-zinc-300 tracking-normal normal-case">{lib.path}</span>
                  </div>

                  <div className="flex flex-col gap-3 border-t-2 border-zinc-800 pt-4 sm:flex-row">
                    <button
                      onClick={() => startEdit(index)}
                      disabled={saving}
                      className="flex-1 border-2 border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-black uppercase tracking-[0.3em] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(index)}
                      disabled={saving}
                      className="border-2 border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-black uppercase tracking-[0.3em] text-red-300 transition-colors hover:border-red-600 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add Form */}
        {showAddForm ? (
          <div className="space-y-5 border-2 border-green-600 bg-zinc-950 p-6 shadow-[6px_6px_0_0_#09090b]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-black uppercase tracking-widest text-white">Add New Library</h3>
              <span className="inline-flex items-center border-2 border-green-600 bg-green-950 px-3 py-1 text-xs font-mono uppercase tracking-[0.3em] text-green-300">
                New
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-mono uppercase tracking-[0.3em] text-zinc-500">
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Archive"
                  className="w-full border-2 border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none transition-all focus:border-green-500 focus:bg-zinc-950"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-mono uppercase tracking-[0.3em] text-zinc-500">
                  Media Type
                </label>
                <select
                  value={formData.mediaType}
                  onChange={(e) => setFormData({ ...formData, mediaType: e.target.value })}
                  className="w-full border-2 border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none transition-all focus:border-green-500 focus:bg-zinc-950"
                >
                  <option value="channel_archive">Channel Archive</option>
                  <option value="liked_videos">Liked Videos</option>
                  <option value="watch_later">Watch Later</option>
                  <option value="playlist">Playlist</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-xs font-mono uppercase tracking-[0.3em] text-zinc-500">
                Path
              </label>
              <input
                type="text"
                value={formData.path}
                onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                placeholder="/path/to/library"
                className="w-full border-2 border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-mono text-white outline-none transition-all focus:border-green-500 focus:bg-zinc-950"
              />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <input
                type="checkbox"
                checked={formData.skip || false}
                onChange={(e) => setFormData({ ...formData, skip: e.target.checked })}
                className="h-4 w-4 border-2 border-zinc-700 bg-zinc-900 accent-green-500 focus:ring-0"
              />
              <label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">
                Skip during scans
              </label>
            </div>
            <div className="flex flex-col gap-3 border-t-2 border-zinc-800 pt-4 sm:flex-row">
              <button
                onClick={handleAdd}
                className="flex-1 border-2 border-green-600 bg-green-950 px-4 py-3 text-xs font-black uppercase tracking-[0.3em] text-green-200 transition-colors hover:border-green-500 hover:text-green-100"
              >
                Add Library
              </button>
              <button
                onClick={cancelEdit}
                className="border-2 border-zinc-800 bg-zinc-900 px-4 py-3 text-xs font-black uppercase tracking-[0.3em] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={startAdd}
            className="flex w-full items-center justify-center gap-3 border-4 border-dashed border-zinc-800 bg-zinc-950 px-4 py-5 text-xs font-black uppercase tracking-[0.3em] text-zinc-500 transition-colors hover:border-red-600 hover:text-white shadow-[6px_6px_0_0_#09090b]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add New Library
          </button>
        )}
      </div>

      {config.libraries.length === 0 && !showAddForm && (
        <p className="py-8 text-center text-xs font-mono uppercase tracking-[0.3em] text-zinc-500">
          No libraries configured
        </p>
      )}
    </div>
  )
}
