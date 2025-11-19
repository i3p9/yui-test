import { useState } from 'react'
import { LibraryManager } from '../components/LibraryManager'
import { ScanControls } from '../components/ScanControls'
import { ScanProgress } from '../components/ScanProgress'
import { ScanHistory } from '../components/ScanHistory'
import { VideoStats } from '../components/VideoStats'

export function ConfigurePage() {
  const [isScanning, setIsScanning] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleScanStarted = () => {
    setRefreshKey((k) => k + 1)
  }

  const handleScanComplete = () => {
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-black tracking-tight mb-2">SCANNER CONFIG</h1>
        <div className="h-1 w-24 bg-red-600" />
        <p className="text-zinc-500 text-sm mt-2">Manage library scanning and configuration</p>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          <ScanControls
            onScanStarted={handleScanStarted}
            isScanning={isScanning}
          />
          <ScanProgress
            key={`progress-${refreshKey}`}
            onScanComplete={handleScanComplete}
            onStatusChange={setIsScanning}
          />
          <VideoStats key={`stats-${refreshKey}`} />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <LibraryManager />
          <ScanHistory key={`history-${refreshKey}`} />
        </div>
      </div>
    </div>
  )
}
