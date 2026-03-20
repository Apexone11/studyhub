/**
 * visual-smoke.spec.js
 *
 * Fast 6-page smoke suite for quick visual checks during heavy refactoring.
 * Captures: login, register, dashboard, feed, sheets, sheet viewer.
 * Runs across all 3 viewports (mobile, tablet, desktop) × 2 themes.
 *
 * Run:  npx playwright test visual-smoke --project=chromium
 * Tag:  @visual-smoke
 *
 * Use this while iterating on design changes. Run the full visual-baseline
 * suite before marking a sprint as complete.
 */
import { expect, test } from '@playwright/test'
import { mockAuthenticatedApp } from './helpers/mockStudyHubApi'

const VIEWPORTS = [
  { tag: 'mobile', width: 390, height: 844 },
  { tag: 'tablet', width: 768, height: 1024 },
  { tag: 'desktop', width: 1440, height: 900 },
]

const THEMES = ['light', 'dark']

function screenshotPath(page, theme, viewport) {
  return `screenshots/${page}--${theme}--${viewport}.png`
}

async function applyTheme(page, theme) {
  if (theme === 'dark') {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'studyhub_prefs_42',
        JSON.stringify({ theme: 'dark', fontSize: 'medium' })
      )
    })
    await page.route('**/api/settings/preferences', async (route) => {
      await route.fulfill({
        status: 200,
        json: { theme: 'dark', fontSize: 'medium' },
      })
    })
    await page.addInitScript(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
    })
  } else {
    await page.emulateMedia({ colorScheme: 'light' })
  }
}

async function disableTutorials(page) {
  await page.addInitScript(() => {
    const tutorialKeys = [
      'feed', 'sheets', 'viewer', 'upload', 'dashboard',
      'settings', 'profile', 'announcements', 'notes',
    ]
    for (const key of tutorialKeys) {
      window.localStorage.setItem(`tutorial_${key}_seen`, '1')
    }
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
  })
}

async function suppressSessionExpiredToast(page) {
  await page.addInitScript(() => {
    window.addEventListener('studyhub:auth-expired', (e) => {
      e.stopImmediatePropagation()
    }, { capture: true })
  })
}

async function waitForIdle(page) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
}

async function snap(page, name, theme, viewport) {
  await waitForIdle(page)
  if (theme === 'dark') {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
    })
    await page.waitForTimeout(150)
  } else {
    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-theme')
    })
    await page.waitForTimeout(50)
  }
  await page.screenshot({
    path: `tests/${screenshotPath(name, theme, viewport)}`,
    fullPage: true,
  })
}

/* ─── Public smoke pages ─────────────────────────────────────────── */

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`[${vp.tag}][${theme}] smoke public @visual-smoke`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } })

      test.beforeEach(async ({ page }) => {
        await applyTheme(page, theme)
        await suppressSessionExpiredToast(page)
        await disableTutorials(page)
        await page.route('**/api/auth/me', async (route) => {
          await route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
        })
      })

      test('login page', async ({ page }) => {
        await page.goto('/login')
        await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible()
        await snap(page, 'login', theme, vp.tag)
      })

      test('register step 1', async ({ page }) => {
        await page.route('**/api/courses/schools', async (route) => {
          await route.fulfill({
            status: 200,
            json: [{
              id: 1,
              name: 'University of Maryland',
              short: 'UMD',
              courses: [{ id: 101, code: 'CMSC131', name: 'Object-Oriented Programming I', school: { id: 1, name: 'University of Maryland', short: 'UMD' } }],
            }],
          })
        })
        await page.goto('/register')
        await expect(page.getByText(/create.*account|sign up/i).first()).toBeVisible()
        await snap(page, 'register-step1', theme, vp.tag)
      })
    })
  }
}

/* ─── Authenticated smoke pages ──────────────────────────────────── */

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`[${vp.tag}][${theme}] smoke authenticated @visual-smoke`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } })

      test.beforeEach(async ({ page }) => {
        await applyTheme(page, theme)
        await disableTutorials(page)
      })

      test('dashboard', async ({ page }) => {
        await mockAuthenticatedApp(page)
        await page.goto('/dashboard')
        await expect(page.getByText(/welcome back/i)).toBeVisible()
        await snap(page, 'dashboard', theme, vp.tag)
      })

      test('feed', async ({ page }) => {
        await mockAuthenticatedApp(page)
        await page.goto('/feed')
        await expect(page.getByRole('button', { name: 'Post', exact: true })).toBeVisible()
        await snap(page, 'feed', theme, vp.tag)
      })

      test('sheets page', async ({ page }) => {
        await mockAuthenticatedApp(page)
        await page.goto('/sheets')
        await expect(page.getByRole('heading', { name: 'Study Sheets' })).toBeVisible()
        await snap(page, 'sheets', theme, vp.tag)
      })

      test('sheet viewer', async ({ page }) => {
        await mockAuthenticatedApp(page)
        await page.goto('/sheets/501')
        await expect(page.getByRole('heading', { name: 'Algorithms Midterm Review' })).toBeVisible({ timeout: 10000 })
        await snap(page, 'sheet-viewer', theme, vp.tag)
      })
    })
  }
}
