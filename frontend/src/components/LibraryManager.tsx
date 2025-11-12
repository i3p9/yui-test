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
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Library Management</h2>
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Library Management</h2>
        <p className="text-red-400">Error: {error || 'Failed to load config'}</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Library Management</h2>
          <p className="text-sm text-gray-400 mt-1">
            Manage your video library sources
          </p>
        </div>
        {saving && (
          <div className="flex items-center gap-2 text-sm text-blue-400">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            Saving...
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {config.libraries.map((lib, index) => (
          <div key={index}>
            {editingIndex === index ? (
              // Edit Form
              <div className="bg-gray-800/60 border border-blue-600 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white">Edit Library</h3>
                  <span className="text-xs px-2 py-1 bg-blue-600/20 text-blue-400 rounded">Editing</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2">Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-gray-900/50 border border-gray-700 focus:border-blue-500 focus:bg-gray-900 rounded-lg px-3 py-2 text-sm outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2">Media Type</label>
                    <select
                      value={formData.mediaType}
                      onChange={(e) => setFormData({ ...formData, mediaType: e.target.value })}
                      className="w-full bg-gray-900/50 border border-gray-700 focus:border-blue-500 focus:bg-gray-900 rounded-lg px-3 py-2 text-sm outline-none transition-all"
                    >
                      <option value="channel_archive">Channel Archive</option>
                      <option value="liked_videos">Liked Videos</option>
                      <option value="watch_later">Watch Later</option>
                      <option value="playlist">Playlist</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">Path</label>
                  <input
                    type="text"
                    value={formData.path}
                    onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                    className="w-full bg-gray-900/50 border border-gray-700 focus:border-blue-500 focus:bg-gray-900 rounded-lg px-3 py-2 text-sm font-mono outline-none transition-all"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    checked={formData.skip || false}
                    onChange={(e) => setFormData({ ...formData, skip: e.target.checked })}
                    className="rounded w-4 h-4 text-blue-600"
                  />
                  <label className="text-sm text-gray-300">Skip during scans</label>
                </div>
                <div className="flex gap-3 pt-3 border-t border-gray-700">
                  <button
                    onClick={() => handleEdit(index)}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-2 bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // Library Card
              <div
                className={`group relative rounded-xl border transition-all ${
                  lib.skip
                    ? 'bg-gray-800/40 border-gray-700 opacity-50'
                    : 'bg-gray-800/60 border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-white mb-1">{lib.name}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                          {lib.mediaType.replace('_', ' ')}
                        </span>
                        {lib.skip && (
                          <span className="text-xs px-2 py-0.5 rounded bg-red-900/40 text-red-400">
                            Disabled
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Toggle Switch */}
                    <button
                      onClick={() => handleToggleSkip(index)}
                      disabled={saving}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        lib.skip ? 'bg-gray-600' : 'bg-green-600'
                      }`}
                      title={lib.skip ? 'Enable library' : 'Disable library'}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          lib.skip ? 'translate-x-1' : 'translate-x-6'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Path */}
                  <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="font-mono text-xs truncate">{lib.path}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t border-gray-700">
                    <button
                      onClick={() => startEdit(index)}
                      disabled={saving}
                      className="flex-1 px-3 py-2 bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(index)}
                      disabled={saving}
                      className="px-3 py-2 bg-gray-700/50 hover:bg-red-600/20 text-gray-300 hover:text-red-400 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
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
          <div className="bg-gray-800/60 border border-green-600 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Add New Library</h3>
              <span className="text-xs px-2 py-1 bg-green-600/20 text-green-400 rounded">New</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Archive"
                  className="w-full bg-gray-900/50 border border-gray-700 focus:border-green-500 focus:bg-gray-900 rounded-lg px-3 py-2 text-sm outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Media Type</label>
                <select
                  value={formData.mediaType}
                  onChange={(e) => setFormData({ ...formData, mediaType: e.target.value })}
                  className="w-full bg-gray-900/50 border border-gray-700 focus:border-green-500 focus:bg-gray-900 rounded-lg px-3 py-2 text-sm outline-none transition-all"
                >
                  <option value="channel_archive">Channel Archive</option>
                  <option value="liked_videos">Liked Videos</option>
                  <option value="watch_later">Watch Later</option>
                  <option value="playlist">Playlist</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Path</label>
              <input
                type="text"
                value={formData.path}
                onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                placeholder="/path/to/library"
                className="w-full bg-gray-900/50 border border-gray-700 focus:border-green-500 focus:bg-gray-900 rounded-lg px-3 py-2 text-sm font-mono outline-none transition-all"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                checked={formData.skip || false}
                onChange={(e) => setFormData({ ...formData, skip: e.target.checked })}
                className="rounded w-4 h-4 text-green-600"
              />
              <label className="text-sm text-gray-300">Skip during scans</label>
            </div>
            <div className="flex gap-3 pt-3 border-t border-gray-700">
              <button
                onClick={handleAdd}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Add Library
              </button>
              <button
                onClick={cancelEdit}
                className="px-4 py-2 bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={startAdd}
            className="w-full p-4 border border-dashed border-gray-700 hover:border-gray-600 hover:bg-gray-800/40 rounded-xl text-gray-400 hover:text-gray-300 transition-all text-sm font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add New Library
          </button>
        )}
      </div>

      {config.libraries.length === 0 && !showAddForm && (
        <p className="text-gray-400 text-center py-8">No libraries configured</p>
      )}
    </div>
  )
}
