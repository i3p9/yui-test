import { useCallback, useState } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { LibraryManager } from '../components/LibraryManager'
import { ScanControls } from '../components/ScanControls'
import { ScanProgress } from '../components/ScanProgress'
import { ScanHistory } from '../components/ScanHistory'
import { VideoStats } from '../components/VideoStats'
import MetadataManager from '../components/MetadataManager'
import { DangerZone } from '../components/DangerZone'
import { LikedVideoOrderImport } from '../components/LikedVideoOrderImport'
import ChannelImageManager from '../components/ChannelImageManager'
import { Collapsible, Page, PageHeader, Section, StatusBadge } from '../components/ui'

export function ConfigurePage() {
  useDocumentTitle('Config')
  const [isScanning, setIsScanning] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  return (
    <Page className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Config"
        actions={<StatusBadge tone={isScanning ? 'active' : 'neutral'}>{isScanning ? 'Scan running' : 'Idle'}</StatusBadge>}
      />

      <VideoStats key={`stats-${refreshKey}`} />

      <LibraryManager />

      <Section id="scanning" title="Scanning">
        <div className="grid gap-4 lg:grid-cols-2">
          <ScanControls onScanStarted={refresh} isScanning={isScanning} />
          <ScanProgress key={`progress-${refreshKey}`} onScanComplete={refresh} onStatusChange={setIsScanning} />
        </div>
      </Section>

      <ScanHistory key={`history-${refreshKey}`} />

      <div className="grid gap-4 lg:grid-cols-2">
        <MetadataManager key={`metadata-${refreshKey}`} />
        <ChannelImageManager />
      </div>

      <LikedVideoOrderImport />

      <Collapsible title={<span className="text-red-400">Danger zone</span>} summary="Reset database">
        <DangerZone key={`danger-${refreshKey}`} onReset={refresh} />
      </Collapsible>
    </Page>
  )
}
