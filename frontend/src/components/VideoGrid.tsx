import { VideoCard } from './VideoCard'

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

interface VideoGridProps {
  videos: Video[]
  progress?: Record<string, number> // videoId -> percentage
}

export function VideoGrid({ videos, progress }: VideoGridProps) {
  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <svg className="w-24 h-24 text-zinc-800 mb-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M21 3H3c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.11-.9-2-2-2zm0 14H3V5h18v12zm-5-6l-7 4V7z" />
        </svg>
        <p className="text-zinc-500 font-bold text-lg">NO VIDEOS FOUND</p>
        <p className="text-zinc-700 text-sm mt-2">Try scanning your library first</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
      {videos.map((video) => (
        <VideoCard
          key={video.videoId}
          video={video}
          progress={progress?.[video.videoId]}
        />
      ))}
    </div>
  )
}
