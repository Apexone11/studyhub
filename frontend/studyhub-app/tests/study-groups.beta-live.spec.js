import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

const ADMIN_USERNAME = process.env.BETA_ADMIN_USERNAME || 'beta_admin'
const ADMIN_PASSWORD = process.env.BETA_ADMIN_PASSWORD || 'BetaAdmin123!'
const OWNER_USERNAME = process.env.BETA_OWNER_USERNAME || 'studyhub_owner'
const OWNER_PASSWORD = process.env.BETA_OWNER_PASSWORD || 'AdminPass123'
const STUDENT1_USERNAME = process.env.BETA_STUDENT1_USERNAME || 'beta_student1'
const STUDENT1_PASSWORD = process.env.BETA_STUDENT1_PASSWORD || 'BetaStudent123!'
const STUDENT2_USERNAME = process.env.BETA_STUDENT2_USERNAME || 'beta_student2'
const STUDENT2_PASSWORD = process.env.BETA_STUDENT2_PASSWORD || 'BetaStudent123!'
const STUDENT3_USERNAME = process.env.BETA_STUDENT3_USERNAME || 'beta_student3'
const STUDENT3_PASSWORD = process.env.BETA_STUDENT3_PASSWORD || 'BetaStudent123!'
const API_BASE_URL = process.env.BETA_API_URL || 'http://localhost:4000'
const FRONTEND_BASE_URL = process.env.BETA_FRONTEND_URL || 'http://localhost:5173'

test.describe('live beta study-group flows', () => {
  test('private join requests surface as pending and can be approved end-to-end @beta', async ({ browser }) => {
    const cleanupGroupIds = []
    const admin = await createAuthenticatedPage(browser, STUDENT3_USERNAME, STUDENT3_PASSWORD)
    const student = await createAuthenticatedPage(browser, STUDENT1_USERNAME, STUDENT1_PASSWORD)

    try {
      const { firstCourse } = await getDistinctSchoolCourses(admin.page)
      const group = await createGroup(admin, {
        name: uniqueName('Pending Approval'),
        description: 'Live beta verification for private join approval.',
        courseId: firstCourse.id,
        privacy: 'private',
      })
      cleanupGroupIds.push(group.id)

      await joinGroup(student, group.id)
      await student.page.goto(`/study-groups/${group.id}`)
      await dismissBlockingPrompts(student.page)
      await expect(student.page.getByRole('button', { name: 'Request Pending' })).toBeDisabled()

      await admin.page.goto(`/study-groups/${group.id}`)
      await dismissBlockingPrompts(admin.page)
      await openMembersTab(admin.page)
      const pendingCard = memberCard(admin.page, STUDENT1_USERNAME)
      await expect(pendingCard.getByText('Pending')).toBeVisible()
      await pendingCard.getByRole('button', { name: 'Approve' }).click()
      await expect(pendingCard.getByText('Pending')).toHaveCount(0)

      await student.page.reload()
      await expect(student.page.getByRole('button', { name: 'Leave Group' })).toBeVisible()
    } finally {
      await cleanupGroups(admin, cleanupGroupIds)
      await closeAuthenticatedPages(admin, student)
    }
  })

  test('invited users can accept live invitations @beta', async ({ browser }) => {
    const cleanupGroupIds = []
    const admin = await createAuthenticatedPage(browser, STUDENT3_USERNAME, STUDENT3_PASSWORD)
    const invitedUser = await createAuthenticatedPage(browser, STUDENT2_USERNAME, STUDENT2_PASSWORD)

    try {
      const { firstCourse } = await getDistinctSchoolCourses(admin.page)
      const group = await createGroup(admin, {
        name: uniqueName('Invite Acceptance'),
        description: 'Live beta verification for accepting study-group invites.',
        courseId: firstCourse.id,
        privacy: 'invite_only',
      })
      cleanupGroupIds.push(group.id)

      await inviteUser(admin, group.id, STUDENT2_USERNAME)

      await invitedUser.page.goto(`/study-groups/${group.id}`)
      await dismissBlockingPrompts(invitedUser.page)
      await expect(invitedUser.page.getByRole('heading', { name: group.name })).toBeVisible()
      await invitedUser.page.getByRole('button', { name: 'Accept Invitation' }).click()
      await expect(invitedUser.page.getByRole('button', { name: 'Leave Group' })).toBeVisible()
    } finally {
      await cleanupGroups(admin, cleanupGroupIds)
      await closeAuthenticatedPages(admin, invitedUser)
    }
  })

  test('moderators can remove members but not admins @beta', async ({ browser }) => {
    const cleanupGroupIds = []
    const admin = await createAuthenticatedPage(browser, OWNER_USERNAME, OWNER_PASSWORD)
    const moderator = await createAuthenticatedPage(browser, STUDENT2_USERNAME, STUDENT2_PASSWORD)
    const member = await createAuthenticatedPage(browser, STUDENT3_USERNAME, STUDENT3_PASSWORD)

    try {
      const { firstCourse } = await getDistinctSchoolCourses(admin.page)
      const group = await createGroup(admin, {
        name: uniqueName('Moderator Removal'),
        description: 'Live beta verification for moderator member-removal rules.',
        courseId: firstCourse.id,
        privacy: 'public',
      })
      cleanupGroupIds.push(group.id)

      await joinGroup(member, group.id)
      const moderatorMembership = await joinGroup(moderator, group.id)
      await updateMember(admin, group.id, moderatorMembership.userId, { role: 'moderator' })

      await moderator.page.goto(`/study-groups/${group.id}`)
      await dismissBlockingPrompts(moderator.page)
      await openMembersTab(moderator.page)

      const adminCard = memberCard(moderator.page, OWNER_USERNAME)
      await expect(adminCard.getByRole('button', { name: 'Remove' })).toHaveCount(0)

      const memberCardLocator = memberCard(moderator.page, STUDENT3_USERNAME)
      await expect(memberCardLocator.getByRole('button', { name: 'Remove' })).toBeVisible()
      moderator.page.once('dialog', (dialog) => dialog.accept())
      await memberCardLocator.getByRole('button', { name: 'Remove' }).click()
      await expect(moderator.page.getByText(STUDENT3_USERNAME, { exact: true })).toHaveCount(0)
    } finally {
      await cleanupGroups(admin, cleanupGroupIds)
      await closeAuthenticatedPages(admin, moderator, member)
    }
  })

  test('school and course filters narrow live study groups correctly @beta', async ({ browser }) => {
    const cleanupGroupIds = []
    const admin = await createAuthenticatedPage(browser, OWNER_USERNAME, OWNER_PASSWORD)

    try {
      const {
        firstSchool,
        firstCourse,
        secondSchool,
        secondCourse,
      } = await getDistinctSchoolCourses(admin.page)

      const firstGroup = await createGroup(admin, {
        name: uniqueName(`Filter ${firstSchool.short}`),
        description: 'Live beta verification for school filtering.',
        courseId: firstCourse.id,
        privacy: 'public',
      })
      const secondGroup = await createGroup(admin, {
        name: uniqueName(`Filter ${secondSchool.short}`),
        description: 'Live beta verification for cross-school filtering.',
        courseId: secondCourse.id,
        privacy: 'public',
      })
      cleanupGroupIds.push(firstGroup.id, secondGroup.id)

      const prefix = firstGroup.name.slice(0, 12)
      await admin.page.goto('/study-groups')
      await dismissBlockingPrompts(admin.page)
      await admin.page.getByPlaceholder('Search study groups...').fill(prefix)
      await expect(admin.page.getByText(firstGroup.name, { exact: true })).toBeVisible()
      await expect(admin.page.getByText(secondGroup.name, { exact: true })).toBeVisible()

      const filters = admin.page.getByRole('combobox')
      await filters.nth(0).selectOption(String(firstSchool.id))
      await expect(admin.page.getByText(firstGroup.name, { exact: true })).toBeVisible()
      await expect(admin.page.getByText(secondGroup.name, { exact: true })).toHaveCount(0)

      await filters.nth(1).selectOption(String(firstCourse.id))
      await expect(admin.page.getByText(firstGroup.name, { exact: true })).toBeVisible()

      await filters.nth(0).selectOption(String(secondSchool.id))
      await expect(admin.page.getByText(secondGroup.name, { exact: true })).toBeVisible()
      await expect(admin.page.getByText(firstGroup.name, { exact: true })).toHaveCount(0)
    } finally {
      await cleanupGroups(admin, cleanupGroupIds)
      await closeAuthenticatedPages(admin)
    }
  })
})

async function createAuthenticatedPage(browser, username, password) {
  const context = await browser.newContext({ baseURL: FRONTEND_BASE_URL })
  await context.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_study_groups_seen', '1')
  })

  const page = await context.newPage()
  await waitForFrontendReady(page)
  const payload = await loginViaApi(page, username, password)
  await acceptCurrentLegalDocuments(page, payload.user?.csrfToken || '')

  return {
    context,
    page,
    user: payload.user,
    csrfToken: payload.user?.csrfToken || '',
  }
}

async function closeAuthenticatedPages(...sessions) {
  await Promise.all(sessions.map(async (session) => {
    if (session?.context && typeof session.context.close === 'function') {
      try {
        await session.context.close()
      } catch {
        // Ignore teardown races after a timed-out test closes the context.
      }
    }
  }))
}

async function waitForFrontendReady(page) {
  await expect.poll(async () => {
    try {
      const response = await page.request.get(FRONTEND_BASE_URL, {
        failOnStatusCode: false,
        timeout: 5000,
      })

      return response.ok()
    } catch {
      return false
    }
  }, {
    timeout: 60000,
    message: `beta frontend did not become ready at ${FRONTEND_BASE_URL}`,
  }).toBe(true)
}

async function loginViaApi(page, username, password) {
  const response = await page.request.post(`${API_BASE_URL}/api/auth/login`, {
    headers: { 'content-type': 'application/json' },
    data: { username, password },
  })
  const payload = await readJson(response)

  expect(response.ok(), JSON.stringify(payload)).toBe(true)
  expect(payload.user?.username).toBe(username)

  return payload
}

async function acceptCurrentLegalDocuments(page, csrfToken) {
  const response = await page.request.post(`${API_BASE_URL}/api/legal/me/accept-current`, {
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
  })
  const payload = await readJson(response)

  expect(response.ok(), JSON.stringify(payload)).toBe(true)
  return payload
}

async function getDistinctSchoolCourses(page) {
  const response = await page.request.get(`${API_BASE_URL}/api/courses/schools`)
  const schools = await readJson(response)

  expect(response.ok(), JSON.stringify(schools)).toBe(true)
  const firstSchool = schools.find((school) => Array.isArray(school.courses) && school.courses.length > 0)
  const secondSchool = schools.find((school) => (
    Array.isArray(school.courses)
      && school.courses.length > 0
      && school.id !== firstSchool?.id
  ))

  expect(firstSchool).toBeTruthy()
  expect(secondSchool).toBeTruthy()

  return {
    firstSchool,
    firstCourse: firstSchool.courses[0],
    secondSchool,
    secondCourse: secondSchool.courses[0],
  }
}

async function createGroup(session, data) {
  const response = await session.page.request.post(`${API_BASE_URL}/api/study-groups`, {
    headers: authHeaders(session),
    data,
  })
  const payload = await readJson(response)

  expect(response.ok(), JSON.stringify(payload)).toBe(true)
  return payload
}

async function inviteUser(session, groupId, username) {
  const response = await session.page.request.post(`${API_BASE_URL}/api/study-groups/${groupId}/invite`, {
    headers: authHeaders(session),
    data: { username },
  })
  const payload = await readJson(response)

  expect(response.ok(), JSON.stringify(payload)).toBe(true)
  return payload
}

async function joinGroup(session, groupId) {
  const response = await session.page.request.post(`${API_BASE_URL}/api/study-groups/${groupId}/join`, {
    headers: authHeaders(session),
  })
  const payload = await readJson(response)

  expect(response.ok(), JSON.stringify(payload)).toBe(true)
  return payload
}

async function updateMember(session, groupId, userId, data) {
  const response = await session.page.request.patch(`${API_BASE_URL}/api/study-groups/${groupId}/members/${userId}`, {
    headers: authHeaders(session),
    data,
  })
  const payload = await readJson(response)

  expect(response.ok(), JSON.stringify(payload)).toBe(true)
  return payload
}

async function cleanupGroups(session, groupIds) {
  if (!session?.page || session.page.isClosed()) {
    return
  }

  for (const groupId of groupIds.reverse()) {
    try {
      const response = await session.page.request.delete(`${API_BASE_URL}/api/study-groups/${groupId}`, {
        headers: authHeaders(session),
      })
      expect([204, 404], `cleanup failed for group ${groupId}`).toContain(response.status())
    } catch (error) {
      if (/Target page, context or browser has been closed/i.test(String(error))) {
        return
      }
      throw error
    }
  }
}

async function openMembersTab(page) {
  await page.getByRole('tab', { name: 'Members' }).click()
  await expect(page.getByPlaceholder('Search members...')).toBeVisible()
}

async function dismissBlockingPrompts(page) {
  const cookieDialog = page.getByRole('alertdialog', { name: 'Cookie Consent Prompt' })

  try {
    if (await cookieDialog.isVisible()) {
      await cookieDialog.getByRole('button', { name: 'Accept' }).click()
    }
  } catch {
    // Cookie prompt is optional in beta runs.
  }
}

function memberCard(page, username) {
  return page.getByText(username, { exact: true }).locator('xpath=ancestor::div[1]')
}

function authHeaders(session) {
  return {
    'content-type': 'application/json',
    'x-csrf-token': session.csrfToken,
  }
}

async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function uniqueName(label) {
  return `Beta ${label} ${randomUUID().slice(0, 8)}`
}