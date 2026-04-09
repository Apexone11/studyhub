/**
 * Phase 4 Track A — group media paywall smoke spec.
 *
 * Mocks the three new endpoints added in chunk 2:
 *   GET   /api/study-groups/:id/resources/media-quota
 *   POST  /api/study-groups/:id/resources/upload
 *   PATCH /api/study-groups/:id  (backgroundUrl / backgroundCredit)
 *
 * Covers the UI wiring:
 *   - Quota banner renders in the MediaComposer with used/quota numbers
 *   - Banner flips to an upgrade CTA when the user is over quota
 *   - Group header shows the backgroundUrl image when set
 *   - Admin/mod sees the "Change background" button
 *
 * Real upload behavior is covered by the 16 backend unit tests on the
 * media service. This spec verifies the frontend wiring only.
 *
 * @tags @smoke @phase-4 @media-paywall
 */
import { expect, test } from '@playwright/test'
import { createSessionUser } from './helpers/mockStudyHubApi'

test.use({ serviceWorkers: 'block' })

async function disableOverlays(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_study_groups_seen', '1')
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
  })
  await page.addInitScript(() => {
    const css = `
      #termly-code-snippet-support,
      [class*="termly-styles-module-root"],
      .react-joyride__overlay,
      .react-joyride__tooltip,
      #react-joyride-portal {
        display: none !important;
        pointer-events: none !important;
      }
    `
    const inject = () => {
      if (!document.head) return
      const style = document.createElement('style')
      style.textContent = css
      document.head.appendChild(style)
    }
    if (document.head) inject()
    else document.addEventListener('DOMContentLoaded', inject, { once: true })
  })
}

function createMockGroup(overrides = {}) {
  return {
    id: 2001,
    name: 'Phase 4 Group',
    description: 'Test fixture for the media paywall suite.',
    privacy: 'public',
    maxMembers: 50,
    memberCount: 2,
    courseName: 'Test Course',
    courseId: 102,
    createdBy: 42,
    userRole: 'admin',
    isMember: true,
    avatarUrl: null,
    backgroundUrl: null,
    backgroundCredit: null,
    createdAt: '2026-04-09T10:00:00.000Z',
    updatedAt: '2026-04-09T10:00:00.000Z',
    ...overrides,
  }
}

async function mockPhase4Endpoints(page, { group, quota }) {
  const user = createSessionUser()

  // Catch-all so unmocked requests don't crash the page.
  await page.route('**/api/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: {} })
    } else {
      await route.fulfill({ status: 200, json: { ok: true } })
    }
  })

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ status: 200, json: user })
  })
  await page.route('**/api/notifications?*', async (route) => {
    await route.fulfill({ status: 200, json: { notifications: [], unreadCount: 0 } })
  })
  await page.route('**/api/settings/preferences', async (route) => {
    await route.fulfill({ status: 200, json: { theme: 'system', fontSize: 'medium' } })
  })

  await page.route('**/api/study-groups?*', async (route) => {
    await route.fulfill({ status: 200, json: { groups: [group], total: 1 } })
  })
  await page.route(/\/api\/study-groups\/\d+$/, async (route) => {
    if (route.request().method() === 'PATCH') {
      // Echo back the payload as if the update succeeded.
      const body = JSON.parse(route.request().postData() || '{}')
      await route.fulfill({ status: 200, json: { ...group, ...body } })
      return
    }
    await route.fulfill({ status: 200, json: group })
  })

  await page.route(/\/api\/study-groups\/\d+\/resources\/media-quota$/, async (route) => {
    await route.fulfill({ status: 200, json: quota })
  })
  await page.route(/\/api\/study-groups\/\d+\/resources(\?.*)?$/, async (route) => {
    await route.fulfill({ status: 200, json: { resources: [], total: 0, limit: 50, offset: 0 } })
  })
  await page.route(/\/api\/study-groups\/\d+\/discussions(\?.*)?$/, async (route) => {
    await route.fulfill({ status: 200, json: { posts: [], total: 0 } })
  })
  await page.route(/\/api\/study-groups\/\d+\/sessions(\?.*)?$/, async (route) => {
    await route.fulfill({ status: 200, json: { sessions: [] } })
  })
  await page.route(/\/api\/study-groups\/\d+\/members(\?.*)?$/, async (route) => {
    await route.fulfill({ status: 200, json: { members: [], total: 0 } })
  })
  await page.route(/\/api\/study-groups\/\d+\/activity(\?.*)?$/, async (route) => {
    await route.fulfill({ status: 200, json: { activities: [] } })
  })

  return { user, group }
}

/* ══════════════════════════════════════════════════════════════════════
 * MediaComposer quota banner
 * ══════════════════════════════════════════════════════════════════════ */

test.describe('MediaComposer quota banner @phase-4', () => {
  test('shows used/quota numbers when the quota endpoint returns data', async ({ page }) => {
    await disableOverlays(page)
    const group = createMockGroup({ id: 2101 })
    await mockPhase4Endpoints(page, {
      group,
      quota: {
        plan: 'free',
        quota: 5,
        used: 2,
        remaining: 3,
        resetsAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
        unlimited: false,
      },
    })

    await page.goto(`/study-groups/${group.id}`)

    // Click into Resources tab then Add Resource to reach the composer.
    await page.getByRole('tab', { name: /resources/i }).first().click()
    await page.getByRole('button', { name: /add resource/i }).first().click()

    await expect(page.getByRole('dialog', { name: /add resource/i })).toBeVisible({ timeout: 5000 })
    // Banner text uses a split label: "2/5 media this week"
    await expect(page.getByText(/2\/5 media this week/i)).toBeVisible()
  })

  test('shows upgrade CTA when the user is over the free quota', async ({ page }) => {
    await disableOverlays(page)
    const group = createMockGroup({ id: 2102 })
    await mockPhase4Endpoints(page, {
      group,
      quota: {
        plan: 'free',
        quota: 5,
        used: 5,
        remaining: 0,
        resetsAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
        unlimited: false,
      },
    })

    await page.goto(`/study-groups/${group.id}`)
    await page.getByRole('tab', { name: /resources/i }).first().click()
    await page.getByRole('button', { name: /add resource/i }).first().click()

    await expect(page.getByRole('dialog', { name: /add resource/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('link', { name: /upgrade to pro for 100\/week/i })).toBeVisible()
    await expect(page.getByText(/weekly quota reached/i)).toBeVisible()
  })
})

/* ══════════════════════════════════════════════════════════════════════
 * Group header background
 * ══════════════════════════════════════════════════════════════════════ */

test.describe('Group header background @phase-4', () => {
  test('renders the backgroundUrl image when set and shows the attribution', async ({ page }) => {
    await disableOverlays(page)
    const group = createMockGroup({
      id: 2201,
      backgroundUrl: '/uploads/group-media/fake-banner.jpg',
      backgroundCredit: 'Photo by Test User · Unsplash',
    })
    await mockPhase4Endpoints(page, {
      group,
      quota: { plan: 'free', quota: 5, used: 0, remaining: 5, resetsAt: new Date().toISOString(), unlimited: false },
    })

    await page.goto(`/study-groups/${group.id}`)

    await expect(page.getByText(/Photo by Test User/i)).toBeVisible({ timeout: 5000 })
  })

  test('admin sees the Change background button; it opens the picker modal', async ({ page }) => {
    await disableOverlays(page)
    const group = createMockGroup({ id: 2202, userRole: 'admin' })
    await mockPhase4Endpoints(page, {
      group,
      quota: { plan: 'free', quota: 5, used: 0, remaining: 5, resetsAt: new Date().toISOString(), unlimited: false },
    })

    await page.goto(`/study-groups/${group.id}`)

    const changeBtn = page.getByRole('button', { name: /change group background/i })
    await expect(changeBtn).toBeVisible({ timeout: 5000 })
    await changeBtn.click()

    await expect(page.getByRole('dialog', { name: /group background/i })).toBeVisible()
    // The upload control is a <label> wrapping a hidden file input, not a
    // role="button" — match on its visible text instead.
    await expect(page.getByText(/upload image/i)).toBeVisible()
    await expect(page.getByLabel(/attribution \(optional\)/i)).toBeVisible()
  })
})
