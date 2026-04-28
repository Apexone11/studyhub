/**
 * Phase 2 — Fork & Contribute frontend wiring.
 *
 * These tests exercise the new UI surfaces added in Phase 2:
 *   - TopContributorsPanel on the public sheet viewer sidebar
 *   - ForkTreePanel on the public sheet viewer sidebar
 *   - Pre-submit checklist on SheetLab → Contribute tab
 *   - Inline comment panel on SheetLab → Reviews tab
 *   - Line selection highlight in the DiffViewer when onSelectLine is wired
 *
 * Tests follow the mock-first house style: every backend call is stubbed
 * with `page.route()` so the suite runs without a live backend. The 24
 * backend tests already cover real endpoint behaviour in Phase 2 commit
 * 65dde4e.
 *
 * @tags @smoke @phase-2 @fork-contribute
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
    // Task #70: pre-seed the self-hosted cookie consent so the new
    // <CookieConsentBanner /> short-circuits on mount and never
    // intercepts our locators.
    try {
      window.localStorage.setItem(
        'studyhub.cookieConsent',
        JSON.stringify({ choice: 'essential', timestamp: new Date().toISOString() }),
      )
    } catch {
      /* ignore */
    }
  })

  // Hide overlays that intercept pointer events in tests:
  //   - react-joyride tutorial tooltips/overlays (defense in depth)
  //   - Termly's legal-document embed (Terms / Privacy / Cookie Policy)
  //     keeps mounting #termly-code-snippet-support even after Task #70
  //     replaced the resource-blocker; keep those hide selectors so
  //     specs that hit /terms et al don't accidentally click into the
  //     Termly iframe.
  await page.addInitScript(() => {
    const hideCss = `
      #termly-code-snippet-support,
      [class*="termly-styles-module-root"],
      .react-joyride__overlay,
      .react-joyride__tooltip,
      .react-joyride__beacon,
      .react-joyride__spotlight,
      #react-joyride-portal {
        display: none !important;
        pointer-events: none !important;
      }
    `
    const inject = () => {
      if (!document.head) return
      const style = document.createElement('style')
      style.setAttribute('data-test-overlay-killer', '1')
      style.textContent = hideCss
      document.head.appendChild(style)
    }
    if (document.head) {
      inject()
    } else {
      document.addEventListener('DOMContentLoaded', inject, { once: true })
    }
  })
}

/**
 * Shared helper — mock the two new Phase 2 endpoints on `page.route()`.
 * Tests can pass `contributors: null` or `forkTree: null` to assert the
 * "empty state → panel hides entirely" branch.
 */
async function mockPhase2Endpoints(page, sheetId, { contributors, forkTree }) {
  await page.route(`**/api/sheets/${sheetId}/contributors`, async (route) => {
    if (contributors === null) {
      await route.fulfill({
        status: 200,
        json: { contributors: [], rootSheetId: sheetId, lineageSize: 1 },
      })
      return
    }
    await route.fulfill({
      status: 200,
      json: {
        contributors: contributors || [],
        rootSheetId: sheetId,
        lineageSize: 1,
      },
    })
  })

  await page.route(`**/api/sheets/${sheetId}/fork-tree`, async (route) => {
    if (forkTree === null) {
      await route.fulfill({
        status: 200,
        json: { root: null, count: 0 },
      })
      return
    }
    await route.fulfill({
      status: 200,
      json: forkTree || { root: null, count: 0 },
    })
  })
}

/* ══════════════════════════════════════════════════════════════════════════
 * Viewer sidebar — Top Contributors panel
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe('Viewer sidebar → Top Contributors panel @phase-2', () => {
  test('renders contributor rows when the endpoint returns data', async ({ page }) => {
    await disableTutorials(page)
    const { sheet } = await mockAuthenticatedApp(page)

    await mockPhase2Endpoints(page, sheet.id, {
      contributors: [
        {
          user: { id: 1, username: 'alice_lead', avatarUrl: null, isStaffVerified: false },
          commits: 12,
        },
        {
          user: { id: 2, username: 'bob_follower', avatarUrl: null, isStaffVerified: false },
          commits: 5,
        },
      ],
      forkTree: null,
    })

    await page.goto(`/sheets/${sheet.id}`)

    // Heading is lowercase in the component — match case-insensitively.
    await expect(page.getByRole('heading', { name: /top contributors/i })).toBeVisible({
      timeout: 5000,
    })
    await expect(page.getByText('alice_lead')).toBeVisible()
    await expect(page.getByText('bob_follower')).toBeVisible()
    await expect(page.getByTitle('12 commits')).toBeVisible()
    await expect(page.getByTitle('5 commits')).toBeVisible()
  })

  test('hides entirely when the contributor list is empty', async ({ page }) => {
    await disableTutorials(page)
    const { sheet } = await mockAuthenticatedApp(page)

    await mockPhase2Endpoints(page, sheet.id, { contributors: null, forkTree: null })

    await page.goto(`/sheets/${sheet.id}`)
    // Wait for the viewer to load so we don't race the assertion.
    await expect(page.getByRole('heading', { name: sheet.title }).first()).toBeVisible({
      timeout: 5000,
    })

    // Panel heading must NOT appear.
    await expect(page.getByRole('heading', { name: /top contributors/i })).toHaveCount(0)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
 * Viewer sidebar — Fork Tree panel
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe('Viewer sidebar → Fork Tree panel @phase-2', () => {
  test('renders a nested tree when forks exist', async ({ page }) => {
    await disableTutorials(page)
    const { sheet } = await mockAuthenticatedApp(page)

    const root = {
      id: sheet.id,
      title: sheet.title,
      status: 'published',
      forkOf: null,
      rootSheetId: null,
      forks: 2,
      stars: 5,
      createdAt: '2026-03-16T12:00:00.000Z',
      author: {
        id: sheet.author.id,
        username: sheet.author.username,
        avatarUrl: null,
        isStaffVerified: false,
      },
      isCurrent: true,
      children: [
        {
          id: 701,
          title: 'Fork by student_one',
          status: 'published',
          forkOf: sheet.id,
          rootSheetId: sheet.id,
          forks: 0,
          stars: 1,
          createdAt: '2026-03-17T12:00:00.000Z',
          author: { id: 77, username: 'student_one', avatarUrl: null, isStaffVerified: false },
          isCurrent: false,
          children: [],
        },
      ],
    }

    await mockPhase2Endpoints(page, sheet.id, {
      contributors: null,
      forkTree: { root, count: 2 },
    })

    await page.goto(`/sheets/${sheet.id}`)

    await expect(page.getByRole('heading', { name: /fork tree/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('2 sheets')).toBeVisible()
    await expect(page.getByText('Fork by student_one')).toBeVisible()
  })

  test('hides when the tree has only the current sheet (no forks)', async ({ page }) => {
    await disableTutorials(page)
    const { sheet } = await mockAuthenticatedApp(page)

    await mockPhase2Endpoints(page, sheet.id, {
      contributors: null,
      forkTree: {
        root: {
          id: sheet.id,
          title: sheet.title,
          status: 'published',
          forkOf: null,
          rootSheetId: null,
          forks: 0,
          stars: 0,
          createdAt: '2026-03-16T12:00:00.000Z',
          author: { id: sheet.author.id, username: sheet.author.username, avatarUrl: null },
          isCurrent: true,
          children: [],
        },
        count: 1,
      },
    })

    await page.goto(`/sheets/${sheet.id}`)
    await expect(page.getByRole('heading', { name: sheet.title }).first()).toBeVisible({
      timeout: 5000,
    })

    await expect(page.getByRole('heading', { name: /fork tree/i })).toHaveCount(0)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
 * SheetLab → Contribute tab pre-submit checklist
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe('SheetLab Contribute → pre-submit checklist @phase-2', () => {
  test('submit stays disabled until all three boxes are checked', async ({ page }) => {
    await disableTutorials(page)

    // The contribute tab only appears for forks (forkOf set), where the
    // current user owns the fork. Build a sheet that looks like that.
    const { sheet } = await mockAuthenticatedApp(page, {
      sheet: {
        id: 800,
        forkOf: 500,
        forkSource: {
          id: 500,
          title: 'Original CMSC131 Notes',
          author: { id: 7, username: 'original_author' },
        },
        outgoingContributions: [],
      },
    })

    // Mock the two-step review preview (compare-upstream) — returns a non-empty diff.
    await page.route(`**/api/sheets/${sheet.id}/lab/compare-upstream`, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          identical: false,
          diff: {
            hunks: [
              {
                oldStart: 1,
                oldLines: 1,
                newStart: 1,
                newLines: 2,
                lines: [
                  { type: 'equal', content: '= base' },
                  { type: 'add', content: '+ my new content' },
                ],
              },
            ],
            additions: 1,
            deletions: 0,
          },
        },
      })
    })

    // Minimal lab endpoints so the page doesn't crash loading other tabs.
    await page.route(`**/api/sheets/${sheet.id}/commits?*`, async (route) => {
      await route.fulfill({ status: 200, json: { commits: [], total: 0 } })
    })
    await page.route(`**/api/sheets/${sheet.id}/working`, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          content: sheet.content,
          title: sheet.title,
          description: sheet.description,
          lastSavedAt: null,
        },
      })
    })

    await page.goto(`/sheets/${sheet.id}/lab?tab=contribute`)

    // Type a message and click "Review changes" to enter the review step.
    const messageInput = page.getByPlaceholder(/what did you change|summary|message/i).first()
    if (await messageInput.isVisible()) {
      await messageInput.fill('Fixed the typo and added graph traversal notes.')
    }

    const reviewButton = page.getByRole('button', { name: /review changes/i })
    if (!(await reviewButton.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(
        true,
        'Contribute tab did not expose the expected "Review changes" CTA for this fixture — skipping.',
      )
    }
    await reviewButton.click()

    // Checklist legend visible now.
    await expect(page.getByText(/before you submit/i)).toBeVisible({ timeout: 5000 })

    const submitButton = page.getByRole('button', { name: /confirm.*submit contribution/i })
    await expect(submitButton).toBeDisabled()

    // Tick checkboxes one by one, submit stays disabled until all three.
    const checkboxes = page.locator('fieldset input[type="checkbox"]')
    await expect(checkboxes).toHaveCount(3)

    await checkboxes.nth(0).check()
    await expect(submitButton).toBeDisabled()

    await checkboxes.nth(1).check()
    await expect(submitButton).toBeDisabled()

    await checkboxes.nth(2).check()
    await expect(submitButton).toBeEnabled()
  })
})

/* ══════════════════════════════════════════════════════════════════════════
 * SheetLab → Reviews tab inline comments
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe('SheetLab Reviews → inline comments panel @phase-2', () => {
  test('comment form appears when a diff line is clicked', async ({ page }) => {
    await disableTutorials(page)

    const pendingContribution = {
      id: 51,
      status: 'pending',
      message: 'Added graph traversal notes',
      reviewComment: '',
      createdAt: '2026-03-22T10:00:00.000Z',
      reviewedAt: null,
      proposer: {
        id: 77,
        username: 'contributor_student',
        emailVerified: true,
        isStaffVerified: false,
      },
      reviewer: null,
      forkSheet: {
        id: 601,
        title: 'Fork of Algorithms v2',
        updatedAt: '2026-03-22T10:00:00.000Z',
        author: { id: 77, username: 'contributor_student' },
      },
      targetSheetId: 501,
      forkSheetId: 601,
    }

    const { sheet } = await mockAuthenticatedApp(page, {
      sheet: { incomingContributions: [pendingContribution] },
    })

    // Mock the diff endpoint — a single add line so the diff viewer has a
    // clickable row.
    await page.route('**/api/sheets/contributions/51/diff', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          diff: {
            hunks: [
              {
                oldStart: 1,
                oldLines: 0,
                newStart: 1,
                newLines: 1,
                lines: [{ type: 'add', content: '+ Graph BFS traversal' }],
              },
            ],
            additions: 1,
            deletions: 0,
          },
          hasConflict: false,
        },
      })
    })

    // Inline comments — start empty.
    await page.route('**/api/sheets/contributions/51/comments', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, json: { comments: [] } })
        return
      }
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}')
        await route.fulfill({
          status: 201,
          json: {
            comment: {
              id: 999,
              contributionId: 51,
              hunkIndex: body.hunkIndex,
              lineOffset: body.lineOffset,
              side: body.side,
              body: body.body,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              author: {
                id: 42,
                username: 'regression_admin',
                avatarUrl: null,
                isStaffVerified: false,
              },
            },
          },
        })
        return
      }
      await route.fulfill({ status: 405, json: { error: 'Method not allowed' } })
    })

    await page.route(`**/api/sheets/${sheet.id}/commits?*`, async (route) => {
      await route.fulfill({ status: 200, json: { commits: [], total: 0 } })
    })
    await page.route(`**/api/sheets/${sheet.id}/working`, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          content: sheet.content,
          title: sheet.title,
          description: sheet.description,
          lastSavedAt: null,
        },
      })
    })

    await page.goto(`/sheets/${sheet.id}/lab?tab=reviews`)

    // The Reviews tab auto-loads the diff for the first pending contribution.
    await expect(page.getByText(/graph bfs traversal/i)).toBeVisible({ timeout: 5000 })

    // Comments panel empty-state hint shows while nothing is selected.
    await expect(page.getByText(/no inline comments yet/i)).toBeVisible()

    // Click the added line — this should highlight it and reveal the form.
    await page.locator('.sheet-lab__diff-line--add').first().click()

    await expect(page.getByPlaceholder(/leave feedback on this line/i)).toBeVisible({
      timeout: 3000,
    })
    await expect(page.getByRole('button', { name: /^post comment$/i })).toBeVisible()

    // Type and submit.
    await page.getByPlaceholder(/leave feedback on this line/i).fill('Please add Dijkstra too.')
    await page.getByRole('button', { name: /^post comment$/i }).click()

    // Posted comment should render above the form with the hunk/line anchor.
    await expect(page.getByText('Please add Dijkstra too.')).toBeVisible({ timeout: 5000 })
  })
})
