import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/crawl-stream': { target: 'http://localhost:8000', changeOrigin: true },
      '/status': { target: 'http://localhost:8000', changeOrigin: true },
      '/filters': { target: 'http://localhost:8000', changeOrigin: true },
      '/download-excel': { target: 'http://localhost:8000', changeOrigin: true },
      '/download-zip': { target: 'http://localhost:8000', changeOrigin: true },
      '/download-file': { target: 'http://localhost:8000', changeOrigin: true },
      '/bridge': { target: 'http://localhost:8000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:8000', changeOrigin: true },
    }
  }
})
