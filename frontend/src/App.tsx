import { useState } from 'react'
import { LibraryManager } from './components/LibraryManager'
import { ScanControls } from './components/ScanControls'
import { ScanProgress } from './components/ScanProgress'
import { ScanHistory } from './components/ScanHistory'
import { VideoStats } from './components/VideoStats'

function App() {
  const [isScanning, setIsScanning] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleScanStarted = () => {
    // Trigger a refresh of the UI
    setRefreshKey((k) => k + 1)
  }

  const handleScanComplete = () => {
    // Trigger a refresh when scan completes
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">YUI - YouTube Archive Browser</h1>
          <p className="text-sm text-gray-400 mt-1">Scanner Management</p>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
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
      </main>
    </div>
  )
}

export default App
