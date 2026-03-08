import { useState, useRef, useEffect } from 'react'

interface LoginPageProps {
  onLogin: (password: string) => Promise<void>
  error: string | null
}

export function LoginPage({ onLogin, error }: LoginPageProps) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || loading) return
    setLoading(true)
    await onLogin(password)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">

      {/* Top accent line */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-red-600" />

      {/* Card */}
      <div className="w-full max-w-sm border-4 border-zinc-800 bg-zinc-950 shadow-[12px_12px_0_0_#18181b]">

        {/* Header */}
        <div className="border-b-4 border-zinc-800 px-8 py-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 font-black text-4xl mb-4 shadow-[6px_6px_0_0_#991b1b]">
            Y
          </div>
          <p className="text-xs font-mono tracking-[0.4em] text-zinc-500 mb-1">
            PRIVATE ARCHIVE
          </p>
          <h1 className="text-2xl font-black tracking-tight">
            WHO GOES THERE
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4">

          {/* Error */}
          {error && (
            <div className="border-2 border-red-600 bg-red-950 px-4 py-3">
              <p className="text-xs font-mono uppercase tracking-widest text-red-300">
                ✗ {error}
              </p>
            </div>
          )}

          {/* Password field */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-[0.3em] text-zinc-500 mb-2">
              Password
            </label>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="············"
              className="w-full bg-zinc-900 border-2 border-zinc-700 focus:border-red-600 outline-none px-4 py-3 font-mono text-lg tracking-widest placeholder-zinc-700 transition-colors"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!password || loading}
            className={`w-full border-4 px-6 py-4 font-black uppercase tracking-[0.4em] text-sm transition-all ${
              !password || loading
                ? 'border-zinc-800 bg-zinc-900 text-zinc-600 cursor-not-allowed'
                : 'border-red-600 bg-red-600 text-white hover:bg-red-500 hover:border-red-500 shadow-[4px_4px_0_0_#991b1b] hover:shadow-[2px_2px_0_0_#991b1b] hover:translate-x-[2px] hover:translate-y-[2px]'
            }`}
          >
            {loading ? 'CHECKING...' : 'ENTER'}
          </button>
        </form>

        {/* Footer */}
        <div className="border-t-4 border-zinc-800 px-8 py-4 text-center">
          <p className="text-xs font-mono text-zinc-700 tracking-widest">
            YUI // PERSONAL VIDEO ARCHIVE
          </p>
        </div>
      </div>

      {/* Bottom accent */}
      <div className="fixed bottom-0 left-0 right-0 h-1 bg-zinc-900" />
    </div>
  )
}
