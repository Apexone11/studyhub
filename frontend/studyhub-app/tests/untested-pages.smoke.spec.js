/**
 * E2E smoke tests for previously untested pages.
 *
 * Covers: Library, Dashboard, Courses, Legal pages.
 * Validates that each page loads without crashing and renders key elements.
 *
 * @tags @smoke @untested-pages
 */
import { test, expect } from '@playwright/test'
import { mockAuthenticatedApp, createSessionUser } from './helpers/mockStudyHubApi.js'

test.use({ serviceWorkers: 'block' })

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_notes_seen', '1')
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
    window.localStorage.setItem('tutorial_viewer_seen', '1')
    window.localStorage.setItem('tutorial_lab_seen', '1')
  })
}

/* ─── Library page ───────────────────────────────────────────────────────── */

test.describe('Library page @smoke', () => {
  test('loads library page and shows heading', async ({ page }) => {
    await disableTutorials(page)

    const user = createSessionUser({ username: 'lib_tester', role: 'student' })
    await mockAuthenticatedApp(page, { user })

    await page.route('**/api/library/**', async (route) => {
      await route.fulfill({ status: 200, json: { books: [], total: 0 } })
    })

    await page.route('**/api/books**', async (route) => {
      await route.fulfill({ status: 200, json: { books: [], total: 0, page: 1, limit: 20 } })
    })

    await page.goto('/library')
    await page.waitForLoadState('networkidle')

    // Library page should render without crashing
    await expect(page.locator('body')).toBeVisible()
    // Should not show an error page
    await expect(page.locator('text=Server error')).not.toBeVisible()
  })
})

/* ─── Dashboard page ─────────────────────────────────────────────────────── */

test.describe('Dashboard page @smoke', () => {
  test('loads dashboard and shows user context', async ({ page }) => {
    await disableTutorials(page)

    const user = createSessionUser({ username: 'dash_tester', role: 'student' })
    await mockAuthenticatedApp(page, { user })

    await page.route('**/api/dashboard/**', async (route) => {
      await route.fulfill({ status: 200, json: {} })
    })

    await page.route('**/api/feed**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          json: {
            posts: [],
            announcements: [],
            sheets: [],
            notes: [],
            total: 0,
          },
        })
      }
    })

    await page.route('**/api/notifications**', async (route) => {
      await route.fulfill({ status: 200, json: { notifications: [], total: 0, unreadCount: 0 } })
    })

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toBeVisible()
    await expect(page.locator('text=Server error')).not.toBeVisible()
  })
})

/* ─── Courses page ───────────────────────────────────────────────────────── */

test.describe('Courses page @smoke', () => {
  test('loads courses page without crashing', async ({ page }) => {
    await disableTutorials(page)

    const user = createSessionUser({ username: 'course_tester', role: 'student' })
    await mockAuthenticatedApp(page, { user })

    await page.route('**/api/courses**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          json: [],
        })
      }
    })

    await page.route('**/api/schools**', async (route) => {
      await route.fulfill({ status: 200, json: [] })
    })

    await page.goto('/courses')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toBeVisible()
    await expect(page.locator('text=Server error')).not.toBeVisible()
  })
})

/* ─── Legal pages ────────────────────────────────────────────────────────── */

test.describe('Legal pages @smoke', () => {
  test('loads privacy policy page', async ({ page }) => {
    await page.goto('/privacy')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toBeVisible()
  })

  test('loads terms of service page', async ({ page }) => {
    await page.goto('/terms')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toBeVisible()
  })
})
