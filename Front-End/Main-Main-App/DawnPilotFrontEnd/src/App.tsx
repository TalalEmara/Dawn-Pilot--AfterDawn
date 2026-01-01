
import './App.css'
import { Routes, Route } from 'react-router-dom'
import BuilderPage from './pages/BuilderPage/BuilderPage'
import DesktopViewer from './pages/DesktopView/DesktopView'
import MobileViewer from './pages/MobileViewer/MobileViewer'

function App() {
  return (
    <Routes>
      <Route path="/desktop" element={<DesktopViewer />} />
      <Route path="/mobile" element={<MobileViewer />} />
      <Route path="/builder" element={<BuilderPage />} />
      <Route path="/" element={<MobileViewer />} />
    </Routes>
  )
}

export default App
