// Lighthouse CI config. Named .cjs (not .js) because this workspace's
// package.json sets "type": "module", which would otherwise treat a .js file
// as ESM and reject the CommonJS module.exports below.
module.exports = {
  ci: {
    collect: {
      // Serve the built app ourselves. The CI job only runs `vite build`, so
      // without this the URL below hit a dead port and Lighthouse aborted with
      // CHROME_INTERSTITIAL ("server is not responding"). `vite preview` serves
      // dist/ on 4173 (preview.port in vite.config). The action runs from the
      // repo root, hence the --prefix.
      startServerCommand: 'npm --prefix frontend/studyhub-app run preview',
      startServerReadyPattern: 'Local:',
      startServerReadyTimeout: 30000,
      url: ['http://localhost:4173/'],
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.85 }],
        'categories:seo': ['warn', { minScore: 0.8 }],
        'first-contentful-paint': ['warn', { maxNumericValue: 2000 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 3000 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
}
