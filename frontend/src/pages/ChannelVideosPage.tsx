import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getChannelBannerUrl, getChannelVideos } from '../lib/api'
import { VideoGrid, FeedFooter } from '../components/VideoGrid'
import { ChannelAvatar } from '../components/ChannelCard'
import { Page, PageHeader, Spinner, ErrorBanner, Select } from '../components/ui'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import type { Channel } from '../types'

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

export function ChannelVideosPage() {
  const { uploaderId } = useParams<{ uploaderId: string }>()
  const [channel, setChannel] = useState<Channel | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [sort, setSort] = useState('uploadDate')

  useEffect(() => {
    if (uploaderId) loadVideos()
  }, [uploaderId, page, sort])

  const loadVideos = async () => {
    if (!uploaderId) return

    try {
      setLoading(true)
      setError(null)
      const response = await getChannelVideos(uploaderId, { page, limit: 40, sort })
      setChannel(response.channel)
      // Page 1 replaces the list (handles sort/channel changes); subsequent pages append
      setVideos((prev) => (page === 1 ? response.videos : [...prev, ...response.videos]))
      setHasMore(page < response.pagination.pages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channel videos')
    } finally {
      setLoading(false)
    }
  }

  useDocumentTitle(channel?.name)

  const sentinelRef = useInfiniteScroll(
    () => setPage((p) => p + 1),
    !loading && hasMore
  )

  if (error) {
    return <Page><ErrorBanner onRetry={loadVideos}>{error}</ErrorBanner></Page>
  }

  if (!channel) return <Page><Spinner label="Loading" /></Page>

  return (
    <Page>
      {channel.bannerPath && (
        <div className="mb-4 aspect-[6/1] overflow-hidden border-2 border-zinc-800 bg-zinc-950">
          <img
            src={getChannelBannerUrl(channel.uploaderId)}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <PageHeader
        icon={<ChannelAvatar channelId={channel.uploaderId} hasImage={!!(channel.avatarPath || channel.thumbnailPath)} className="h-9 w-9 md:h-10 md:w-10" />}
        title={<span className="normal-case">{channel.name}</span>}
        meta={`${channel.videoCount} videos`}
        actions={
          <Select
            aria-label="Sort videos"
            className="w-auto"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value)
              setPage(1) // reset to page 1 — loadVideos will replace the list
            }}
          >
            <option value="uploadDate">Latest</option>
            <option value="title">Title</option>
            <option value="durationSeconds">Duration</option>
          </Select>
        }
      />

      <VideoGrid videos={videos} loading={loading} hideChannel />
      <div ref={sentinelRef} />
      <FeedFooter loading={loading} hasMore={hasMore} count={videos.length} />
    </Page>
  )
}
