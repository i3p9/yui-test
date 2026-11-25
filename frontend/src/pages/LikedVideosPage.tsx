import { useEffect, useState } from 'react'
import { getLikedVideos } from '../lib/api'
import { VideoGrid, FeedFooter } from '../components/VideoGrid'
import { Page, PageHeader, ErrorBanner, Select } from '../components/ui'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

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
  useDocumentTitle('Liked')
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

  return (
    <Page>
      <PageHeader
        title="Liked"
        actions={
          <Select
            aria-label="Sort order"
            className="w-auto"
            value={sort}
            onChange={(e) => handleSortChange(e.target.value as 'asc' | 'desc')}
          >
            <option value="desc">Newest liked first</option>
            <option value="asc">Oldest liked first</option>
          </Select>
        }
      />
      {error ? (
        <ErrorBanner onRetry={loadVideos}>{error}</ErrorBanner>
      ) : (
        <VideoGrid videos={videos} loading={loading} />
      )}
      <div ref={sentinelRef} />
      <FeedFooter loading={loading} hasMore={hasMore} count={videos.length} />
    </Page>
  )
}
