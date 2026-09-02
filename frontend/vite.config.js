import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Treat warnings as warnings only, not errors — prevents Vercel build failures
    // from unused variables, unused imports etc.
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress unused variable warnings that break Vercel builds
        if (warning.code === 'UNUSED_EXTERNAL_IMPORT') return
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
        warn(warning)
      }
    }
  },
  esbuild: {
    // Don't fail on unused variables or unused imports
    logOverride: {
      'this-is-undefined-in-esm': 'silent',
    },
    legalComments: 'none',
  },
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
