import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins = [react()]

  if (mode === 'analyze') {
    const { visualizer } = await import('rollup-plugin-visualizer')
    plugins.push(
      visualizer({
        filename: 'dist/bundle-stats.html',
        gzipSize: true,
        brotliSize: true,
        open: false,
      }),
    )
  }

  return {
    plugins,
    resolve: {
      dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
    },
    server: {
      port: 5173,
      strictPort: true,
    },
    preview: {
      port: 4173,
      strictPort: true,
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
            // Inline animejs so vi.mock('animejs', ...) intercepts the
            // dynamic import inside src/lib/animations.js. Without this, the
            // package is externalized and mocks are bypassed.
            'animejs',
          ],
        },
      },
    },
    build: {
      // SECURITY: Never ship source maps to production.
      // Source maps expose your entire unminified source code in browser DevTools.
      // Every serious company (GitHub, Stripe, Netflix) disables this in production.
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // Core React runtime -- loaded on every page
              if (
                id.includes('\\react\\') ||
                id.includes('/react/') ||
                id.includes('\\react-dom\\') ||
                id.includes('/react-dom/')
              ) {
                return 'react-vendor'
              }

              // Router -- loaded on every page
              if (id.includes('\\react-router') || id.includes('/react-router')) {
                return 'router-vendor'
              }

              // Telemetry -- Sentry + PostHog (loaded async, non-blocking)
              if (
                id.includes('\\@sentry\\') ||
                id.includes('/@sentry/') ||
                id.includes('\\posthog-js\\') ||
                id.includes('/posthog-js/')
              ) {
                return 'telemetry'
              }

              // Rich text editor -- only needed on sheet creation/editing pages
              if (
                id.includes('\\@tiptap') ||
                id.includes('/@tiptap') ||
                id.includes('/prosemirror')
              ) {
                return 'editor'
              }

              // CodeMirror HTML editor -- only needed when editing raw HTML
              if (
                id.includes('\\@codemirror\\lang-html\\') ||
                id.includes('/@codemirror/lang-html/')
              ) {
                return 'codemirror-html'
              }

              if (id.includes('\\@lezer\\') || id.includes('/@lezer/')) {
                return 'codemirror-html'
              }

              if (
                id.includes('\\codemirror\\') ||
                id.includes('/codemirror/') ||
                id.includes('\\@codemirror\\') ||
                id.includes('/@codemirror/')
              ) {
                return 'codemirror-core'
              }

              // Charts -- only needed on feed/analytics pages
              if (id.includes('\\recharts') || id.includes('/recharts') || id.includes('/d3-')) {
                return 'charts'
              }

              // Real-time messaging -- only needed when user is authenticated
              if (
                id.includes('\\socket.io') ||
                id.includes('/socket.io') ||
                id.includes('/engine.io')
              ) {
                return 'realtime'
              }

              // Onboarding tour -- only on first visit
              if (id.includes('\\react-joyride') || id.includes('/react-joyride')) {
                return 'onboarding'
              }

              // Markdown parser -- only on pages that render markdown
              if (id.includes('\\marked') || id.includes('/marked')) {
                return 'markdown'
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
      // CSS minify disabled. lightningcss (Vite 8 / rolldown default) trips on
      // our concatenated @keyframes blocks from mobile/styles/motion.css with
      // "Unknown at rule: @keyframes" during minify. esbuild is only a peer-
      // optional with rolldown-vite and is not hoisted into node_modules, so
      // switching minifiers would require an explicit install. Tracked as tech
      // debt — revisit when lightningcss ships a fix or we decide to add
      // esbuild as a dep.
      cssMinify: false,
    },
  }
})
