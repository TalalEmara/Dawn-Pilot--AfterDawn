import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [
    react(),
    basicSsl()
  ],
  server: {
    host: true,
    port: 5173,
    // ⬇️ THE MAGIC BRIDGE (PROXY) ⬇️
    proxy: {
      // 1. Forward Socket.io traffic to Flask (Port 5000)
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
        changeOrigin: true
      },
      // 2. Forward Scenario API requests to Flask (Port 5000)
      '/scenario': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      // 3. Forward AI Stream traffic to FastAPI (Port 8000)
      '/ws': {
        target: 'http://localhost:8000',
        ws: true,
        changeOrigin: true
      },
      '/api/configure_new': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
})