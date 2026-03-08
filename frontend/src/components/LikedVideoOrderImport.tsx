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

import { useEffect, useRef, useState } from 'react'
import { getLikedOrderStatus, importLikedOrder } from '../lib/api'
import type { LikedOrderStatus, LikedOrderImportResult } from '../lib/api'

export function LikedVideoOrderImport() {
  const [status, setStatus] = useState<LikedOrderStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<LikedOrderImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  if (loading) {
    return (
      <div className="border-4 border-zinc-900 bg-zinc-950 p-6 shadow-[10px_10px_0_0_#09090b]">
        <div className="text-center text-zinc-500">Loading liked order status...</div>
      </div>
    )
  }

  const coveragePercent =
    status && status.totalLiked > 0
      ? Math.round((status.withOrder / status.totalLiked) * 100)
      : 0

  return (
    <div className="border-4 border-zinc-900 bg-zinc-950 p-6 shadow-[10px_10px_0_0_#09090b]">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-mono uppercase tracking-[0.3em] text-zinc-500">
          Liked Videos
        </p>
        <h2 className="mt-2 text-lg font-black uppercase tracking-widest text-white">
          Like Order Import
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          YouTube doesn't expose when a video was liked. Upload a txt file mapping
          serial numbers to YouTube IDs to enable chronological ordering.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 border-2 border-red-600 bg-red-950 p-4 shadow-[4px_4px_0_0_#09090b]">
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-red-300">⚠ Error</p>
          <p className="mt-2 text-sm text-red-200">{error}</p>
        </div>
      )}

      {/* Import Result */}
      {result && (
        <div className="mb-6 border-2 border-green-600 bg-green-950 p-4 shadow-[4px_4px_0_0_#09090b]">
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-green-300">
            ✓ Import Complete
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-black text-white">{result.updated}</p>
              <p className="text-xs font-mono uppercase text-green-400">Updated</p>
            </div>
            <div>
              <p className="text-2xl font-black text-white">{result.notFound}</p>
              <p className="text-xs font-mono uppercase text-amber-400">Not Found</p>
            </div>
            <div>
              <p className="text-2xl font-black text-white">{result.total}</p>
              <p className="text-xs font-mono uppercase text-zinc-400">Total Lines</p>
            </div>
          </div>
          {result.notFound > 0 && (
            <p className="mt-3 text-xs font-mono text-zinc-400">
              "{result.notFound}" entries didn't match any liked video in the library.
              They may be videos you liked but haven't archived yet.
            </p>
          )}
        </div>
      )}

      {/* Status */}
      {status && (
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="border-2 border-zinc-800 bg-zinc-900 p-4 shadow-[4px_4px_0_0_#09090b]">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">
              Total Liked
            </p>
            <p className="mt-2 text-2xl font-black text-white">{status.totalLiked}</p>
          </div>
          <div className="border-2 border-zinc-800 bg-zinc-900 p-4 shadow-[4px_4px_0_0_#09090b]">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">
              With Order
            </p>
            <p className={`mt-2 text-2xl font-black ${status.isImported ? 'text-green-400' : 'text-zinc-500'}`}>
              {status.withOrder}
              <span className="ml-2 text-sm text-zinc-500">
                ({coveragePercent}%)
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Already imported notice */}
      {status?.isImported && !result && (
        <div className="mb-6 border-2 border-zinc-700 bg-zinc-900 p-4">
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">
            ✓ Order Already Imported
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            {coveragePercent === 100
              ? 'All liked videos have a like order assigned.'
              : `${status.withOrder} of ${status.totalLiked} liked videos have an order. You can re-import to update.`}
          </p>
        </div>
      )}

      {/* File format info */}
      <div className="mb-6 border-2 border-zinc-800 bg-zinc-900 p-4">
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500 mb-2">
          Expected Format
        </p>
        <pre className="text-xs font-mono text-zinc-300 leading-relaxed">
{`1 w28ZREQe3_Q
2 EO3XKf08aNU
3 cmRVPxZPmdo`}
        </pre>
        <p className="mt-2 text-xs font-mono text-zinc-500">
          One entry per line: &lt;serial&gt; &lt;youtube_id&gt; — serial 1 = oldest like.
        </p>
      </div>

      {/* File input */}
      <div className="mb-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,text/plain"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full border-2 border-zinc-700 bg-zinc-900 px-4 py-3 text-left text-sm font-mono text-zinc-300 hover:border-zinc-500 transition-colors"
        >
          {selectedFile
            ? `📄 ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`
            : '📂 Click to select txt file...'}
        </button>
      </div>

      {/* Import button */}
      <button
        onClick={handleImport}
        disabled={!selectedFile || importing}
        className={`w-full border-4 px-6 py-4 font-black uppercase tracking-[0.3em] transition-colors ${
          !selectedFile || importing
            ? 'cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-500'
            : 'border-amber-600 bg-amber-950 text-amber-300 hover:border-amber-500 hover:text-amber-200'
        }`}
      >
        {importing ? 'Importing...' : 'Import Like Order'}
      </button>
    </div>
  )
}
