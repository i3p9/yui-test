import { useState, useEffect } from 'react'
import { getDangerStats, resetDatabase } from '../lib/api'
import type { DangerStats } from '../types'

interface DangerZoneProps {
  onReset?: () => void
}

export function DangerZone({ onReset }: DangerZoneProps) {
  const [stats, setStats] = useState<DangerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [removeThumbnails, setRemoveThumbnails] = useState(false)
  const [removeMetadata, setRemoveMetadata] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    loadStats()
  }, [])

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [success])

  const loadStats = async () => {
    try {
      setLoading(true)
      const data = await getDangerStats()
      setStats(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async () => {
    if (confirmText !== 'RESET') return

    setResetting(true)
    setError(null)

    try {
      const result = await resetDatabase({ removeThumbnails, removeMetadata })
      setSuccess(result.message)
      setShowConfirm(false)
      setConfirmText('')
      setRemoveThumbnails(false)
      setRemoveMetadata(false)
      await loadStats()
      onReset?.()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setResetting(false)
    }
  }

  const totalRecords = stats
    ? stats.database.videos +
      stats.database.channels +
      stats.database.scanLogs +
      stats.database.watchProgress +
      stats.database.subtitles
    : 0

  return (
    <div className="border-4 border-red-900 bg-zinc-950 p-6 shadow-[10px_10px_0_0_#450a0a]">
      <div className="mb-6">
        <p className="text-xs font-mono uppercase tracking-[0.3em] text-red-500">
          DEVELOPMENT TOOLS
        </p>
        <h2 className="mt-2 text-lg font-black tracking-widest text-red-400">
          Danger Zone
        </h2>
        <p className="mt-2 text-xs font-mono uppercase text-zinc-500">
          Reset database and clean up generated files
        </p>
      </div>

      {loading ? (
        <div className="border-2 border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs font-mono uppercase tracking-widest text-zinc-500">
            Loading statistics...
          </p>
        </div>
      ) : stats ? (
        <div className="space-y-4">
          {/* Current Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="border-2 border-zinc-800 bg-zinc-900 p-3">
              <p className="text-xs font-mono uppercase text-zinc-500">Videos</p>
              <p className="mt-1 text-xl font-black text-white">{stats.database.videos}</p>
            </div>
            <div className="border-2 border-zinc-800 bg-zinc-900 p-3">
              <p className="text-xs font-mono uppercase text-zinc-500">Channels</p>
              <p className="mt-1 text-xl font-black text-white">{stats.database.channels}</p>
            </div>
            <div className="border-2 border-zinc-800 bg-zinc-900 p-3">
              <p className="text-xs font-mono uppercase text-zinc-500">Progress</p>
              <p className="mt-1 text-xl font-black text-white">{stats.database.watchProgress}</p>
            </div>
            <div className="border-2 border-zinc-800 bg-zinc-900 p-3">
              <p className="text-xs font-mono uppercase text-zinc-500">Thumbnails</p>
              <p className="mt-1 text-xl font-black text-white">{stats.thumbnails.count}</p>
            </div>
            <div className="border-2 border-zinc-800 bg-zinc-900 p-3">
              <p className="text-xs font-mono uppercase text-zinc-500">Metadata</p>
              <p className="mt-1 text-xl font-black text-white">{stats.metadata.count}</p>
            </div>
            <div className="border-2 border-zinc-800 bg-zinc-900 p-3">
              <p className="text-xs font-mono uppercase text-zinc-500">Scan Logs</p>
              <p className="mt-1 text-xl font-black text-white">{stats.database.scanLogs}</p>
            </div>
          </div>

          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              className="w-full border-4 border-red-800 bg-red-950 px-6 py-4 font-black uppercase tracking-[0.3em] text-red-400 transition-colors hover:border-red-600 hover:text-red-300"
            >
              Reset Database
            </button>
          ) : (
            <div className="space-y-4 border-2 border-red-800 bg-red-950/50 p-4">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-red-400">
                  Confirm Reset
                </p>
                <p className="mt-1 text-xs font-mono text-zinc-400">
                  This will delete {totalRecords} database records.
                </p>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-3 border-2 border-zinc-800 bg-zinc-900 p-3 transition-colors hover:border-zinc-700">
                  <input
                    type="checkbox"
                    checked={removeThumbnails}
                    onChange={(e) => setRemoveThumbnails(e.target.checked)}
                    className="h-4 w-4 accent-red-500"
                  />
                  <div>
                    <p className="text-sm font-bold text-white">Remove Thumbnails</p>
                    <p className="text-xs font-mono text-zinc-500">
                      Delete {stats.thumbnails.count} generated thumbnails from {stats.thumbnails.path}
                    </p>
                  </div>
                </label>

                <label className="flex cursor-pointer items-center gap-3 border-2 border-zinc-800 bg-zinc-900 p-3 transition-colors hover:border-zinc-700">
                  <input
                    type="checkbox"
                    checked={removeMetadata}
                    onChange={(e) => setRemoveMetadata(e.target.checked)}
                    className="h-4 w-4 accent-red-500"
                  />
                  <div>
                    <p className="text-sm font-bold text-white">Remove Fetched Metadata</p>
                    <p className="text-xs font-mono text-zinc-500">
                      Delete {stats.metadata.count} metadata files from {stats.metadata.path}
                    </p>
                  </div>
                </label>
              </div>

              {/* Confirmation Input */}
              <div>
                <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-zinc-500">
                  Type RESET to confirm
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  placeholder="RESET"
                  className="w-full border-2 border-zinc-800 bg-zinc-900 px-4 py-3 font-mono text-sm text-white placeholder-zinc-600 focus:border-red-600 focus:outline-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowConfirm(false)
                    setConfirmText('')
                    setRemoveThumbnails(false)
                    setRemoveMetadata(false)
                  }}
                  className="flex-1 border-2 border-zinc-700 bg-zinc-800 px-4 py-3 font-bold uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  disabled={confirmText !== 'RESET' || resetting}
                  className={`flex-1 border-2 px-4 py-3 font-bold uppercase tracking-widest transition-colors ${
                    confirmText === 'RESET' && !resetting
                      ? 'border-red-600 bg-red-900 text-red-200 hover:border-red-500 hover:text-red-100'
                      : 'cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-600'
                  }`}
                >
                  {resetting ? 'Resetting...' : 'Confirm Reset'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {error && (
        <div className="mt-4 border-2 border-red-600 bg-red-950 p-4">
          <p className="text-xs font-mono uppercase tracking-widest text-red-300">{error}</p>
        </div>
      )}
      {success && (
        <div className="mt-4 border-2 border-green-600 bg-green-950 p-4">
          <p className="text-xs font-mono uppercase tracking-widest text-green-300">{success}</p>
        </div>
      )}
    </div>
  )
}
