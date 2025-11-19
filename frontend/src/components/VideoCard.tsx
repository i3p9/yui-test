import { Link } from 'react-router-dom'
import { getThumbnailUrl } from '../lib/api'

interface VideoCardProps {
  video: {
    videoId: string
    title: string
    uploader: string | null
    uploadDate: string | null
    durationSeconds: number | null
    thumbnailPath: string | null
    generatedThumbnail: string | null
  }
  progress?: number // 0-100 percentage
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '0:00'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Unknown'
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
    return `${Math.floor(diffDays / 365)} years ago`
  } catch {
    return dateString
  }
}

export function VideoCard({ video, progress }: VideoCardProps) {
  const thumbnailUrl = getThumbnailUrl(video.generatedThumbnail || video.thumbnailPath)

  return (
    <Link to={`/watch/${video.videoId}`} className="group block">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-zinc-900 overflow-hidden border-2 border-zinc-800 group-hover:border-red-600 transition-colors">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-16 h-16 text-zinc-700" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}

        {/* Duration badge */}
        {video.durationSeconds && (
          <div className="absolute bottom-2 right-2 bg-black px-2 py-1 text-xs font-bold font-mono border border-zinc-700">
            {formatDuration(video.durationSeconds)}
          </div>
        )}

        {/* Progress bar */}
        {progress !== undefined && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
            <div
              className="h-full bg-red-600"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-3 space-y-1">
        <h3 className="font-bold text-sm leading-tight line-clamp-2 group-hover:text-red-500 transition-colors">
          {video.title}
        </h3>
        {video.uploader && (
          <p className="text-xs text-zinc-400 font-medium">
            {video.uploader}
          </p>
        )}
        {video.uploadDate && (
          <p className="text-xs text-zinc-500 font-mono">
            {formatDate(video.uploadDate)}
          </p>
        )}
      </div>
    </Link>
  )
}
