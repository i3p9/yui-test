import { useEffect, useState } from 'react'
import { getLatestVideos } from '../lib/api'
import { VideoGrid } from '../components/VideoGrid'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

interface Video {
  videoId: string
  title: string
  uploader: string | null
  uploadDate: string | null
  durationSeconds: number | null
  thumbnailPath: string | null
  hasThumbnails?: boolean | null
  thumbnailSource?: string | null
}

export function HomePage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    loadVideos()
  }, [page])

  const loadVideos = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await getLatestVideos({ page, limit: 40 })
      // Page 1 replaces the list; subsequent pages append
      setVideos((prev) => (page === 1 ? response.videos : [...prev, ...response.videos]))
      setHasMore(page < response.pagination.pages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load videos')
    } finally {
      setLoading(false)
    }
  }

  const sentinelRef = useInfiniteScroll(
    () => setPage((p) => p + 1),
    !loading && hasMore
  )

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

      {/* Sentinel — observed by IntersectionObserver to trigger next page load */}
      <div ref={sentinelRef} />

      {/* Loading spinner for subsequent pages (not the initial load) */}
      {loading && videos.length > 0 && (
        <div className="flex justify-center py-12">
          <div className="inline-block w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* End of list */}
      {!hasMore && videos.length > 0 && (
        <p className="text-center text-xs font-mono text-zinc-700 py-12 tracking-widest uppercase">
          — End —
        </p>
      )}
    </div>
  )
}
