/**
 * visual-baseline.spec.js
 *
 * Captures reference screenshots of every important page/state across
 * three viewports (mobile 390×844, tablet 768×1024, desktop 1440×900) and two themes
 * (light, dark). Screenshots land in tests/screenshots/ and can be
 * reviewed via the generated gallery (see scripts/generate-gallery.js).
 *
 * Run:  npx playwright test visual-baseline --project=chromium
 * Tag:  @visual
 */
import { expect, test } from '@playwright/test'
import { mockAuthenticatedApp } from './helpers/mockStudyHubApi'

/* ─── Viewport × theme matrix ─────────────────────────────────────── */

const VIEWPORTS = [
  { tag: 'mobile', width: 390, height: 844 },
  { tag: 'tablet', width: 768, height: 1024 },
  { tag: 'desktop', width: 1440, height: 900 },
]

const THEMES = ['light', 'dark']

/* ─── Helpers ─────────────────────────────────────────────────────── */

function screenshotPath(page, theme, viewport) {
  return `screenshots/${page}--${theme}--${viewport}.png`
}

async function applyTheme(page, theme) {
  if (theme === 'dark') {
    // 1. Emulate OS-level dark preference so "system" fallback picks dark
    await page.emulateMedia({ colorScheme: 'dark' })

    // 2. Pre-seed localStorage for authenticated user (id=42) so the
    //    useBootstrapPreferences hook reads dark from cache immediately
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'studyhub_prefs_42',
        JSON.stringify({ theme: 'dark', fontSize: 'medium' })
      )
    })

    // 3. Mock the preferences API endpoint so the async fetch also returns dark
    await page.route('**/api/settings/preferences', async (route) => {
      await route.fulfill({
        status: 200,
        json: { theme: 'dark', fontSize: 'medium' },
      })
    })

    // 4. Belt-and-suspenders: set data-theme before any app JS runs
    await page.addInitScript(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
    })
  } else {
    await page.emulateMedia({ colorScheme: 'light' })
  }
}

async function disableTutorials(page) {
  await page.addInitScript(() => {
    // Suppress every useTutorial(pageKey) instance in the app
    const tutorialKeys = [
      'feed', 'sheets', 'viewer', 'upload', 'dashboard',
      'settings', 'profile', 'announcements', 'notes',
    ]
    for (const key of tutorialKeys) {
      window.localStorage.setItem(`tutorial_${key}_seen`, '1')
    }
    // Also suppress the separate upload tutorial key
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
  })
}

/** Suppress the "session expired" toast that fires when the fetch shim
 *  sees a 401 from /api/auth/me on public (unauthenticated) pages. */
async function suppressSessionExpiredToast(page) {
  await page.addInitScript(() => {
    // Intercept the custom event so the session context never shows the toast
    window.addEventListener('studyhub:auth-expired', (e) => {
      e.stopImmediatePropagation()
    }, { capture: true })
  })
}

async function waitForIdle(page) {
  await page.waitForLoadState('networkidle')
  // Small pause to let animations finish
  await page.waitForTimeout(400)
}

async function snap(page, name, theme, viewport) {
  await waitForIdle(page)

  // Final theme enforcement AFTER all app JS/hooks have settled.
  // This handles the case where useBootstrapPreferences or
  // resetAppearancePreferences overwrote the addInitScript attribute.
  if (theme === 'dark') {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
    })
    // Brief pause for CSS custom properties to repaint
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

/* ─── Public / unauthenticated pages ──────────────────────────────── */

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`[${vp.tag}][${theme}] public pages @visual`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } })

      test.beforeEach(async ({ page }) => {
        await applyTheme(page, theme)
        await suppressSessionExpiredToast(page)
        await disableTutorials(page)
        // Ensure unauthenticated
        await page.route('**/api/auth/me', async (route) => {
          await route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
        })
      })

      test('landing page', async ({ page }) => {
        await page.goto('/')
        await expect(page.locator('body')).toBeVisible()
        await snap(page, 'landing', theme, vp.tag)
      })

      test('login page', async ({ page }) => {
        await page.goto('/login')
        await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible()
        await snap(page, 'login', theme, vp.tag)
      })

      test('register step 1 (account)', async ({ page }) => {
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

      test('forgot password', async ({ page }) => {
        await page.goto('/forgot-password')
        await expect(page.getByRole('button', { name: /send|reset/i })).toBeVisible()
        await snap(page, 'forgot-password', theme, vp.tag)
      })

      test('about page', async ({ page }) => {
        await page.goto('/about')
        await expect(page.locator('body')).toBeVisible()
        await snap(page, 'about', theme, vp.tag)
      })

      test('terms page', async ({ page }) => {
        await page.goto('/terms')
        await expect(page.locator('body')).toBeVisible()
        await snap(page, 'terms', theme, vp.tag)
      })

      test('404 page', async ({ page }) => {
        await page.goto('/nonexistent-route-xyz')
        await expect(page.locator('body')).toBeVisible()
        await snap(page, '404', theme, vp.tag)
      })
    })
  }
}

/* ─── Authenticated pages ─────────────────────────────────────────── */

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`[${vp.tag}][${theme}] authenticated pages @visual`, () => {
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
        // Sheet viewer loads async — give extra time for the API mock to resolve
        await expect(page.getByRole('heading', { name: 'Algorithms Midterm Review' })).toBeVisible({ timeout: 10000 })
        await snap(page, 'sheet-viewer', theme, vp.tag)
      })

      test('upload sheet', async ({ page }) => {
        await mockAuthenticatedApp(page)
        await page.goto('/sheets/upload')
        await expect(page.locator('body')).toBeVisible()
        await snap(page, 'upload-sheet', theme, vp.tag)
      })

      test('notes', async ({ page }) => {
        await mockAuthenticatedApp(page)
        await page.goto('/notes')
        await expect(page.getByRole('heading', { name: 'My Notes' })).toBeVisible()
        await snap(page, 'notes', theme, vp.tag)
      })

      test('announcements', async ({ page }) => {
        await mockAuthenticatedApp(page)
        await page.goto('/announcements')
        await expect(page.getByRole('heading', { name: 'Announcements' })).toBeVisible()
        await snap(page, 'announcements', theme, vp.tag)
      })

      test('settings', async ({ page }) => {
        await mockAuthenticatedApp(page)
        await page.goto('/settings')
        await expect(page.getByText('Settings').first()).toBeVisible()
        await snap(page, 'settings', theme, vp.tag)
      })

      test('admin page', async ({ page }) => {
        await mockAuthenticatedApp(page)
        await page.goto('/admin')
        await expect(page.getByRole('heading', { name: 'Admin Overview' })).toBeVisible()
        await snap(page, 'admin', theme, vp.tag)
      })
    })

    /* ─── Critical states ───────────────────────────────────────────── */

    test.describe(`[${vp.tag}][${theme}] critical states @visual`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } })

      test.beforeEach(async ({ page }) => {
        await applyTheme(page, theme)
        await disableTutorials(page)
      })

      test('unverified user banner', async ({ page }) => {
        await mockAuthenticatedApp(page, {
          user: { emailVerified: false },
        })
        await page.route('**/api/dashboard/summary', async (route) => {
          await route.fulfill({
            status: 200,
            json: {
              hero: { username: 'regression_admin', createdAt: '2026-03-16T12:00:00.000Z', emailVerified: false },
              stats: { courseCount: 1, sheetCount: 2, starCount: 3 },
              courses: [{ id: 101, code: 'CMSC131', name: 'Object-Oriented Programming I', school: { id: 1, name: 'University of Maryland', short: 'UMD' } }],
              recentSheets: [],
            },
          })
        })
        await page.goto('/dashboard')
        await expect(page.getByText(/welcome back/i)).toBeVisible()
        await snap(page, 'unverified-banner', theme, vp.tag)
      })

      test('error state (dashboard 403)', async ({ page }) => {
        await mockAuthenticatedApp(page)
        await page.route('**/api/dashboard/summary', async (route) => {
          await route.fulfill({
            status: 403,
            json: { error: 'You do not have permission to view your dashboard.', code: 'FORBIDDEN' },
          })
        })
        await page.goto('/dashboard')
        await expect(page.getByText(/do not have permission/i)).toBeVisible()
        await snap(page, 'error-403', theme, vp.tag)
      })

      test('sheets empty state', async ({ page }) => {
        await mockAuthenticatedApp(page)
        await page.route('**/api/sheets?*', async (route) => {
          await route.fulfill({ status: 200, json: { sheets: [], total: 0 } })
        })
        await page.goto('/sheets')
        await expect(page.getByRole('heading', { name: 'Study Sheets' })).toBeVisible()
        await snap(page, 'sheets-empty', theme, vp.tag)
      })

    })
  }
}

/* ─── Mobile-only tests (no skip noise) ────────────────────────────── */

const MOBILE_VP = VIEWPORTS.find((v) => v.tag === 'mobile')

for (const theme of THEMES) {
  test.describe(`[mobile][${theme}] mobile-only states @visual`, () => {
    test.use({ viewport: { width: MOBILE_VP.width, height: MOBILE_VP.height } })

    test.beforeEach(async ({ page }) => {
      await applyTheme(page, theme)
      await disableTutorials(page)
    })

    test('mobile nav open', async ({ page }) => {
      await mockAuthenticatedApp(page)
      await page.goto('/feed')
      await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible()
      await page.getByRole('button', { name: 'Open navigation' }).click()
      await expect(page.getByRole('dialog', { name: 'Sidebar navigation' })).toBeVisible()
      await snap(page, 'mobile-nav-open', theme, 'mobile')
    })
  })
}
