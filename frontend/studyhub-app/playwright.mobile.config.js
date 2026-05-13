/**
 * playwright.mobile.config.js — dedicated config for mobile-viewport E2E.
 *
 * Spawns the same Vite dev server as `playwright.config.js` but pins the
 * browser context to an iPhone 13/14 Pro viewport with mobile UA and
 * `isMobile + hasTouch` so media queries / touch handlers exercise the
 * same code path real phones see.
 *
 * Add a second project for tablet (iPad Air-ish) so the same test
 * surface is exercised at a wider breakpoint. Tablet runs are opt-in
 * via `--project tablet` — phone is the default project.
 *
 * Tests in `tests/mobile/` are tagged `@mobile`; filter with
 *   npx playwright test --config=playwright.mobile.config.js --grep @mobile
 *
 * Loop M21 — see docs/internal/audits/2026-05-13-loop-M21-mobile-e2e.md
 */
import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const IPHONE_13_PRO_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

export default defineConfig({
  testDir: './tests/mobile',
  testMatch: ['**/*.mobile.spec.js'],
  testIgnore: ['**/*.beta-live.spec.js'],
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'phone',
      use: {
        ...devices['iPhone 13 Pro'],
        // Explicit override even though `devices['iPhone 13 Pro']` already
        // sets these — keeps the contract obvious to anyone reading the
        // config and survives any future Playwright device-table changes.
        viewport: { width: 390, height: 844 },
        userAgent: IPHONE_13_PRO_UA,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
    {
      name: 'tablet',
      use: {
        ...devices['iPad (gen 7)'],
        viewport: { width: 820, height: 1180 },
        // iPad Air UA — same WebKit family, different form factor.
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
