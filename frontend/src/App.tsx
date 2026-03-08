import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { ChannelsPage } from './pages/ChannelsPage'
import { ChannelVideosPage } from './pages/ChannelVideosPage'
import { LikedVideosPage } from './pages/LikedVideosPage'
import { WatchPage } from './pages/WatchPage'
import { ConfigurePage } from './pages/ConfigurePage'
import { SearchPage } from './pages/SearchPage'
import { LoginPage } from './pages/LoginPage'
import { getAuthStatus, login as apiLogin } from './lib/api'
import { getToken, setToken } from './lib/auth'
import { AUTH_EXPIRED_EVENT } from './lib/api'

// ─── Auth gate ────────────────────────────────────────────────────────────────
// Wraps the whole app. If auth is enabled and no valid token is in localStorage,
// the login page is shown instead of the app.
//
// Flow on load:
//   1. Check /api/auth/status (always public) — is auth even enabled?
//   2. If disabled → render app as normal
//   3. If enabled  → check for token in localStorage
//                  → if token exists → trust it (server will 401 if stale)
//                  → if no token    → show login page

function AuthGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true)
  const [authEnabled, setAuthEnabled] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  useEffect(() => {
    checkAuth()

    // Listen for any API call that returns 401 (token expired/revoked)
    const handleExpired = () => {
      setAuthenticated(false)
      setLoginError('Session expired. Please log in again.')
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired)
  }, [])

  const checkAuth = async () => {
    try {
      const { authEnabled } = await getAuthStatus()
      setAuthEnabled(authEnabled)

      if (!authEnabled) {
        // No password configured — open access
        setAuthenticated(true)
      } else if (getToken()) {
        // Token exists — trust it; the server will 401 on the first real request
        // if it's stale, which triggers the AUTH_EXPIRED_EVENT above
        setAuthenticated(true)
      }
    } catch {
      // Server unreachable — still show login rather than blank screen
      setAuthEnabled(true)
    } finally {
      setChecking(false)
    }
  }

  const handleLogin = async (password: string) => {
    setLoginError(null)
    try {
      const { token } = await apiLogin(password)
      setToken(token)
      setAuthenticated(true)
    } catch {
      setLoginError('Wrong password. Try again.')
    }
  }

  // Blank screen during the quick status check (avoids flash of login page)
  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (authEnabled && !authenticated) {
    return <LoginPage onLogin={handleLogin} error={loginError} />
  }

  return <>{children}</>
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <Routes>
          <Route
            path="/*"
            element={
              <Layout>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/channels" element={<ChannelsPage />} />
                  <Route path="/channels/:uploaderId" element={<ChannelVideosPage />} />
                  <Route path="/liked" element={<LikedVideosPage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/watch/:videoId" element={<WatchPage />} />
                  <Route path="/configure" element={<ConfigurePage />} />
                </Routes>
              </Layout>
            }
          />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  )
}

export default App
