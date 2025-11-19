import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getChannels } from '../lib/api'

interface Channel {
  uploaderId: string
  name: string
  videoCount: number
  lastUploadDate: string | null
  thumbnailPath: string | null
}

export function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadChannels()
  }, [])

  const loadChannels = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await getChannels()
      setChannels(response.channels)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channels')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
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

  if (channels.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-4xl font-black tracking-tight mb-2">CHANNELS</h1>
        <div className="h-1 w-24 bg-red-600 mb-8" />
        <div className="flex flex-col items-center justify-center py-20">
          <svg className="w-24 h-24 text-zinc-800 mb-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
          </svg>
          <p className="text-zinc-500 font-bold text-lg">NO CHANNELS FOUND</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-black tracking-tight mb-2">CHANNELS</h1>
        <div className="h-1 w-24 bg-red-600" />
        <p className="text-zinc-500 text-sm mt-2 font-mono">{channels.length} channels</p>
      </div>

      {/* Channels Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {channels.map((channel) => (
          <Link
            key={channel.uploaderId}
            to={`/channels/${channel.uploaderId}`}
            className="group block bg-zinc-900 border-2 border-zinc-800 hover:border-red-600 transition-colors p-6"
          >
            {/* Channel Avatar */}
            <div className="w-24 h-24 mx-auto mb-4 bg-zinc-800 border-2 border-zinc-700 group-hover:border-red-600 transition-colors flex items-center justify-center">
              <svg className="w-12 h-12 text-zinc-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
              </svg>
            </div>

            {/* Channel Info */}
            <h3 className="text-center font-bold text-sm mb-2 line-clamp-2 group-hover:text-red-500 transition-colors">
              {channel.name}
            </h3>
            <p className="text-center text-xs text-zinc-500 font-mono">
              {channel.videoCount} videos
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
