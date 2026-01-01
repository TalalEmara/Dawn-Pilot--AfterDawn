
import './App.css'
import { Routes, Route } from 'react-router-dom'
import BuilderPage from './pages/BuilderPage/BuilderPage'
import DesktopViewer from './pages/DesktopView/DesktopView'
import MobileViewer from './pages/MobileViewer/MobileViewer'
import ResearcherView from './pages/DesktopView/Researcher'

function App() {
  return (
    <Routes>
      <Route path="/desktop" element={<ResearcherView />} />
      <Route path="/mobile" element={<MobileViewer />} />
      <Route path="/builder" element={<BuilderPage onModelSelect={function (modelName: string): void {
        throw new Error('Function not implemented.')
      } } />} />
      <Route path="/" element={<MobileViewer />} />
    </Routes>
  )
}

export default App
