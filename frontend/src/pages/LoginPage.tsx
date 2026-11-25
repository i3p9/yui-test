import { useState, useRef, useEffect } from 'react'
import { Button, ErrorBanner, Field, Input, label } from '../components/ui'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

interface LoginPageProps {
  onLogin: (password: string) => Promise<void>
  error: string | null
}

export function LoginPage({ onLogin, error }: LoginPageProps) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useDocumentTitle('Sign in')

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-black p-4 text-white">
      <div className="fixed inset-x-0 top-0 h-0.5 bg-red-600" />
      <div className="w-full max-w-sm border-2 border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-3 border-b-2 border-zinc-800 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center bg-red-600 text-xl font-black">Y</span>
          <div>
            <h1 className="text-base font-black uppercase tracking-tight">YUI</h1>
            <p className={label}>Private archive</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <Field label="Password">
            <Input ref={inputRef} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" className="w-full" disabled={!password || loading}>
            {loading ? 'Checking…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
