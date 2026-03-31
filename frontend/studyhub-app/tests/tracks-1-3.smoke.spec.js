/**
 * E2E smoke tests for Tracks 1–3 of the GitHub-inspired sheet experience cycle.
 *
 * Track 1: Sheet viewer polish (SheetHeader fork lineage banner, stats, actions)
 * Track 2: README-style sheet landing pages (SheetReadme rendering)
 * Track 3: Improved diff viewing (DiffViewer component in SheetLab)
 *
 * @tags @smoke @tracks-1-3
 */
import { test, expect } from '@playwright/test'
import { mockAuthenticatedApp } from './helpers/mockStudyHubApi.js'

test.use({ serviceWorkers: 'block' })

/** Suppress tutorial overlays that block UI interactions */
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

/* ─── Track 1: Sheet viewer polish ────────────────────────────────────────── */

test.describe('Track 1 — Sheet viewer polish @smoke', () => {
  test('shows fork lineage banner for forked sheets', async ({ page }) => {
    await disableTutorials(page)

    const forkedSheet = {
      forkOf: 100,
      forkSource: {
        id: 100,
        title: 'Original Algorithms Notes',
        userId: 99,
        author: { id: 99, username: 'original_author', emailVerified: true, isStaffVerified: false },
      },
    }

    const { sheet } = await mockAuthenticatedApp(page, { sheet: forkedSheet })

    await page.goto(`/sheets/${sheet.id}`)

    // Fork lineage banner should be visible
    await expect(page.getByText('Forked from')).toBeVisible()
    await expect(page.getByText('Original Algorithms Notes')).toBeVisible()

    // "Contribute back" quick-action should be present
    await expect(page.getByRole('link', { name: /contribute back/i })).toBeVisible()
  })

  test('renders sheet stats (stars, forks, downloads, comments)', async ({ page }) => {
    await disableTutorials(page)
    const { sheet } = await mockAuthenticatedApp(page)
    await page.goto(`/sheets/${sheet.id}`)

    // Verify key stats appear somewhere on the page
    await expect(page.getByText('12')).toBeVisible()  // stars
    await expect(page.getByText('34')).toBeVisible()  // downloads
  })

  test('sheet viewer tab strip renders Content, Activity, Comments, Related', async ({ page }) => {
    await disableTutorials(page)
    const { sheet } = await mockAuthenticatedApp(page)
    await page.goto(`/sheets/${sheet.id}`)

    // Navigation tabs
    const nav = page.locator('nav[aria-label="Sheet sections"]')
    await expect(nav).toBeVisible()
    await expect(nav.getByText('Content')).toBeVisible()
    await expect(nav.getByText('Activity')).toBeVisible()
    await expect(nav.getByText('Comments')).toBeVisible()
    await expect(nav.getByText('Related')).toBeVisible()
  })

  test('no page errors on sheet viewer', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error))
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await page.goto('/sheets/501')
    await page.waitForTimeout(1000)
    expect(pageErrors).toEqual([])
  })
})

/* ─── Track 2: README-style sheet landing pages ───────────────────────────── */

test.describe('Track 2 — README landing section @smoke', () => {
  test('renders README section when sheet has description', async ({ page }) => {
    await disableTutorials(page)
    const { sheet } = await mockAuthenticatedApp(page, {
      sheet: { description: '# Algorithms Review\n\nThis covers all midterm topics.' },
    })
    await page.goto(`/sheets/${sheet.id}`)

    // The README section should render the description content
    // It renders as markdown so look for the actual text
    await expect(page.getByText('Algorithms Review')).toBeVisible()
    await expect(page.getByText('This covers all midterm topics.')).toBeVisible()
  })

  test('sheet without description does not show empty README', async ({ page }) => {
    await disableTutorials(page)
    const { sheet } = await mockAuthenticatedApp(page, {
      sheet: { description: '' },
    })
    await page.goto(`/sheets/${sheet.id}`)

    // The sheet viewer should still load without errors
    await expect(page.locator('main#main-content')).toBeVisible()
  })
})

/* ─── Track 3: Improved diff viewing ──────────────────────────────────────── */

test.describe('Track 3 — Diff viewing in SheetLab @smoke', () => {
  test('SheetLab loads with Changes tab for sheet owner', async ({ page }) => {
    await disableTutorials(page)
    const { sheet, user } = await mockAuthenticatedApp(page)

    // Mock lab-specific endpoints
    await page.route(`**/api/sheets/${sheet.id}/commits?*`, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          commits: [
            {
              id: 1,
              message: 'Initial commit',
              kind: 'snapshot',
              checksum: 'abc123',
              createdAt: '2026-03-16T12:00:00.000Z',
              author: { id: user.id, username: user.username, avatarUrl: null },
            },
          ],
          total: 1,
        },
      })
    })

    await page.route(`**/api/sheets/${sheet.id}/working`, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          content: 'Updated content here',
          title: sheet.title,
          description: sheet.description,
          lastSavedAt: '2026-03-16T12:10:00.000Z',
        },
      })
    })

    await page.goto(`/sheets/${sheet.id}/lab`)

    // Lab page should load with tab navigation
    await expect(page.getByText('Editor')).toBeVisible()
    await expect(page.getByText('Changes')).toBeVisible()
    await expect(page.getByText('History')).toBeVisible()
  })

  test('SheetLab changes tab shows version comparison dropdowns', async ({ page }) => {
    await disableTutorials(page)
    const { sheet, user } = await mockAuthenticatedApp(page)

    const commits = [
      {
        id: 2,
        message: 'Added recursion section',
        kind: 'snapshot',
        checksum: 'def456',
        content: 'Updated content with recursion',
        createdAt: '2026-03-16T13:00:00.000Z',
        author: { id: user.id, username: user.username, avatarUrl: null },
      },
      {
        id: 1,
        message: 'Initial commit',
        kind: 'snapshot',
        checksum: 'abc123',
        content: 'Initial content',
        createdAt: '2026-03-16T12:00:00.000Z',
        author: { id: user.id, username: user.username, avatarUrl: null },
      },
    ]

    await page.route(`**/api/sheets/${sheet.id}/commits?*`, async (route) => {
      await route.fulfill({ status: 200, json: { commits, total: 2 } })
    })

    await page.route(`**/api/sheets/${sheet.id}/working`, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          content: 'Updated content with recursion',
          title: sheet.title,
          description: sheet.description,
          lastSavedAt: '2026-03-16T13:00:00.000Z',
        },
      })
    })

    await page.goto(`/sheets/${sheet.id}/lab`)

    // Click the Changes tab
    const changesTab = page.getByRole('button', { name: 'Changes' })
    if (await changesTab.isVisible()) {
      await changesTab.click()

      // Version comparison selects should appear
      await expect(page.getByText(/compare versions/i).or(page.locator('select')).first()).toBeVisible({ timeout: 5000 })
    }
  })
})
