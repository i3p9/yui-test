import { useState, useEffect } from 'react'
import { getDangerStats, resetDatabase } from '../lib/api'
import type { DangerStats } from '../types'
import { Button, Checkbox, ErrorBanner, Field, Input, Spinner, Stat } from './ui'

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

  const close = () => {
    setShowConfirm(false)
    setConfirmText('')
    setRemoveThumbnails(false)
    setRemoveMetadata(false)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">
        Clears the library index and watch progress. Download sources and settings are kept; rescan afterwards.
      </p>
      {loading && !stats ? <Spinner className="py-6" /> : stats && (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <Stat label="Videos" value={stats.database.videos} />
            <Stat label="Channels" value={stats.database.channels} />
            <Stat label="Progress" value={stats.database.watchProgress} />
            <Stat label="Thumbnails" value={stats.thumbnails.count} />
            <Stat label="Metadata" value={stats.metadata.count} />
            <Stat label="Scan logs" value={stats.database.scanLogs} />
          </div>

          {!showConfirm ? (
            <Button variant="danger" onClick={() => setShowConfirm(true)}>Reset database…</Button>
          ) : (
            <form className="space-y-3 border-2 border-red-900 bg-red-950/20 p-3" onSubmit={(e) => { e.preventDefault(); void handleReset() }}>
              <p className="text-sm font-bold text-red-300">This deletes {totalRecords} database records.</p>
              <div className="flex flex-col gap-1.5">
                <Checkbox label={`Also remove ${stats.thumbnails.count} generated thumbnails (${stats.thumbnails.path})`} checked={removeThumbnails} onChange={(e) => setRemoveThumbnails(e.target.checked)} />
                <Checkbox label={`Also remove ${stats.metadata.count} fetched metadata files (${stats.metadata.path})`} checked={removeMetadata} onChange={(e) => setRemoveMetadata(e.target.checked)} />
              </div>
              <Field label="Type RESET to confirm" className="max-w-xs">
                <Input autoFocus className="font-mono" value={confirmText} placeholder="RESET" onChange={(e) => setConfirmText(e.target.value.toUpperCase())} />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" variant="danger" disabled={confirmText !== 'RESET' || resetting}>{resetting ? 'Resetting…' : 'Reset database'}</Button>
                <Button onClick={close}>Cancel</Button>
              </div>
            </form>
          )}
        </>
      )}
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {success && <p role="status" className="text-sm text-emerald-300">{success}</p>}
    </div>
  )
}
