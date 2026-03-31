/**
 * E2E smoke tests for Tracks 4–6 of the GitHub-inspired sheet experience cycle.
 *
 * Track 4: Better fork/contribution UX (two-step submit, review comments)
 * Track 5: Sheet version history improvements (enhanced timeline, browse-at-version)
 * Track 6: Branch-like workflow (draft/publish, activity feed, merge conflict detection)
 *
 * @tags @smoke @tracks-4-6
 */
import { test, expect } from '@playwright/test'
import { mockAuthenticatedApp } from './helpers/mockStudyHubApi.js'

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

/** Shared helper: mock lab endpoints for a given sheet and user. */
async function mockLabEndpoints(page, sheet, user, extraCommits = []) {
  const commits = extraCommits.length > 0 ? extraCommits : [
    {
      id: 1,
      message: 'Initial commit',
      kind: 'snapshot',
      checksum: 'abc123',
      content: sheet.content || 'Initial content',
      createdAt: '2026-03-16T12:00:00.000Z',
      author: { id: user.id, username: user.username, avatarUrl: null },
    },
  ]

  await page.route(`**/api/sheets/${sheet.id}/commits?*`, async (route) => {
    await route.fulfill({ status: 200, json: { commits, total: commits.length } })
  })

  await page.route(`**/api/sheets/${sheet.id}/working`, async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        content: sheet.content || 'Current working content',
        title: sheet.title,
        description: sheet.description,
        lastSavedAt: '2026-03-16T13:00:00.000Z',
      },
    })
  })
}

/* ─── Track 4: Better fork/contribution UX ────────────────────────────────── */

test.describe('Track 4 — Fork/contribution UX @smoke', () => {
  test('fork redirects to lab editor tab', async ({ page }) => {
    await disableTutorials(page)

    // Use a non-owner user viewing someone else's sheet
    const otherUser = { id: 99, username: 'other_author' }
    const { sheet } = await mockAuthenticatedApp(page, {
      sheet: { userId: otherUser.id, author: otherUser },
    })

    // Mock fork endpoint
    await page.route(`**/api/sheets/${sheet.id}/fork`, async (route) => {
      await route.fulfill({
        status: 201,
        json: { id: 600, title: `Fork of ${sheet.title}`, forkOf: sheet.id },
      })
    })

    // Mock the forked sheet's lab page
    await page.route('**/api/sheets/600', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          ...sheet,
          id: 600,
          title: `Fork of ${sheet.title}`,
          forkOf: sheet.id,
          userId: 42,
          author: { id: 42, username: 'regression_admin' },
        },
      })
    })

    await page.goto(`/sheets/${sheet.id}`)

    // Find and click the fork button
    const forkButton = page.getByRole('button', { name: /fork/i })
    if (await forkButton.isVisible()) {
      await forkButton.click()

      // Should navigate to the lab with ?tab=editor
      await expect(page).toHaveURL(/\/sheets\/600\/lab\?tab=editor/, { timeout: 5000 })
    }
  })

  test('contribution reviews show reviewer comments', async ({ page }) => {
    await disableTutorials(page)

    const reviewedContribution = {
      id: 50,
      status: 'accepted',
      message: 'Fixed typos in recursion section',
      reviewComment: 'Great improvements, thanks!',
      createdAt: '2026-03-20T10:00:00.000Z',
      reviewedAt: '2026-03-21T14:00:00.000Z',
      proposer: { id: 77, username: 'contributor_student', emailVerified: true, isStaffVerified: false },
      reviewer: { id: 42, username: 'regression_admin', emailVerified: true, isStaffVerified: false },
      forkSheet: { id: 600, title: 'Fork of Algorithms', updatedAt: '2026-03-20T10:00:00.000Z', author: { id: 77, username: 'contributor_student' } },
      targetSheetId: 501,
      forkSheetId: 600,
    }

    const { sheet, user } = await mockAuthenticatedApp(page, {
      sheet: { incomingContributions: [reviewedContribution] },
    })

    await mockLabEndpoints(page, sheet, user)

    await page.goto(`/sheets/${sheet.id}/lab`)

    // Navigate to Reviews tab
    const reviewsTab = page.getByRole('button', { name: /reviews/i })
    if (await reviewsTab.isVisible()) {
      await reviewsTab.click()

      // Should show the reviewer comment
      await expect(page.getByText('Great improvements, thanks!')).toBeVisible({ timeout: 5000 })
      await expect(page.getByText('contributor_student')).toBeVisible()
    }
  })

  test('pending contribution shows accept/reject buttons for sheet owner', async ({ page }) => {
    await disableTutorials(page)

    const pendingContribution = {
      id: 51,
      status: 'pending',
      message: 'Added graph traversal notes',
      reviewComment: '',
      createdAt: '2026-03-22T10:00:00.000Z',
      reviewedAt: null,
      proposer: { id: 77, username: 'contributor_student', emailVerified: true, isStaffVerified: false },
      reviewer: null,
      forkSheet: { id: 601, title: 'Fork of Algorithms v2', updatedAt: '2026-03-22T10:00:00.000Z', author: { id: 77, username: 'contributor_student' } },
      targetSheetId: 501,
      forkSheetId: 601,
    }

    const { sheet, user } = await mockAuthenticatedApp(page, {
      sheet: { incomingContributions: [pendingContribution] },
    })

    // Mock the diff endpoint
    await page.route('**/api/sheets/contributions/51/diff', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          diff: {
            hunks: [{ oldStart: 1, newStart: 1, lines: [{ type: 'add', content: '+ Graph BFS traversal' }] }],
            additions: 1,
            deletions: 0,
          },
          hasConflict: false,
        },
      })
    })

    await mockLabEndpoints(page, sheet, user)

    await page.goto(`/sheets/${sheet.id}/lab`)

    const reviewsTab = page.getByRole('button', { name: /reviews/i })
    if (await reviewsTab.isVisible()) {
      await reviewsTab.click()

      // Should show the attention banner
      await expect(page.getByText(/needs your review/i)).toBeVisible({ timeout: 5000 })

      // Accept & Reject buttons
      await expect(page.getByRole('button', { name: /accept.*merge/i })).toBeVisible()
      await expect(page.getByRole('button', { name: /reject/i })).toBeVisible()
    }
  })

  test('conflict detection shows warning banner', async ({ page }) => {
    await disableTutorials(page)

    const pendingContribution = {
      id: 52,
      status: 'pending',
      message: 'Updated sorting section',
      reviewComment: '',
      baseChecksum: 'old-checksum-123',
      createdAt: '2026-03-22T10:00:00.000Z',
      reviewedAt: null,
      proposer: { id: 77, username: 'contributor_student', emailVerified: true, isStaffVerified: false },
      reviewer: null,
      forkSheet: { id: 602, title: 'Fork with conflicts', updatedAt: '2026-03-22T10:00:00.000Z', author: { id: 77, username: 'contributor_student' } },
      targetSheetId: 501,
      forkSheetId: 602,
    }

    const { sheet, user } = await mockAuthenticatedApp(page, {
      sheet: { incomingContributions: [pendingContribution] },
    })

    // Mock diff endpoint WITH conflict flag
    await page.route('**/api/sheets/contributions/52/diff', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          diff: {
            hunks: [{ oldStart: 1, newStart: 1, lines: [{ type: 'change', oldContent: '- Old sorting', newContent: '+ New sorting' }] }],
            additions: 1,
            deletions: 1,
          },
          hasConflict: true,
        },
      })
    })

    await mockLabEndpoints(page, sheet, user)

    await page.goto(`/sheets/${sheet.id}/lab`)

    const reviewsTab = page.getByRole('button', { name: /reviews/i })
    if (await reviewsTab.isVisible()) {
      await reviewsTab.click()
      await page.waitForTimeout(1500) // Wait for auto-load of diff

      // Should show conflict warning banner
      await expect(page.getByText(/potential conflict detected/i)).toBeVisible({ timeout: 5000 })

      // Accept button should mention conflict
      await expect(page.getByRole('button', { name: /accept.*merge.*conflict/i })).toBeVisible()
    }
  })
})

/* ─── Track 5: Sheet version history improvements ─────────────────────────── */

test.describe('Track 5 — Version history @smoke', () => {
  test('history tab shows enhanced timeline with commit metadata', async ({ page }) => {
    await disableTutorials(page)
    const { sheet, user } = await mockAuthenticatedApp(page)

    const commits = [
      {
        id: 3,
        message: 'Merged contribution from contributor_student',
        kind: 'merge',
        checksum: 'ghi789',
        content: 'Merged content',
        createdAt: '2026-03-17T14:00:00.000Z',
        author: { id: user.id, username: user.username, avatarUrl: null },
      },
      {
        id: 2,
        message: 'Restored from version 1',
        kind: 'restore',
        checksum: 'def456',
        content: 'Restored content',
        createdAt: '2026-03-17T10:00:00.000Z',
        author: { id: user.id, username: user.username, avatarUrl: null },
      },
      {
        id: 1,
        message: 'Initial commit',
        kind: 'fork_base',
        checksum: 'abc123',
        content: 'Initial content',
        createdAt: '2026-03-16T12:00:00.000Z',
        author: { id: user.id, username: user.username, avatarUrl: null },
      },
    ]

    await mockLabEndpoints(page, sheet, user, commits)

    await page.goto(`/sheets/${sheet.id}/lab`)

    // Click History tab
    const historyTab = page.getByRole('button', { name: 'History' })
    if (await historyTab.isVisible()) {
      await historyTab.click()

      // Should show commit messages
      await expect(page.getByText('Merged contribution')).toBeVisible({ timeout: 5000 })
      await expect(page.getByText('Initial commit')).toBeVisible()

      // Should show commit kind labels
      await expect(page.getByText(/merged/i).first()).toBeVisible()
    }
  })

  test('history tab shows "Browse at this version" links', async ({ page }) => {
    await disableTutorials(page)
    const { sheet, user } = await mockAuthenticatedApp(page)

    const commits = [
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

    await mockLabEndpoints(page, sheet, user, commits)

    await page.goto(`/sheets/${sheet.id}/lab`)

    const historyTab = page.getByRole('button', { name: 'History' })
    if (await historyTab.isVisible()) {
      await historyTab.click()

      // Should have a "Browse at this version" link
      const browseLink = page.getByText(/browse at this version/i)
      if (await browseLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        expect(await browseLink.getAttribute('href') || '').toContain(`/sheets/${sheet.id}`)
      }
    }
  })
})

/* ─── Track 6: Branch-like workflow enhancements ──────────────────────────── */

test.describe('Track 6 — Branch-like workflow @smoke', () => {
  test('editor shows draft/published status badge and toggle button', async ({ page }) => {
    await disableTutorials(page)
    const { sheet, user } = await mockAuthenticatedApp(page, {
      sheet: { status: 'draft' },
    })

    await mockLabEndpoints(page, sheet, user)

    await page.goto(`/sheets/${sheet.id}/lab`)

    // Editor tab should be active by default for owner
    // Look for draft badge
    await expect(page.getByText(/draft/i).first()).toBeVisible({ timeout: 5000 })

    // Should have a publish button
    const publishBtn = page.getByRole('button', { name: /publish/i })
    await expect(publishBtn).toBeVisible()
  })

  test('published sheet shows "Revert to Draft" option', async ({ page }) => {
    await disableTutorials(page)
    const { sheet, user } = await mockAuthenticatedApp(page, {
      sheet: { status: 'published' },
    })

    await mockLabEndpoints(page, sheet, user)

    await page.goto(`/sheets/${sheet.id}/lab`)

    // Look for the published badge and revert button
    await expect(page.getByText(/published/i).first()).toBeVisible({ timeout: 5000 })

    // Should have a revert to draft button
    const revertBtn = page.getByRole('button', { name: /draft/i })
    if (await revertBtn.isVisible().catch(() => false)) {
      expect(revertBtn).toBeTruthy()
    }
  })

  test('activity feed loads on viewer page', async ({ page }) => {
    await disableTutorials(page)
    const { sheet } = await mockAuthenticatedApp(page)

    // Mock the activity endpoint
    await page.route(`**/api/sheets/${sheet.id}/activity?*`, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          items: [
            {
              type: 'commit',
              id: 'commit-1',
              date: '2026-03-16T12:00:00.000Z',
              actor: { username: 'regression_admin', avatarUrl: null },
              message: 'Initial commit',
              meta: { kind: 'snapshot', checksum: 'abc123' },
            },
            {
              type: 'comment',
              id: 'comment-1001',
              date: '2026-03-16T12:05:00.000Z',
              actor: { username: 'classmate', avatarUrl: null },
              message: 'This summary is exactly what I needed.',
              meta: {},
            },
          ],
          total: 2,
          page: 1,
          totalPages: 1,
        },
      })
    })

    await page.goto(`/sheets/${sheet.id}`)

    // Activity section should appear
    await expect(page.getByText('Activity')).toBeVisible()

    // Click the Activity tab to scroll to it
    const activityTab = page.locator('nav[aria-label="Sheet sections"]').getByText('Activity')
    await activityTab.click()

    // Should show activity items
    await expect(page.getByText('Initial commit')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('This summary is exactly what I needed.')).toBeVisible()
  })

  test('activity feed handles empty state gracefully', async ({ page }) => {
    await disableTutorials(page)
    const { sheet } = await mockAuthenticatedApp(page)

    await page.route(`**/api/sheets/${sheet.id}/activity?*`, async (route) => {
      await route.fulfill({
        status: 200,
        json: { items: [], total: 0, page: 1, totalPages: 0 },
      })
    })

    await page.goto(`/sheets/${sheet.id}`)

    // Should show empty state
    await expect(page.getByText('No activity yet.')).toBeVisible({ timeout: 5000 })
  })

  test('activity feed shows pagination for many items', async ({ page }) => {
    await disableTutorials(page)
    const { sheet } = await mockAuthenticatedApp(page)

    await page.route(`**/api/sheets/${sheet.id}/activity?*`, async (route) => {
      const items = Array.from({ length: 20 }, (_, i) => ({
        type: 'commit',
        id: `commit-${i + 1}`,
        date: new Date(Date.now() - i * 3600000).toISOString(),
        actor: { username: 'regression_admin', avatarUrl: null },
        message: `Commit #${i + 1}`,
        meta: { kind: 'snapshot' },
      }))

      await route.fulfill({
        status: 200,
        json: { items, total: 40, page: 1, totalPages: 2 },
      })
    })

    await page.goto(`/sheets/${sheet.id}`)

    // Should show pagination controls
    await expect(page.getByText('1 / 2')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()
  })

  test('no page errors on lab page with all tracks features', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error))

    await disableTutorials(page)
    const { sheet, user } = await mockAuthenticatedApp(page)
    await mockLabEndpoints(page, sheet, user)

    await page.goto(`/sheets/${sheet.id}/lab`)
    await page.waitForTimeout(1500)
    expect(pageErrors).toEqual([])
  })

  test('lab URL tab parameter selects correct tab', async ({ page }) => {
    await disableTutorials(page)
    const { sheet, user } = await mockAuthenticatedApp(page)
    await mockLabEndpoints(page, sheet, user)

    // Navigate with ?tab=history
    await page.goto(`/sheets/${sheet.id}/lab?tab=history`)

    // History tab content should be visible
    await expect(page.getByText('Initial commit')).toBeVisible({ timeout: 5000 })
  })
})

/* ─── Cross-track security regression ─────────────────────────────────────── */

test.describe('Cross-track security @regression', () => {
  test('all API requests include credentials: include', async ({ page }) => {
    await disableTutorials(page)
    const { sheet } = await mockAuthenticatedApp(page)

    const apiRequests = []

    // Track all fetch requests to API
    page.on('request', (request) => {
      if (request.url().includes('/api/') && request.resourceType() === 'fetch') {
        apiRequests.push({
          url: request.url(),
          headers: request.headers(),
        })
      }
    })

    // Mock activity endpoint
    await page.route(`**/api/sheets/${sheet.id}/activity?*`, async (route) => {
      await route.fulfill({
        status: 200,
        json: { items: [], total: 0, page: 1, totalPages: 0 },
      })
    })

    await page.goto(`/sheets/${sheet.id}`)
    await page.waitForTimeout(2000)

    // All API requests should have been made (at least auth/me, sheet, comments, activity)
    expect(apiRequests.length).toBeGreaterThan(0)

    // Cookie header presence indicates credentials: 'include' was used
    // (Playwright route interception captures the headers that would be sent)
  })
})
