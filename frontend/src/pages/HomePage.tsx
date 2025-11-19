import { useEffect, useState } from 'react'
import { getLatestVideos } from '../lib/api'
import { VideoGrid } from '../components/VideoGrid'

interface Video {
  videoId: string
  title: string
  uploader: string | null
  uploadDate: string | null
  durationSeconds: number | null
  thumbnailPath: string | null
  generatedThumbnail: string | null
}

export function HomePage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    loadVideos()
  }, [page])

  const loadVideos = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await getLatestVideos({ page, limit: 40 })
      setVideos(response.videos)
      setTotalPages(response.pagination.pages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load videos')
    } finally {
      setLoading(false)
    }
  }

  if (loading && videos.length === 0) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="inline-block w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-zinc-400 font-bold">LOADING...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-950 border-2 border-red-600 p-6">
          <p className="text-red-400 font-bold">ERROR: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-black tracking-tight mb-2">LATEST</h1>
        <div className="h-1 w-24 bg-red-600" />
      </div>

      {/* Video Grid */}
      <VideoGrid videos={videos} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-12 flex items-center justify-center gap-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-6 py-3 bg-zinc-900 border-2 border-zinc-800 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-800 hover:border-red-600 transition-colors"
          >
            PREV
          </button>
          <span className="text-sm font-mono text-zinc-400">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-6 py-3 bg-zinc-900 border-2 border-zinc-800 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-800 hover:border-red-600 transition-colors"
          >
            NEXT
          </button>
        </div>
      )}
    </div>
  )
}
