// ============================================
// LIKED VIDEO ORDER IMPORT COMPONENT
// ============================================
// Config page widget for the one-time liked_order import.
//
// Why this exists
// ---------------
// YouTube's API doesn't expose when a video was liked, so we have no way to
// sort liked videos chronologically without external data. The workaround:
// the user provides a txt file mapping a serial number (1 = oldest) to each
// YouTube video ID. This component uploads that file, sends the content to
// the backend, and shows the result.
//
// Future new liked videos (discovered in scans after the import) are
// automatically assigned MAX(liked_order)+1, so they sort after historical ones.
//
// Txt file format (one entry per line):
//   <serial>  <youtube_id>
// Example:
//   1 w28ZREQe3_Q
//   2 EO3XKf08aNU

import { useEffect, useState } from 'react'
import { getLikedOrderStatus, importLikedOrder } from '../lib/api'
import type { LikedOrderStatus, LikedOrderImportResult } from '../lib/api'
import { Button, ErrorBanner, Field, Input, Section, Spinner, Stat } from './ui'

export function LikedVideoOrderImport() {
  const [status, setStatus] = useState<LikedOrderStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<LikedOrderImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  useEffect(() => {
    loadStatus()
  }, [])

  const loadStatus = async () => {
    setLoading(true)
    try {
      const data = await getLikedOrderStatus()
      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status')
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setSelectedFile(file)
    // Clear previous result when a new file is selected
    setResult(null)
    setError(null)
  }

  const handleImport = async () => {
    if (!selectedFile || importing) return

    setImporting(true)
    setError(null)
    setResult(null)

    try {
      // Read the file as plain text in the browser — no multipart needed.
      // We send the raw text as JSON { content: "..." } to the backend.
      const content = await selectedFile.text()
      const importResult = await importLikedOrder(content)
      setResult(importResult)
      // Refresh status counters after a successful import
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const coveragePercent =
    status && status.totalLiked > 0 ? Math.round((status.withOrder / status.totalLiked) * 100) : 0

  return (
    <Section
      id="liked-order"
      title="Liked order"
      description="YouTube doesn't expose like dates. Import them to sort Liked."
    >
      {error && <ErrorBanner className="mb-3">{error}</ErrorBanner>}
      {loading && !status ? <Spinner className="py-6" /> : (
        <div className="space-y-3">
          {status && (
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Liked videos" value={status.totalLiked} />
              <Stat label="With order" value={`${status.withOrder} · ${coveragePercent}%`}
                tone={status.isImported ? (coveragePercent === 100 ? 'good' : 'warn') : 'default'} />
            </div>
          )}

          {result && (
            <p role="status" className="border-2 border-emerald-900 px-3 py-2 text-sm text-emerald-300">
              Imported: {result.updated} updated · {result.notFound} invalid · {result.total} lines
            </p>
          )}


          <div className="flex flex-wrap items-start gap-2">
            <Field label="Like order file (.txt)" hint={<>One <code className="text-zinc-300">serial youtube_id</code> per line, 1 = oldest.</>} className="min-w-56 flex-1">
              <Input type="file" accept=".txt,text/plain" onChange={handleFileChange} />
            </Field>
            <Button variant="primary" className="mt-5" onClick={handleImport} disabled={!selectedFile || importing}>
              {importing ? 'Importing…' : status?.isImported ? 'Re-import' : 'Import'}
            </Button>
          </div>
        </div>
      )}
    </Section>
  )
}
