
import './App.css'
import BuilderPage from './pages/BuilderPage/BuilderPage'
import MobileView from './pages/MobileView/MobileView'
import DesktopViewer from './pages/DesktopViewer/DesktopViewer'

function App() {
  // Simple routing based on URL path
  const path = window.location.pathname;
  
  if (path === '/desktop') {
    return <DesktopViewer />;
  } else if (path === '/builder') {
    return <BuilderPage />;
  }
  
  // Default to mobile view
  return <MobileView />;
}

export default App
