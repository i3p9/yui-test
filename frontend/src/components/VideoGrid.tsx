import { VideoCard, VideoCardSkeleton, type VideoCardData } from './VideoCard'
import { EmptyState, Spinner } from './ui'

interface VideoGridProps {
  videos: VideoCardData[]
  progress?: Record<string, number> // videoId -> percentage
  hideChannel?: boolean
  /** First load: show placeholder cards instead of the empty state. */
  loading?: boolean
}

export const gridClass = 'grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'

export function VideoGrid({ videos, progress, hideChannel, loading }: VideoGridProps) {
  if (loading && videos.length === 0) {
    return <div className={gridClass}>{Array.from({ length: 12 }, (_, i) => <VideoCardSkeleton key={i} />)}</div>
  }
  if (videos.length === 0) {
    return (
      <EmptyState
        title="No videos"
        icon={<svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3H3c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.11-.9-2-2-2zm0 14H3V5h18v12zm-5-6l-7 4V7z" /></svg>}
      >
        Add a library in Config and run a scan.
      </EmptyState>
    )
  }
  return (
    <div className={gridClass}>
      {videos.map((video) => (
        <VideoCard key={video.videoId} video={video} progress={progress?.[video.videoId]} hideChannel={hideChannel} />
      ))}
    </div>
  )
}

/** Below an infinitely scrolling grid: spinner while the next page loads, marker at the end. */
export function FeedFooter({ loading, hasMore, count }: { loading: boolean; hasMore: boolean; count: number }) {
  if (count === 0) return null
  if (loading) return <Spinner />
  if (hasMore) return null
  return <p className="py-10 text-center font-mono text-[11px] uppercase tracking-widest text-zinc-600">End · {count} videos</p>
}
