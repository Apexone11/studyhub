/**
 * sheets-grid.e2e.spec.js — Phase 4 of v2 design refresh.
 *
 * Drives the Sheets page Grid view + cross-school toggle + filter pill
 * selected state behind the `design_v2_sheets_grid` flag. Same harness
 * pattern as ai-suggestion-card.e2e.spec.js (mockAuthenticatedApp +
 * per-route mocks).
 *
 * Coverage (handoff requires ≥7 cases):
 *   1. Flag-off baseline — legacy List-only view, no view bar.
 *   2. Flag-on List default — view bar visible, no localStorage / URL,
 *      List mode renders with v2 course-code styling.
 *   3. Grid toggle — click Grid, persists to localStorage, survives reload.
 *   4. URL precedence — `?view=grid` overrides localStorage `list`.
 *   5. Cross-school toggle drops `schoolId` from the next /api/sheets call.
 *   6. Filter pill selected state — Mine chip carries aria-pressed=true
 *      and the chip--selected modifier when active.
 *   7. Empty results — view bar (and the cross-school switch) stay
 *      reachable so the user can widen the search from a zero-result
 *      state. Day 3 critical-bug regression pin.
 *   8. Stale `previewText` tolerance — Grid card renders without a
 *      preview block when previewText is null; no layout shift.
 *
 * Tagged with @phase4-day4 (cycle selector) AND @smoke (so the spec
 * is picked up by `npm run test:e2e:smoke` per the project's
 * playwright.config.js convention of grepping by tag).
 */
import { test, expect } from '@playwright/test'
import { mockAuthenticatedApp, createSessionUser } from './helpers/mockStudyHubApi'

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_notes_seen', '1')
  })
}

async function blockConsentAndAnalyticsScripts(page) {
  // Task #70: pre-seed the self-hosted cookie consent so the new
  // <CookieConsentBanner /> short-circuits on mount and never blocks
  // our locators. We still abort *.termly.io + clarity.ms requests
  // as defense in depth — Termly is loaded for the legal-document
  // embed which some specs hit, and Clarity must never fire in tests.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'studyhub.cookieConsent',
        JSON.stringify({ choice: 'essential', timestamp: new Date().toISOString() }),
      )
    } catch {
      /* ignore */
    }
  })
  await page.route(/app\.termly\.io|clarity\.ms/, (route) => route.abort())
}

// Force the design_v2_sheets_grid flag on/off. The catch-all in
// mockAuthenticatedApp returns {} for unknown routes, which under
// fail-closed = disabled, so we always opt in or out explicitly.
async function setSheetsGridFlag(page, enabled) {
  await page.route('**/api/flags/evaluate/design_v2_sheets_grid', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled, reason: enabled ? 'ENABLED' : 'DISABLED' }),
    })
  })
}

function buildSheet(overrides = {}) {
  return {
    id: 1001,
    title: 'CMSC131 Master Study Guide',
    description: '',
    content: '',
    previewText:
      'A quick-reference summary covering every chapter through midterm. Includes worked examples for the trickiest practice problems and a glossary of vocabulary the professor reuses on quizzes.',
    contentFormat: 'markdown',
    status: 'published',
    courseId: 101,
    userId: 9,
    stars: 14,
    forks: 3,
    downloads: 42,
    starred: false,
    commentCount: 0,
    createdAt: '2026-04-25T08:00:00.000Z',
    updatedAt: '2026-04-25T08:00:00.000Z',
    course: {
      id: 101,
      code: 'CMSC131',
      name: 'Object-Oriented Programming I',
      school: { id: 1, name: 'University of Maryland', short: 'UMD' },
    },
    author: { id: 9, username: 'beta_student1' },
    forkSource: null,
    incomingContributions: [],
    outgoingContributions: [],
    hasAttachment: false,
    attachmentName: null,
    attachmentType: null,
    allowDownloads: true,
    allowEditing: false,
    htmlRiskTier: 0,
    htmlWorkflow: {
      scanStatus: 'completed',
      riskTier: 0,
      previewMode: 'interactive',
      ackRequired: false,
      scanFindings: [],
      riskSummary: null,
      tierExplanation: null,
      findingsByCategory: {},
      scanUpdatedAt: null,
      scanAcknowledgedAt: null,
      hasOriginalVersion: false,
      hasWorkingVersion: false,
      originalSourceName: null,
    },
    ...overrides,
  }
}

// Override the harness's catch-all `/api/sheets?*` route with a real
// list of sheets. We also stash the most-recent request URL on
// `requestRecord` so tests can assert on the query string.
async function mockSheetsList(page, sheets, requestRecord = { lastUrl: '' }) {
  await page.route('**/api/sheets?*', async (route) => {
    requestRecord.lastUrl = route.request().url()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sheets, total: sheets.length, limit: 24, offset: 0 }),
    })
  })
  return requestRecord
}

test.describe('Sheets Grid view (@phase4-day4 @smoke)', () => {
  test.beforeEach(async ({ page }) => {
    await disableTutorials(page)
    await blockConsentAndAnalyticsScripts(page)
  })

  test('Flag-off baseline — renders legacy List view, no view bar', async ({ page }) => {
    const user = createSessionUser({ username: 'beta_student1', id: 9, role: 'student' })
    await mockAuthenticatedApp(page, { user })
    await setSheetsGridFlag(page, false)
    await mockSheetsList(page, [buildSheet()])

    await page.goto('/sheets')
    // Landmark: the page <h1> always renders.
    await expect(page.getByRole('heading', { level: 1, name: /study sheets/i })).toBeVisible()
    // The v2 view bar must NOT render.
    await expect(page.getByRole('switch', { name: /search across studyhub/i })).toHaveCount(0)
    await expect(page.getByRole('group', { name: /sheet view/i })).toHaveCount(0)
  })

  test('Flag-on List default — view bar visible, no view URL param', async ({ page }) => {
    const user = createSessionUser({ username: 'beta_student1', id: 9, role: 'student' })
    await mockAuthenticatedApp(page, { user })
    await setSheetsGridFlag(page, true)
    await mockSheetsList(page, [buildSheet()])

    await page.goto('/sheets')
    await expect(page.getByRole('switch', { name: /search across studyhub/i })).toBeVisible()
    const viewToggle = page.getByRole('group', { name: /sheet view/i })
    await expect(viewToggle).toBeVisible()
    // List is the default, so its button should be the pressed one.
    await expect(viewToggle.getByRole('button', { name: /list view/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(viewToggle.getByRole('button', { name: /grid view/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    // List view renders the legacy SheetListRow article.
    await expect(page.getByRole('link', { name: /open cmsc131 master study guide/i })).toBeVisible()
  })

  test('Grid toggle persists to localStorage and survives reload', async ({ page }) => {
    const user = createSessionUser({ username: 'beta_student1', id: 9, role: 'student' })
    await mockAuthenticatedApp(page, { user })
    await setSheetsGridFlag(page, true)
    await mockSheetsList(page, [buildSheet()])

    await page.goto('/sheets')
    await page
      .getByRole('group', { name: /sheet view/i })
      .getByRole('button', { name: /grid view/i })
      .click()

    // Grid card is the <article role="link"> wrapper. Anchor children
    // inherit a link role, so we narrow to the article element to keep
    // the count assertion honest as the inner DOM evolves.
    await expect(page.locator('.sheets-page__grid')).toBeVisible()
    await expect(page.locator('.sheets-page__grid article[role="link"]')).toHaveCount(1)

    const stored = await page.evaluate(() => localStorage.getItem('studyhub.sheets.viewMode'))
    expect(stored).toBe('grid')

    await page.reload()
    await expect(page.locator('.sheets-page__grid')).toBeVisible()
  })

  test('URL ?view=grid overrides localStorage list preference', async ({ page }) => {
    const user = createSessionUser({ username: 'beta_student1', id: 9, role: 'student' })
    // Pre-seed localStorage with `list` so we know the URL is what
    // forced grid mode, not stored state.
    await page.addInitScript(() => {
      window.localStorage.setItem('studyhub.sheets.viewMode', 'list')
    })
    await mockAuthenticatedApp(page, { user })
    await setSheetsGridFlag(page, true)
    await mockSheetsList(page, [buildSheet()])

    await page.goto('/sheets?view=grid')
    await expect(page.locator('.sheets-page__grid')).toBeVisible()
  })

  test('Cross-school toggle ON drops schoolId from the /api/sheets request', async ({ page }) => {
    const user = createSessionUser({ username: 'beta_student1', id: 9, role: 'student' })
    await mockAuthenticatedApp(page, { user })
    await setSheetsGridFlag(page, true)
    const record = { lastUrl: '' }
    await mockSheetsList(page, [buildSheet()], record)

    // Land on /sheets with a school filter applied. The URL is the
    // source of truth for filters per useSheetsData.
    await page.goto('/sheets?schoolId=1')
    // Confirm the initial scoped request did include schoolId so we
    // have a baseline to compare against.
    await expect.poll(() => record.lastUrl).toMatch(/schoolId=1/)

    await page.getByRole('switch', { name: /search across studyhub/i }).click()

    // After the toggle flips, the polling fetch should re-fire WITHOUT
    // schoolId. Poll until the recorded URL changes to the new shape.
    await expect
      .poll(() => record.lastUrl, { message: 'cross-school toggle should drop schoolId' })
      .not.toMatch(/schoolId=1/)
    await expect(page.getByRole('switch', { name: /search across studyhub/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  test('Filter pill selected state — Mine chip flips aria-pressed', async ({ page }) => {
    const user = createSessionUser({ username: 'beta_student1', id: 9, role: 'student' })
    await mockAuthenticatedApp(page, { user })
    await setSheetsGridFlag(page, true)
    await mockSheetsList(page, [buildSheet()])

    await page.goto('/sheets')
    const mineChip = page.getByRole('button', { name: 'Mine' })
    await expect(mineChip).toHaveAttribute('aria-pressed', 'false')
    await mineChip.click()
    await expect(mineChip).toHaveAttribute('aria-pressed', 'true')
    // The selected modifier class is hashed by CSS modules; assert by
    // class-prefix substring to stay robust to the hash suffix.
    const className = await mineChip.getAttribute('class')
    expect(className || '').toMatch(/chip--selected/)
  })

  test('Empty results — cross-school switch is still reachable', async ({ page }) => {
    const user = createSessionUser({ username: 'beta_student1', id: 9, role: 'student' })
    await mockAuthenticatedApp(page, { user })
    await setSheetsGridFlag(page, true)
    // Override the harness's catch-all with an explicit empty list.
    await page.route('**/api/sheets?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sheets: [], total: 0, limit: 24, offset: 0 }),
      })
    })

    await page.goto('/sheets?schoolId=1')
    // Empty state copy.
    await expect(page.getByText(/no sheets/i).first()).toBeVisible()
    // Day 3 regression pin: the switch must remain reachable so the
    // user can widen the search from this state.
    const crossSchoolSwitch = page.getByRole('switch', { name: /search across studyhub/i })
    await expect(crossSchoolSwitch).toBeVisible()
    await expect(crossSchoolSwitch).toBeEnabled()
  })

  test('Grid card with previewText: null renders without a preview block', async ({ page }) => {
    const user = createSessionUser({ username: 'beta_student1', id: 9, role: 'student' })
    await mockAuthenticatedApp(page, { user })
    await setSheetsGridFlag(page, true)
    await mockSheetsList(page, [buildSheet({ previewText: null, title: 'No-preview sheet' })])

    await page.goto('/sheets?view=grid')
    const card = page.locator('.sheets-page__grid article[role="link"]').first()
    await expect(card).toBeVisible()
    await expect(card).toHaveAccessibleName(/open no-preview sheet/i)
    // The preview <p> renders only when previewText is non-empty.
    await expect(card.locator('p')).toHaveCount(0)
  })
})
