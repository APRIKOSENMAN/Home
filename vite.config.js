import { defineConfig } from 'vite'

export default defineConfig({
  // Development: Vite läuft auf Port 5173, leitet API-Anfragen an Express (Port 3000) weiter
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  // Production-Build: Ausgabe in dist/
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main:       './index.html',
        styleGuide: './style-guide.html'
      }
    }
  }
})
