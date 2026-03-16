import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === 'analyze'
      ? visualizer({
          filename: 'dist/bundle-stats.html',
          gzipSize: true,
          brotliSize: true,
          open: false,
        })
      : null,
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('\\react\\')
              || id.includes('/react/')
              || id.includes('\\react-dom\\')
              || id.includes('/react-dom/')
              || id.includes('\\react-router')
              || id.includes('/react-router')
            ) {
              return 'react-vendor'
            }

            if (
              id.includes('\\@sentry\\')
              || id.includes('/@sentry/')
              || id.includes('\\posthog-js\\')
              || id.includes('/posthog-js/')
            ) {
              return 'telemetry'
            }

            if (id.includes('\\dompurify\\') || id.includes('/dompurify/')) {
              return 'content-safety'
            }
          }

          return undefined
        },
      },
    },
  },
}))
