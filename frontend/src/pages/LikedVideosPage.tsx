import { useEffect, useState } from 'react'
import { getLikedVideos } from '../lib/api'
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

export function LikedVideosPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [sort, setSort] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    loadVideos()
  }, [page, sort])

  const loadVideos = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await getLikedVideos({ page, limit: 40, sort })
      // Page 1 replaces the list (handles sort changes); subsequent pages append
      setVideos((prev) => (page === 1 ? response.videos : [...prev, ...response.videos]))
      setHasMore(page < response.pagination.pages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load liked videos')
    } finally {
      setLoading(false)
    }
  }

  const handleSortChange = (newSort: 'asc' | 'desc') => {
    setSort(newSort)
    setPage(1) // reset to page 1 — loadVideos will replace the list, not append
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
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight mb-2 flex items-center gap-3">
            <svg className="w-10 h-10 text-red-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            LIKED
          </h1>
          <div className="h-1 w-24 bg-red-600" />
        </div>

        <select
          value={sort}
          onChange={(e) => handleSortChange(e.target.value as 'asc' | 'desc')}
          className="border-2 border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-mono uppercase tracking-widest text-zinc-300 hover:border-zinc-500 focus:border-red-600 focus:outline-none transition-colors cursor-pointer"
        >
          <option value="desc">Newest First</option>
          <option value="asc">Oldest First</option>
        </select>
      </div>

      {/* Video Grid */}
      <VideoGrid videos={videos} />

      {/* Sentinel — observed by IntersectionObserver to trigger next page load */}
      <div ref={sentinelRef} />

      {/* Loading spinner for subsequent pages */}
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
