/**
 * teach-materials.spec.js — Playwright @smoke coverage for the Teacher
 * "My Materials" workspace shipped in Design Refresh v2 Week 2.
 *
 * Covers:
 *   - Non-teacher viewers are redirected to /sheets (page is teacher-only).
 *   - Teacher viewers see the header + three tabs.
 *   - Switching tabs updates the ?tab= URL param.
 *   - Each tab renders the correct empty-state copy.
 */
import { expect, test } from '@playwright/test'

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_notes_seen', '1')
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
  })
}

/**
 * Minimal mock surface for /teach/materials. We deliberately do NOT use the
 * full mockAuthenticatedApp helper because this page is narrow: auth + empty
 * sheet list is enough to exercise the four behaviors we care about.
 */
async function mockTeacherSession(page, { accountType = 'teacher' } = {}) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        id: 77,
        username: 'teacher_betty',
        role: 'student', // StudyHub's staff "role" is orthogonal to accountType
        accountType,
        email: 'teacher_betty@studyhub.test',
        emailVerified: true,
        twoFaEnabled: false,
        avatarUrl: null,
        createdAt: '2026-03-16T12:00:00.000Z',
        enrollments: [],
        counts: { courses: 0, sheets: 0, stars: 0 },
        csrfToken: 'csrf-token',
      },
    })
  })

  await page.route('**/api/notifications?*', async (route) => {
    await route.fulfill({ status: 200, json: { notifications: [], unreadCount: 0 } })
  })
  await page.route('**/api/sheets?*', async (route) => {
    // Empty library + empty drafts so the empty-state copy is under test.
    await route.fulfill({ status: 200, json: { sheets: [], total: 0 } })
  })
  await page.route('**/api/flags/evaluate/*', async (route) => {
    await route.fulfill({ status: 200, json: { enabled: true } })
  })
  // Generic /api/** safety net so unmocked endpoints don't hang.
  await page.route('**/api/**', async (route) => {
    const method = route.request().method()
    if (method === 'GET') await route.fulfill({ status: 200, json: {} })
    else await route.fulfill({ status: 200, json: { ok: true } })
  })
}

test.describe('@smoke /teach/materials (Week 2)', () => {
  test('teacher sees the header + three tabs', async ({ page }) => {
    await disableTutorials(page)
    await mockTeacherSession(page, { accountType: 'teacher' })

    await page.goto('/teach/materials')

    await expect(page.getByRole('heading', { level: 1, name: /^my materials$/i })).toBeVisible()

    // All three tab buttons are on the page.
    await expect(page.getByRole('button', { name: /library/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /drafts/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /collections/i })).toBeVisible()
  })

  test('switching to Drafts updates the URL and shows the drafts empty state', async ({ page }) => {
    await disableTutorials(page)
    await mockTeacherSession(page, { accountType: 'teacher' })

    await page.goto('/teach/materials')

    // Library is the default → no tab param.
    await expect(page).toHaveURL(/\/teach\/materials(\?.*)?$/)
    await expect(page.getByRole('heading', { name: /your library is empty/i })).toBeVisible()

    // Switch to Drafts.
    await page.getByRole('button', { name: /drafts/i }).click()
    await expect(page).toHaveURL(/tab=drafts/)
    await expect(page.getByRole('heading', { name: /no drafts right now/i })).toBeVisible()

    // Switch to Collections (teaser, not an error).
    await page.getByRole('button', { name: /collections/i }).click()
    await expect(page).toHaveURL(/tab=collections/)
    await expect(page.getByRole('heading', { name: /collections arrive next week/i })).toBeVisible()
  })

  test('non-teacher viewer is redirected to /sheets', async ({ page }) => {
    await disableTutorials(page)
    await mockTeacherSession(page, { accountType: 'student' })

    // Silence /sheets API while the redirect target settles.
    await page.route('**/api/sheets/leaderboard?*', async (route) => {
      await route.fulfill({ status: 200, json: [] })
    })

    await page.goto('/teach/materials')
    await expect(page).toHaveURL(/\/sheets(\?.*)?$/, { timeout: 7_000 })
  })

  test('self-learner viewer is also redirected away', async ({ page }) => {
    // The page is teacher-only. Self-learners ("other") must not land on it.
    await disableTutorials(page)
    await mockTeacherSession(page, { accountType: 'other' })

    await page.route('**/api/sheets/leaderboard?*', async (route) => {
      await route.fulfill({ status: 200, json: [] })
    })

    await page.goto('/teach/materials')
    await expect(page).toHaveURL(/\/sheets(\?.*)?$/, { timeout: 7_000 })
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * Week 3 — bulk-assign flow
 *
 * Verifies the Week 3 `design_v2_teach_sections`-gated affordance:
 *   - Library rows render checkboxes (selectable mode).
 *   - Selecting a row enables the "Assign to sections" button.
 *   - Clicking "Assign to sections" opens the modal and fires
 *     GET /api/sections so the teacher can pick.
 * ═══════════════════════════════════════════════════════════════════════════ */
async function mockTeacherSessionWithSheets(page) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        id: 77,
        username: 'teacher_betty',
        role: 'student',
        accountType: 'teacher',
        email: 'teacher_betty@studyhub.test',
        emailVerified: true,
        twoFaEnabled: false,
        avatarUrl: null,
        createdAt: '2026-03-16T12:00:00.000Z',
        enrollments: [],
        counts: { courses: 0, sheets: 0, stars: 0 },
        csrfToken: 'csrf-token',
      },
    })
  })
  await page.route('**/api/notifications?*', async (route) => {
    await route.fulfill({ status: 200, json: { notifications: [], unreadCount: 0 } })
  })
  await page.route('**/api/sheets?*', async (route) => {
    // One published sheet in the teacher's library so the checkbox appears.
    await route.fulfill({
      status: 200,
      json: {
        sheets: [
          {
            id: 42,
            title: 'Chapter 1 — overview',
            status: 'published',
            updatedAt: '2026-04-18T10:00:00.000Z',
            course: { code: 'CS101' },
          },
        ],
        total: 1,
      },
    })
  })
  await page.route('**/api/flags/evaluate/*', async (route) => {
    await route.fulfill({ status: 200, json: { enabled: true } })
  })
  // Sections endpoint — empty so the "create your first section" form shows.
  await page.route('**/api/sections', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: { sections: [] } })
    } else {
      await route.fulfill({ status: 200, json: { section: { id: 1, name: 'Block A' } } })
    }
  })
  await page.route('**/api/**', async (route) => {
    const method = route.request().method()
    if (method === 'GET') await route.fulfill({ status: 200, json: {} })
    else await route.fulfill({ status: 200, json: { ok: true } })
  })
}

test.describe('@smoke /teach/materials bulk-assign (Week 3)', () => {
  test('selecting a library row enables Assign to sections', async ({ page }) => {
    await disableTutorials(page)
    await mockTeacherSessionWithSheets(page)

    await page.goto('/teach/materials')

    // Row is rendered as a selectable div with a checkbox when the flag is on.
    const rowCheckbox = page.getByRole('checkbox', { name: /Select Chapter 1/i })
    await expect(rowCheckbox).toBeVisible()

    const assignBtn = page.getByRole('button', { name: /assign to sections/i })
    await expect(assignBtn).toBeVisible()
    await expect(assignBtn).toBeDisabled()

    await rowCheckbox.check()
    await expect(assignBtn).toBeEnabled()
  })

  test('clicking Assign opens the picker modal and shows the empty-sections form', async ({
    page,
  }) => {
    await disableTutorials(page)
    await mockTeacherSessionWithSheets(page)

    await page.goto('/teach/materials')

    await page.getByRole('checkbox', { name: /Select Chapter 1/i }).check()
    await page.getByRole('button', { name: /assign to sections/i }).click()

    // Modal opens and the empty-sections inline form is visible.
    await expect(page.getByRole('dialog', { name: /assign materials to sections/i })).toBeVisible()
    await expect(page.getByText(/You have no sections yet/i)).toBeVisible()
  })
})
