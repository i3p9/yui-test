import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getChannelVideos, getChannels, getContinueWatching, getLatestVideos } from '../lib/api'
import { VideoGrid, FeedFooter } from '../components/VideoGrid'
import { VideoCard, type VideoCardData } from '../components/VideoCard'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { Page, ErrorBanner } from '../components/ui'
import type { Channel } from '../types'

const heading = 'mb-3 text-sm font-bold uppercase tracking-wide'

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`h-8 flex-shrink-0 whitespace-nowrap border-2 px-3 text-sm font-semibold transition-colors ${
        active ? 'border-white bg-white text-black' : 'border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-zinc-600'}`}>
      {children}
    </button>
  )
}

export function HomePage() {
  useDocumentTitle(null)
  const [params, setParams] = useSearchParams()
  const channelId = params.get('channel')
  const [channels, setChannels] = useState<Channel[]>([])
  const [resume, setResume] = useState<{ video: VideoCardData; percent: number }[]>([])
  const [videos, setVideos] = useState<VideoCardData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const request = useRef(0)

  useEffect(() => {
    getChannels()
      .then((r) => setChannels([...r.channels].sort((a, b) => (b.lastUploadDate ?? '').localeCompare(a.lastUploadDate ?? ''))))
      .catch(() => {})
    getContinueWatching(12).then((r) => setResume(r.items)).catch(() => {})
  }, [])

  // Switching the channel filter starts the list over.
  useEffect(() => { setVideos([]); setPage(1) }, [channelId])

  const loadVideos = async () => {
    const id = ++request.current // ignore responses from an older filter/page
    try {
      setLoading(true)
      setError(null)
      const response = channelId
        ? await getChannelVideos(channelId, { page, limit: 40, sort: 'uploadDate' })
        : await getLatestVideos({ page, limit: 40 })
      if (id !== request.current) return
      setVideos((prev) => (page === 1 ? response.videos : [...prev, ...response.videos]))
      setHasMore(page < response.pagination.pages)
    } catch (err) {
      if (id === request.current) setError(err instanceof Error ? err.message : 'Failed to load videos')
    } finally {
      if (id === request.current) setLoading(false)
    }
  }
  useEffect(() => { loadVideos() }, [page, channelId])

  const sentinelRef = useInfiniteScroll(() => setPage((p) => p + 1), !loading && hasMore)
  const selectChannel = (id: string | null) => setParams(id ? { channel: id } : {}, { replace: false })
  const selected = channels.find((c) => c.uploaderId === channelId)

  return (
    <Page>
      {channels.length > 1 && (
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6 [scrollbar-width:none]" role="toolbar" aria-label="Filter by channel">
          <Chip active={!channelId} onClick={() => selectChannel(null)}>All</Chip>
          {channels.map((c) => (
            <Chip key={c.uploaderId} active={c.uploaderId === channelId} onClick={() => selectChannel(c.uploaderId)}>{c.name}</Chip>
          ))}
        </div>
      )}

      {!channelId && resume.length > 0 && (
        <section className="mb-8" aria-labelledby="resume-title">
          <h2 id="resume-title" className={heading}>Continue watching</h2>
          <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6">
            {resume.map(({ video, percent }) => (
              <div key={video.videoId} className="w-64 flex-shrink-0 md:w-72">
                <VideoCard video={video} progress={percent} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="latest-title">
        <h2 id="latest-title" className={heading}>{selected ? selected.name : 'Latest uploads'}</h2>
        {error ? (
          <ErrorBanner onRetry={loadVideos}>{error}</ErrorBanner>
        ) : (
          <VideoGrid videos={videos} loading={loading} hideChannel={!!channelId} />
        )}
        <div ref={sentinelRef} />
        <FeedFooter loading={loading} hasMore={hasMore} count={videos.length} />
      </section>
    </Page>
  )
}
