import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  build: {
    // Tek 900KB bundle yerine vendor chunk'larını ayır → paralel indirme, cache dostu
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'chart': ['chart.js', 'react-chartjs-2'],
          'socket': ['socket.io-client'],
        }
      }
    }
  }
})
