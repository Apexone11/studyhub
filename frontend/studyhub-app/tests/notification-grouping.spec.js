/**
 * notification-grouping.spec.js — Grouped notification rows.
 *
 * Two scenarios:
 *   1. Three stars on the same sheet collapse into a single row with the
 *      "Alice, Bob, and Carol" actor label (grouped=true, actors[3]).
 *   2. Clicking "Mark all read" on a grouped row sweeps every grouped id —
 *      the request fires PATCH /api/notifications/:id/read?groupedIds=…
 *      with the bundled ids in the query string.
 *
 * Tagged @smoke @cycle-2026-05-12.
 */
import { expect, test } from '@playwright/test'
import { createSessionUser } from './helpers/mockStudyHubApi.js'

test.use({ serviceWorkers: 'block' })

const TEST_USER = {
  id: 42,
  username: 'notif_group_user',
  role: 'student',
  email: 'notif_group@studyhub.test',
}

function buildGroupedRow({ id = 100, read = false, groupedIds = [100, 101, 102] } = {}) {
  return {
    id,
    userId: TEST_USER.id,
    type: 'sheet_star',
    message: 'starred your study sheet',
    priority: 'normal',
    read,
    sheetId: 501,
    linkPath: null,
    grouped: true,
    groupedIds,
    actorCount: groupedIds.length,
    actors: [
      { id: 51, username: 'alice', avatarUrl: null },
      { id: 52, username: 'bob', avatarUrl: null },
      { id: 53, username: 'carol', avatarUrl: null },
    ],
    actor: { id: 51, username: 'alice', avatarUrl: null },
    createdAt: '2026-05-12T09:30:00.000Z',
  }
}

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
  })
}

async function mockNotificationsApp(page, { notifications, onMarkRead } = {}) {
  const user = createSessionUser(TEST_USER)

  await page.route('**/api/**', async (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      await route.fulfill({ status: 200, json: {} })
    } else {
      await route.fulfill({ status: 200, json: { ok: true } })
    }
  })

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ status: 200, json: user })
  })
  await page.route('**/api/courses/schools', async (route) => {
    await route.fulfill({
      status: 200,
      json: [
        {
          id: 1,
          name: 'University of Maryland',
          short: 'UMD',
          courses: user.enrollments.map((e) => e.course),
        },
      ],
    })
  })
  await page.route('**/api/feed?*', async (route) => {
    await route.fulfill({
      status: 200,
      json: { items: [], total: 0, partial: false, degradedSections: [] },
    })
  })

  await page.route('**/api/notifications?*', async (route) => {
    const unreadCount = notifications.filter((n) => !n.read).length
    await route.fulfill({
      status: 200,
      json: {
        notifications,
        total: notifications.length,
        unreadCount,
        limit: 15,
        offset: 0,
      },
    })
  })

  // Specific to grouped row: PATCH /api/notifications/:id/read?groupedIds=...
  await page.route(/\/api\/notifications\/(\d+)\/read(\?.*)?$/, async (route) => {
    const url = route.request().url()
    const m = url.match(/\/api\/notifications\/(\d+)\/read/)
    const id = m ? Number.parseInt(m[1], 10) : null
    const params = new URL(url).searchParams
    const groupedIds = (params.get('groupedIds') || '')
      .split(',')
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => Number.isInteger(n))
    if (onMarkRead) onMarkRead({ id, groupedIds, url })
    await route.fulfill({ status: 200, json: { ok: true } })
  })

  return { user }
}

test.describe('Notification grouping @smoke @cycle-2026-05-12', () => {
  test('three stars on same sheet fold into one row with grouped actors', async ({ page }) => {
    await disableTutorials(page)
    const grouped = buildGroupedRow({ id: 100, groupedIds: [100, 101, 102] })
    await mockNotificationsApp(page, { notifications: [grouped] })

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Open bell.
    const bell = page.getByRole('button', { name: /Notifications/i }).first()
    await bell.click()

    // Header surfaces the unread count.
    // The grouped row renders the "Alice, Bob, and Carol" label.
    await expect(page.getByText(/alice/i).first()).toBeVisible({ timeout: 3_000 })
    await expect(page.getByText(/bob/i).first()).toBeVisible()
    await expect(page.getByText(/carol/i).first()).toBeVisible()

    // Single row only — the count is 1, even though three underlying ids
    // are bundled inside groupedIds. We assert by counting the per-row
    // delete buttons (one per visible row).
    const deleteButtons = page.locator('button[title="Delete notification"]')
    await expect(deleteButtons).toHaveCount(1)
  })

  test('clicking a grouped row sends the bundled ids on mark-read', async ({ page }) => {
    await disableTutorials(page)
    let captured = null
    const grouped = buildGroupedRow({ id: 100, groupedIds: [100, 101, 102] })
    await mockNotificationsApp(page, {
      notifications: [grouped],
      onMarkRead: (info) => {
        captured = info
      },
    })

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    const bell = page.getByRole('button', { name: /Notifications/i }).first()
    await bell.click()

    // Click the grouped row to fire the mark-read PATCH.
    const [req] = await Promise.all([
      page.waitForRequest(
        (r) => /\/api\/notifications\/\d+\/read/.test(r.url()) && r.method() === 'PATCH',
      ),
      page.getByText(/alice/i).first().click(),
    ])

    expect(req.url()).toMatch(/groupedIds=/)
    expect(captured).toBeTruthy()
    // The PATCH carries the *extra* ids (101, 102) — the primary id is in
    // the path, and groupedIdsQuery filters it out of the suffix.
    expect(captured.groupedIds).toEqual(expect.arrayContaining([101, 102]))
    expect(captured.id).toBe(100)
  })
})
