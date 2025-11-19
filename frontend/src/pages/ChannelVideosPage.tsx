import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getChannelVideos } from '../lib/api'
import { VideoGrid } from '../components/VideoGrid'

interface Video {
  videoId: string
  title: string
  uploader: string | null
  uploadDate: string | null
  durationSeconds: number | null
  thumbnailPath: string | null
  generatedThumbnail: string | null
}

interface Channel {
  uploaderId: string
  name: string
  videoCount: number
}

export function ChannelVideosPage() {
  const { uploaderId } = useParams<{ uploaderId: string }>()
  const [channel, setChannel] = useState<Channel | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [sort, setSort] = useState('uploadDate')

  useEffect(() => {
    if (uploaderId) {
      loadVideos()
    }
  }, [uploaderId, page, sort])

  const loadVideos = async () => {
    if (!uploaderId) return

    try {
      setLoading(true)
      setError(null)
      const response = await getChannelVideos(uploaderId, { page, limit: 40, sort })
      setChannel(response.channel)
      setVideos(response.videos)
      setTotalPages(response.pagination.pages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channel videos')
    } finally {
      setLoading(false)
    }
  }

  if (loading && !channel) {
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

  if (!channel) return null

  return (
    <div className="p-8">
      {/* Channel Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight mb-2">{channel.name}</h1>
            <div className="h-1 w-24 bg-red-600" />
            <p className="text-zinc-500 text-sm mt-2 font-mono">{channel.videoCount} videos</p>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-bold">SORT:</span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value)
                setPage(1)
              }}
              className="bg-zinc-900 border-2 border-zinc-800 px-4 py-2 text-sm font-bold focus:border-red-600 outline-none"
            >
              <option value="uploadDate">LATEST</option>
              <option value="title">TITLE</option>
              <option value="durationSeconds">DURATION</option>
            </select>
          </div>
        </div>
      </div>

      {/* Video Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="inline-block w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-zinc-400 font-bold">LOADING...</p>
          </div>
        </div>
      ) : (
        <VideoGrid videos={videos} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-12 flex items-center justify-center gap-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-6 py-3 bg-zinc-900 border-2 border-zinc-800 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-800 hover:border-red-600 transition-colors"
          >
            PREV
          </button>
          <span className="text-sm font-mono text-zinc-400">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-6 py-3 bg-zinc-900 border-2 border-zinc-800 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-800 hover:border-red-600 transition-colors"
          >
            NEXT
          </button>
        </div>
      )}
    </div>
  )
}
