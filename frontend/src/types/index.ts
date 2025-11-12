// API Response Types

export interface HealthResponse {
  status: string
  message: string
  timestamp: string
}

export interface Library {
  path: string
  mediaType: string
  name: string
  skip?: boolean
}

export interface Config {
  libraries: Library[]
  thumbnailDir: string
  databaseUrl: string
  scanOptions: {
    parallelism: number
    followSymlinks: boolean
    generateThumbnails: boolean
    thumbnailConcurrency: number
  }
}

export interface ScanProgress {
  isRunning: boolean
  scanId?: number
  startedAt?: string
  libraryPath?: string
  mode?: 'full' | 'incremental'
  currentLibrary?: string
  videosScanned: number
  videosAdded: number
  videosUpdated: number
  errors: string[]
}

export interface ScanLog {
  id: number
  startedAt: string
  endedAt: string | null
  status: 'running' | 'completed' | 'failed'
  libraryPath: string | null
  mode: 'full' | 'incremental'
  videosScanned: number | null
  videosAdded: number | null
  videosUpdated: number | null
  videosRemoved: number | null
  errors: string | null
}

export interface VideoStats {
  totalVideos: number
  byType: Array<{
    mediaType: string
    count: number
  }>
  totalSizeBytes: number
}

export interface Video {
  videoId: string
  title: string
  uploader: string | null
  uploadDate: string | null
  durationSeconds: number | null
  thumbnailPath: string | null
  generatedThumbnail: string | null
  resolution: string | null
  metadataSource: string
  hasCompleteMetadata: boolean
  filesizeBytes: number | null
  lastScannedAt: string
}

export interface VideoDetails extends Video {
  uploaderId: string | null
  description: string | null
  tags: string | null
  mediaType: string
  libraryPath: string
  videoPath: string
  videoCodec: string | null
  audioCodec: string | null
  infoJsonMtime: string | null
  mediaMtime: string | null
  missingOnDisk: boolean
  firstSeenAt: string
  subtitles: Array<{
    id: number
    videoId: string
    language: string
    kind: string
    path: string
    filesizeBytes: number
  }>
  watchProgress: {
    id: number
    videoId: string
    positionSeconds: number
    totalSeconds: number
    completed: boolean
    lastWatchedAt: string
  } | null
}

export interface PaginatedVideos {
  videos: Video[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}
