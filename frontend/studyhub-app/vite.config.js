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
    resolve: {
      dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      css: false,
      restoreMocks: true,
      clearMocks: true,
      include: ['src/**/*.test.{js,jsx}'],
      exclude: ['tests/**'],
      server: {
        deps: {
          inline: [
            'react',
            'react-dom',
            'react-router',
            'react-router-dom',
            '@testing-library/react',
          ],
        },
      },
    },
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
              ) {
                return 'react-vendor'
              }

              if (
                id.includes('\\react-router')
                || id.includes('/react-router')
              ) {
                return 'router-vendor'
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

              if (id.includes('\\animejs\\') || id.includes('/animejs/')) {
                return 'animation'
              }
            }

            return undefined
          },
        },
      },
      reportCompressedSize: false,
      cssCodeSplit: true,
    },
  }
})
