import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { ChannelsPage } from './pages/ChannelsPage'
import { ChannelVideosPage } from './pages/ChannelVideosPage'
import { LikedVideosPage } from './pages/LikedVideosPage'
import { WatchPage } from './pages/WatchPage'
import { ConfigurePage } from './pages/ConfigurePage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* All pages with layout */}
        <Route
          path="/*"
          element={
            <Layout>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/channels" element={<ChannelsPage />} />
                <Route path="/channels/:uploaderId" element={<ChannelVideosPage />} />
                <Route path="/liked" element={<LikedVideosPage />} />
                <Route path="/watch/:videoId" element={<WatchPage />} />
                <Route path="/configure" element={<ConfigurePage />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
