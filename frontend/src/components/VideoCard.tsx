import { Link } from 'react-router-dom'
import { getThumbnailUrl } from '../lib/api'
import { formatDuration, formatFullDate, formatUploadDate } from '../utils/format'
import { ChannelAvatar } from './ChannelCard'

export interface VideoCardData {
  videoId: string
  title: string
  uploader: string | null
  uploaderId?: string | null
  uploadDate: string | null
  durationSeconds: number | null
  thumbnailPath: string | null
  hasThumbnails?: boolean | null
  thumbnailSource?: string | null
}

interface VideoCardProps {
  video: VideoCardData
  progress?: number // 0-100 percentage
  hideChannel?: boolean // e.g. on a channel's own page
}

export function VideoCard({ video, progress, hideChannel = false }: VideoCardProps) {
  // Backend falls back to the original image when no optimized thumbnail exists.
  const thumbnailUrl = video.hasThumbnails || video.thumbnailPath ? getThumbnailUrl(video.videoId, 'small') : null
  const showAvatar = !hideChannel && !!video.uploaderId

  return (
    <Link to={`/watch/${video.videoId}`} className="group block min-w-0">
      <div className="relative aspect-video overflow-hidden border-2 border-zinc-800 bg-zinc-900 transition-colors group-hover:border-red-600">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg className="h-10 w-10 text-zinc-700" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          </div>
        )}
        {!!video.durationSeconds && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/85 px-1 py-px font-mono text-[11px] font-bold">
            {formatDuration(video.durationSeconds)}
          </span>
        )}
        {progress !== undefined && progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-zinc-700/80">
            <div className="h-full bg-red-600" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      <div className="mt-2 flex gap-2.5">
        {showAvatar && <ChannelAvatar channelId={video.uploaderId!} className="mt-0.5 h-8 w-8" />}
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug transition-colors group-hover:text-red-500" title={video.title}>
            {video.title}
          </h3>
          {!hideChannel && video.uploader && <p className="mt-0.5 truncate text-xs text-zinc-400">{video.uploader}</p>}
          {video.uploadDate && (
            <p className="mt-0.5 text-xs text-zinc-500" title={formatFullDate(video.uploadDate)}>{formatUploadDate(video.uploadDate)}</p>
          )}
        </div>
      </div>
    </Link>
  )
}

/** Placeholder with the same footprint as a VideoCard. */
export function VideoCardSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="aspect-video animate-pulse bg-zinc-900" />
      <div className="mt-2 flex gap-2.5">
        <div className="h-8 w-8 flex-shrink-0 animate-pulse rounded-full bg-zinc-900" />
        <div className="flex-1 space-y-1.5 pt-0.5">
          <div className="h-3.5 w-11/12 animate-pulse bg-zinc-900" />
          <div className="h-3 w-1/2 animate-pulse bg-zinc-900" />
        </div>
      </div>
    </div>
  )
}
