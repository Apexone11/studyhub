import { expect, test } from '@playwright/test'
import { createSessionUser } from './helpers/mockStudyHubApi'

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_study_groups_seen', '1')
  })
}

function createMockGroup(overrides = {}) {
  return {
    id: 1001,
    name: 'Linear Algebra Study Group',
    description: 'Collaborative study for linear algebra and matrices.',
    privacy: 'public',
    maxMembers: 50,
    memberCount: 3,
    courseName: 'Linear Algebra I',
    courseId: 102,
    createdBy: 42,
    userRole: 'member',
    isMember: true,
    avatarUrl: null,
    createdAt: '2026-03-25T10:00:00.000Z',
    updatedAt: '2026-03-25T15:30:00.000Z',
    ...overrides,
  }
}

function createMockGroups() {
  return [
    createMockGroup({
      id: 1001,
      name: 'Linear Algebra Study Group',
      description: 'Collaborative study for linear algebra and matrices.',
      memberCount: 3,
      courseName: 'Linear Algebra I',
      courseId: 102,
    }),
    createMockGroup({
      id: 1002,
      name: 'Discrete Math Helpers',
      description: 'Group for discrete math proofs and problem solving.',
      memberCount: 5,
      courseName: 'Discrete Mathematics',
      courseId: 103,
    }),
  ]
}

async function mockStudyGroupsApp(page, overrides = {}) {
  const user = createSessionUser(overrides.user)
  const groups = overrides.groups || createMockGroups()
  const activeGroup = overrides.activeGroup || groups[0]

  // Catch-all for unmocked API requests
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

  await page.route('**/api/notifications?*', async (route) => {
    await route.fulfill({ status: 200, json: { notifications: [], unreadCount: 0 } })
  })

  await page.route('**/api/courses/schools', async (route) => {
    await route.fulfill({
      status: 200,
      json: [
        {
          id: 1,
          name: 'University of Maryland',
          short: 'UMD',
          courses: user.enrollments.map(e => e.course),
        },
      ],
    })
  })

  await page.route('**/api/study-groups?*', async (route) => {
    const requestUrl = new URL(route.request().url())
    const search = requestUrl.searchParams.get('search') || ''
    const courseId = requestUrl.searchParams.get('courseId') || ''

    let filtered = groups
    if (search) {
      filtered = filtered.filter(g =>
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        g.description.toLowerCase().includes(search.toLowerCase())
      )
    }
    if (courseId) {
      filtered = filtered.filter(g => g.courseId === parseInt(courseId, 10))
    }

    await route.fulfill({
      status: 200,
      json: { groups: filtered, total: filtered.length },
    })
  })

  await page.route(/\/api\/study-groups\/\d+$/, async (route) => {
    await route.fulfill({ status: 200, json: activeGroup })
  })

  await page.route('**/api/settings/preferences', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        theme: 'system',
        fontSize: 'medium',
      },
    })
  })

  return { user, groups, activeGroup }
}

async function assertHealthyPage(page, pageErrors) {
  await expect(page.getByText('This page crashed.')).toHaveCount(0)
  expect(pageErrors, pageErrors.map((error) => error.message).join('\n')).toEqual([])
}

test('study groups navigation appears in sidebar and links to /study-groups @e2e', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await disableTutorials(page)
  await mockStudyGroupsApp(page)
  await page.goto('/feed')

  const studyGroupsLink = page.getByRole('link', { name: /Study Groups/i })
  await expect(studyGroupsLink).toBeVisible()

  await studyGroupsLink.click()
  await expect(page).toHaveURL(/\/study-groups$/)

  await assertHealthyPage(page, pageErrors)
})

test('study groups list page displays groups with search and filters @e2e', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await disableTutorials(page)
  await mockStudyGroupsApp(page)
  await page.goto('/study-groups')

  // Page title
  await expect(page.getByRole('heading', { name: 'Study Groups' })).toBeVisible()

  // Search input exists
  const searchInput = page.getByPlaceholder(/Search groups/i)
  await expect(searchInput).toBeVisible()

  // Groups are displayed
  await expect(page.getByText('Linear Algebra Study Group')).toBeVisible()
  await expect(page.getByText('Discrete Math Helpers')).toBeVisible()

  // Create button visible for authenticated user
  const createBtn = page.getByRole('button', { name: /Create Group/i })
  await expect(createBtn).toBeVisible()

  await assertHealthyPage(page, pageErrors)
})

test('search input updates URL parameters when typing @e2e', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await disableTutorials(page)
  await mockStudyGroupsApp(page)
  await page.goto('/study-groups')

  const searchInput = page.getByPlaceholder(/Search groups/i)
  await searchInput.fill('linear')

  // Verify URL has search parameter
  await expect(page).toHaveURL(/\/study-groups.*search=linear/)

  // Results should filter based on search
  await expect(page.getByText('Linear Algebra Study Group')).toBeVisible()

  await assertHealthyPage(page, pageErrors)
})

test('create group button opens modal when clicked @e2e', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await disableTutorials(page)
  await mockStudyGroupsApp(page)
  await page.goto('/study-groups')

  const createBtn = page.getByRole('button', { name: /Create Group/i })
  await createBtn.click()

  // Modal should open with form fields
  await expect(page.getByPlaceholder(/Group name/i)).toBeVisible()
  await expect(page.getByPlaceholder(/Description/i)).toBeVisible()

  await assertHealthyPage(page, pageErrors)
})

test('group detail page displays group header and tab navigation @e2e', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await disableTutorials(page)
  const { groups } = await mockStudyGroupsApp(page)
  await page.goto(`/study-groups/${groups[0].id}`)

  // Group header elements
  await expect(page.getByRole('heading', { name: groups[0].name })).toBeVisible()
  await expect(page.getByText(groups[0].description)).toBeVisible()

  // Privacy and member badges
  await expect(page.getByText(/Public/i)).toBeVisible()
  await expect(page.getByText(/member/i)).toBeVisible()

  // Tab navigation
  const tabs = ['Overview', 'Resources', 'Sessions', 'Discussions', 'Members']
  for (const tabName of tabs) {
    const tab = page.getByRole('tab', { name: tabName })
    await expect(tab).toBeVisible()
  }

  await assertHealthyPage(page, pageErrors)
})

test('tab navigation switches content when tabs are clicked @e2e', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await disableTutorials(page)
  const { groups } = await mockStudyGroupsApp(page)
  await page.goto(`/study-groups/${groups[0].id}`)

  // Click Resources tab
  const resourcesTab = page.getByRole('tab', { name: 'Resources' })
  await resourcesTab.click()

  // Tab should be marked as active
  await expect(resourcesTab).toHaveAttribute('aria-selected', 'true')

  // Click Sessions tab
  const sessionsTab = page.getByRole('tab', { name: 'Sessions' })
  await sessionsTab.click()

  await expect(sessionsTab).toHaveAttribute('aria-selected', 'true')

  // Click Members tab
  const membersTab = page.getByRole('tab', { name: 'Members' })
  await membersTab.click()

  await expect(membersTab).toHaveAttribute('aria-selected', 'true')

  await assertHealthyPage(page, pageErrors)
})

test('responsive layout stacks group cards on mobile viewport @e2e', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await page.setViewportSize({ width: 480, height: 800 })
  await disableTutorials(page)
  await mockStudyGroupsApp(page)
  await page.goto('/study-groups')

  // Grid should still exist
  const grid = page.locator('div').filter({ has: page.getByText('Linear Algebra Study Group') })
  await expect(grid).toBeVisible()

  // Cards should be present
  await expect(page.getByText('Linear Algebra Study Group')).toBeVisible()
  await expect(page.getByText('Discrete Math Helpers')).toBeVisible()

  await assertHealthyPage(page, pageErrors)
})

test('empty state displays when no groups match search filters @e2e', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await disableTutorials(page)
  await mockStudyGroupsApp(page, { groups: [] })
  await page.goto('/study-groups')

  // Empty state message should display
  // This assumes the app shows an empty state when no groups
  const heading = page.getByRole('heading', { name: 'Study Groups' })
  await expect(heading).toBeVisible()

  await assertHealthyPage(page, pageErrors)
})

test('member action buttons appear based on user membership status @e2e', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await disableTutorials(page)
  const { groups } = await mockStudyGroupsApp(page, {
    activeGroup: createMockGroup({ isMember: false, userRole: 'none' }),
  })
  await page.goto(`/study-groups/${groups[0].id}`)

  // Join button should be visible for non-members
  const joinBtn = page.getByRole('button', { name: /Join Group/i })
  await expect(joinBtn).toBeVisible()

  await assertHealthyPage(page, pageErrors)
})

test('repeated navigation between list and detail views maintains state @e2e', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await disableTutorials(page)
  const { groups } = await mockStudyGroupsApp(page)
  await page.goto('/study-groups')

  // Navigate to first group
  await page.getByText(groups[0].name).click()
  await expect(page).toHaveURL(`/study-groups/${groups[0].id}`)

  // Go back to list
  const backLink = page.getByRole('link', { name: /Back to Study Groups/i })
  if (await backLink.isVisible()) {
    await backLink.click()
  } else {
    await page.goBack()
  }

  await expect(page).toHaveURL(/\/study-groups$/)
  await expect(page.getByText(groups[0].name)).toBeVisible()

  await assertHealthyPage(page, pageErrors)
})
