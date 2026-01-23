
import './App.css'
import { Routes, Route } from 'react-router-dom'
import BuilderPage from './pages/BuilderPage/BuilderPage'
import DesktopViewer from './pages/DesktopView/DesktopView'
import MobileViewer from './pages/MobileViewer/MobileViewer'
import ResearcherView from './pages/DesktopView/Researcher'
import ConnectPage from './pages/ConnectPage/ConnectPage'

function App() {
  return (
    <Routes>
      <Route path="/research" element={<ResearcherView />} />
      <Route path="/desktop" element={<DesktopViewer />} />
      <Route path="/mobile" element={<MobileViewer />} />
      <Route path="/builder" element={<BuilderPage />} />
      <Route path="/" element={<MobileViewer />} />

      <Route path="/connect" element={<ConnectPage />} />
    </Routes>
  )
}

export default App
