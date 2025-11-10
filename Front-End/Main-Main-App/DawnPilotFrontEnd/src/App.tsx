
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './App.css'
import PropertiesPanel from './components/level-1/PropertiesPanel/PropertiesPanel'
import BuilderPage from './pages/BuilderPage/BuilderPage'

function App() {
  const queryClient = new QueryClient();
  return (
  <>
  <QueryClientProvider client={queryClient}>
  <PropertiesPanel modelName={'Box'} />
  <BuilderPage />
  </QueryClientProvider>
  </>
  )
}

export default App
