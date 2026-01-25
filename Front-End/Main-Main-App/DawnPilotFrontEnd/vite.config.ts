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
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
        changeOrigin: true
      },
      '/scenario': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/ws': {
        target: 'http://localhost:8000', // AI Stream
        ws: true,
        changeOrigin: true
      },
      // 👇 THIS IS THE CRITICAL PART FOR YOUR ERROR 👇
      '/api/configure_new': {
        target: 'http://localhost:8000', // Config API
        changeOrigin: true
      },
      // 👆 -------------------------------------- 👆
      '/api': {
        target: 'http://localhost:5000', // General API fallback
        changeOrigin: true
      }
    }
  }
})