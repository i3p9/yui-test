import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Plyr from 'plyr-react'
import 'plyr-react/plyr.css'
import {
  getVideo,
  getStreamUrl,
  getRelatedVideos,
  getVideoNavigation,
  updateWatchProgress,
  getWatchProgress,
  getThumbnailUrl,
} from '../lib/api'

interface Video {
  videoId: string
  title: string
  uploader: string | null
  uploadDate: string | null
  durationSeconds: number | null
  description: string | null
  uploaderId: string | null
  thumbnailPath: string | null
  hasThumbnails?: boolean | null
  thumbnailSource?: string | null
}

interface RelatedVideo extends Video {}

export function WatchPage() {
  const { videoId } = useParams<{ videoId: string }>()
  const navigate = useNavigate()
  const playerRef = useRef<any>(null)

  const [video, setVideo] = useState<Video | null>(null)
  const [relatedVideos, setRelatedVideos] = useState<RelatedVideo[]>([])
  const [prevVideo, setPrevVideo] = useState<Video | null>(null)
  const [nextVideo, setNextVideo] = useState<Video | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showFullDescription, setShowFullDescription] = useState(false)

  useEffect(() => {
    if (videoId) {
      loadVideo()
      loadRelated()
      loadNavigation()
    }
  }, [videoId])

  const loadVideo = async () => {
    if (!videoId) return

    try {
      setLoading(true)
      setError(null)
      const data = await getVideo(videoId)
      setVideo(data)

      // Load watch progress
      const progressData = await getWatchProgress(videoId)
      if (progressData.progress && playerRef.current?.plyr) {
        const player = playerRef.current.plyr
        player.currentTime = progressData.progress.positionSeconds
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load video')
    } finally {
      setLoading(false)
    }
  }

  const loadRelated = async () => {
    if (!videoId) return
    try {
      const data = await getRelatedVideos(videoId, 20)
      setRelatedVideos(data.videos)
    } catch (err) {
      console.error('Failed to load related videos:', err)
    }
  }

  const loadNavigation = async () => {
    if (!videoId) return
    try {
      const data = await getVideoNavigation(videoId)
      setPrevVideo(data.prev)
      setNextVideo(data.next)
    } catch (err) {
      console.error('Failed to load navigation:', err)
    }
  }

  const saveProgress = async () => {
    if (!videoId || !playerRef.current?.plyr) return
    const player = playerRef.current.plyr
    try {
      await updateWatchProgress(
        videoId,
        Math.floor(player.currentTime),
        Math.floor(player.duration || 0)
      )
    } catch (err) {
      console.error('Failed to save progress:', err)
    }
  }

  const handleTimeUpdate = () => {
    // Save progress every 5 seconds
    if (playerRef.current?.plyr) {
      const player = playerRef.current.plyr
      if (Math.floor(player.currentTime) % 5 === 0) {
        saveProgress()
      }
    }
  }

  const handlePause = () => {
    saveProgress()
  }

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Unknown date'
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    } catch {
      return dateString
    }
  }

  if (loading && !video) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-zinc-400 font-bold">LOADING...</p>
        </div>
      </div>
    )
  }

  if (error || !video || !videoId) {
    return (
      <div className="p-8">
        <div className="bg-red-950 border-2 border-red-600 p-6">
          <p className="text-red-400 font-bold">ERROR: {error || 'Video not found'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden bg-black">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Video Player */}
        <div className="bg-black p-6">
          <div className="w-full aspect-video bg-zinc-900">
            <Plyr
              ref={playerRef}
              source={{
                type: 'video',
                sources: [
                  {
                    src: getStreamUrl(videoId),
                    type: 'video/mp4',
                  },
                ],
              }}
              options={{
                controls: [
                  'play-large',
                  'play',
                  'progress',
                  'current-time',
                  'duration',
                  'mute',
                  'volume',
                  'settings',
                  'fullscreen',
                ],
                keyboard: { focused: true, global: true },
                autoplay: true,
              }}
              onTimeUpdate={handleTimeUpdate}
              onPause={handlePause}
            />
          </div>
        </div>

        {/* Video Info */}
        <div className="p-6 space-y-6">
          {/* Title */}
          <div>
            <h1 className="text-2xl font-black mb-2 text-white">{video.title}</h1>
            <div className="h-1 w-16 bg-red-600" />
          </div>

          {/* Meta Info */}
          <div className="flex items-center gap-4 text-sm">
            {video.uploader && (
              <Link
                to={video.uploaderId ? `/channels/${video.uploaderId}` : '#'}
                className="font-bold text-white hover:text-red-500 transition-colors"
              >
                {video.uploader}
              </Link>
            )}
            <span className="text-zinc-400 font-mono">{formatDate(video.uploadDate)}</span>
          </div>

          {/* Navigation Buttons */}
          <div className="flex gap-4">
            {prevVideo && (
              <button
                onClick={() => navigate(`/watch/${prevVideo.videoId}`)}
                className="flex-1 bg-zinc-900 border-2 border-zinc-800 hover:border-red-600 p-4 text-left transition-colors"
              >
                <div className="text-xs text-zinc-500 font-bold mb-1">PREVIOUS</div>
                <div className="text-sm font-bold line-clamp-2 text-white">{prevVideo.title}</div>
              </button>
            )}
            {nextVideo && (
              <button
                onClick={() => navigate(`/watch/${nextVideo.videoId}`)}
                className="flex-1 bg-zinc-900 border-2 border-zinc-800 hover:border-red-600 p-4 text-left transition-colors"
              >
                <div className="text-xs text-zinc-500 font-bold mb-1">NEXT</div>
                <div className="text-sm font-bold line-clamp-2 text-white">{nextVideo.title}</div>
              </button>
            )}
          </div>

          {/* Description */}
          {video.description && (
            <div className="bg-zinc-900 border-2 border-zinc-800 p-4">
              <div
                className={`text-sm text-zinc-300 whitespace-pre-wrap ${
                  !showFullDescription ? 'line-clamp-3' : ''
                }`}
              >
                {video.description}
              </div>
              {video.description.length > 200 && (
                <button
                  onClick={() => setShowFullDescription(!showFullDescription)}
                  className="text-xs font-bold text-red-500 mt-2 hover:text-red-400"
                >
                  {showFullDescription ? 'SHOW LESS' : 'SHOW MORE'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Related Videos Sidebar */}
      <aside className="w-96 bg-zinc-950 border-l-4 border-zinc-900 overflow-y-auto flex-shrink-0">
        <div className="p-4">
          <h2 className="text-lg font-black mb-4 text-white">RELATED</h2>
          <div className="space-y-4">
            {relatedVideos.map((relatedVideo) => (
              <Link
                key={relatedVideo.videoId}
                to={`/watch/${relatedVideo.videoId}`}
                className="flex gap-3 group"
              >
                {/* Thumbnail */}
                <div className="w-40 aspect-video bg-zinc-900 border-2 border-zinc-800 group-hover:border-red-600 transition-colors flex-shrink-0 overflow-hidden">
                  {(relatedVideo.hasThumbnails || relatedVideo.thumbnailPath) ? (
                    <img
                      src={getThumbnailUrl(relatedVideo.videoId, 'small')}
                      alt={relatedVideo.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-zinc-700" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold line-clamp-2 mb-1 text-white group-hover:text-red-500 transition-colors">
                    {relatedVideo.title}
                  </h3>
                  {relatedVideo.uploader && (
                    <p className="text-xs text-zinc-400 font-medium">{relatedVideo.uploader}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}
