import { useState } from 'react'
import { LibraryManager } from '../components/LibraryManager'
import { ScanControls } from '../components/ScanControls'
import { ScanProgress } from '../components/ScanProgress'
import { ScanHistory } from '../components/ScanHistory'
import { VideoStats } from '../components/VideoStats'
import MetadataManager from '../components/MetadataManager'
import { DangerZone } from '../components/DangerZone'

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
    <div className="px-8 py-10">
      <section className="border-4 border-zinc-900 bg-zinc-950 px-6 py-8 shadow-[12px_12px_0_0_#09090b]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="text-xs font-mono tracking-[0.35em] text-zinc-600">SYSTEM // CONFIGURATION</span>
            <h1 className="mt-3 text-4xl font-black leading-none">SCANNER CONFIG</h1>
            <p className="mt-4 max-w-xl text-sm uppercase tracking-wide text-zinc-500">
              Manage library scanning, monitor progress, and keep the archive disciplined.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <span className="text-xs font-mono tracking-widest text-zinc-600">STATUS</span>
            <div
              className={`px-4 py-2 text-sm font-black tracking-widest border-2 ${
                isScanning
                  ? 'border-red-600 bg-red-950 text-red-400'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-200'
              }`}
            >
              {isScanning ? 'SCAN ACTIVE' : 'IDLE'}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-8">
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
          <MetadataManager key={`metadata-${refreshKey}`} />
        </div>

        <div className="space-y-8">
          <LibraryManager />
          <ScanHistory key={`history-${refreshKey}`} />
          <DangerZone
            key={`danger-${refreshKey}`}
            onReset={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      </div>
    </div>
  )
}
