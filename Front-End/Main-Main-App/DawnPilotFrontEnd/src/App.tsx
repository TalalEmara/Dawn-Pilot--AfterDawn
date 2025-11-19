import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import './App.css'
import PropertiesPanel from './components/level-1/PropertiesPanel/PropertiesPanel'
import BuilderPage from './pages/BuilderPage/BuilderPage'

function App() {
  const queryClient = new QueryClient();
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  return (
    <>
      <QueryClientProvider client={queryClient}>
        {/* Show properties panel only when a model is selected */}
        {selectedModel && (
          <PropertiesPanel 
            modelName={selectedModel} 
            onClose={() => setSelectedModel(null)}
          />
        )}
        <BuilderPage onModelSelect={setSelectedModel} />
      </QueryClientProvider>
    </>
  )
}

export default App