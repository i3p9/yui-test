import { useEffect, useState } from 'react'
import { getLibraries } from '../lib/api'
import type { Library } from '../types'

export function LibraryList() {
  const [libraries, setLibraries] = useState<Library[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getLibraries()
      .then(setLibraries)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Libraries</h2>
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Libraries</h2>
        <p className="text-red-400">Error: {error}</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Libraries</h2>
      <div className="space-y-3">
        {libraries.map((lib, index) => (
          <div
            key={index}
            className={`p-4 rounded-lg border ${
              lib.skip
                ? 'bg-gray-700/30 border-gray-600'
                : 'bg-gray-700/50 border-gray-600'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{lib.name}</h3>
                  {lib.skip && (
                    <span className="text-xs px-2 py-1 bg-yellow-900/30 text-yellow-400 rounded">
                      Skipped
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 mt-1 font-mono">{lib.path}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Type: <span className="text-gray-400">{lib.mediaType}</span>
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {libraries.length === 0 && (
        <p className="text-gray-400 text-center py-8">No libraries configured</p>
      )}
    </div>
  )
}
