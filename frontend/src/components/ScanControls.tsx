import { useState, useEffect } from 'react'
import { startScan } from '../lib/api'

interface ScanControlsProps {
  onScanStarted: () => void
  isScanning: boolean
}

export function ScanControls({ onScanStarted, isScanning }: ScanControlsProps) {
  const [mode, setMode] = useState<'full' | 'incremental'>('full')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Clear success message when scan stops
  useEffect(() => {
    if (!isScanning && success) {
      const timer = setTimeout(() => setSuccess(null), 2000)
      return () => clearTimeout(timer)
    }
  }, [isScanning, success])

  const handleStartScan = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await startScan({ mode })
      setSuccess(result.message)
      onScanStarted()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Scan Controls</h2>

      <div className="space-y-4">
        {/* Mode Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Scan Mode
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setMode('full')}
              disabled={isScanning}
              className={`flex-1 px-4 py-3 rounded-lg border transition-colors ${
                mode === 'full'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
              } ${isScanning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="font-medium">Full Scan</div>
              <div className="text-xs mt-1 opacity-80">
                Scan all videos and update metadata
              </div>
            </button>
            <button
              onClick={() => setMode('incremental')}
              disabled={isScanning}
              className={`flex-1 px-4 py-3 rounded-lg border transition-colors ${
                mode === 'incremental'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
              } ${isScanning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="font-medium">Incremental</div>
              <div className="text-xs mt-1 opacity-80">
                Only scan changed files
              </div>
            </button>
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStartScan}
          disabled={loading || isScanning}
          className={`w-full px-6 py-3 rounded-lg font-medium transition-colors ${
            loading || isScanning
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {loading ? 'Starting...' : isScanning ? 'Scan In Progress' : 'Start Scan'}
        </button>

        {/* Messages */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-green-900/30 border border-green-700 rounded-lg p-3">
            <p className="text-green-400 text-sm">{success}</p>
          </div>
        )}
      </div>
    </div>
  )
}
