import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getChannelAvatarUrl } from '../lib/api'

const PersonIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
  </svg>
)

/** Round channel avatar; falls back to a person icon when there is no image or it fails to load. */
export function ChannelAvatar({ channelId, hasImage = true, className }: { channelId: string; hasImage?: boolean; className: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={`flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800 ${className}`}>
      {hasImage && !failed
        ? <img src={getChannelAvatarUrl(channelId)} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        : <PersonIcon className="h-2/3 w-2/3 text-zinc-600" />}
    </div>
  )
}

export function ChannelCard({ channel }: {
  channel: { uploaderId: string; name: string; videoCount: number; avatarPath?: string | null; thumbnailPath?: string | null; lastUploadDate?: string | null }
}) {
  return (
    <Link to={`/channels/${channel.uploaderId}`}
      className="group flex items-center gap-3 border-2 border-zinc-800 bg-zinc-950 p-3 transition-colors hover:border-red-600">
      <ChannelAvatar channelId={channel.uploaderId} hasImage={!!(channel.avatarPath || channel.thumbnailPath)} className="h-12 w-12" />
      <div className="min-w-0">
        <h3 className="truncate text-sm font-bold transition-colors group-hover:text-red-500">{channel.name}</h3>
        <p className="mt-0.5 truncate font-mono text-xs text-zinc-500">
          {channel.videoCount} videos{channel.lastUploadDate ? ` · latest ${channel.lastUploadDate}` : ''}
        </p>
      </div>
    </Link>
  )
}
