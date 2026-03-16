import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins = [react()]

  if (mode === 'analyze') {
    const { visualizer } = await import('rollup-plugin-visualizer')
    plugins.push(visualizer({
      filename: 'dist/bundle-stats.html',
      gzipSize: true,
      brotliSize: true,
      open: false,
    }))
  }

  return {
    plugins,
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
  }
})
