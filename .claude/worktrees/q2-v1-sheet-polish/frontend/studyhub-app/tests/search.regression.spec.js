import { expect, test } from '@playwright/test'

const SESSION_USER = {
  id: 42,
  username: 'regression_student',
  role: 'student',
  email: 'regression_student@studyhub.test',
  emailVerified: true,
  twoFaEnabled: false,
  avatarUrl: null,
  createdAt: '2026-03-19T00:09:00.000Z',
  enrollments: [
    {
      id: 910,
      courseId: 101,
      course: {
        id: 101,
        code: 'CMSC131',
        name: 'Object-Oriented Programming I',
        school: {
          id: 1,
          name: 'University of Maryland',
          short: 'UMD',
        },
      },
    },
  ],
  counts: { courses: 1, sheets: 1, stars: 0 },
  csrfToken: 'csrf-token',
  _count: {
    enrollments: 1,
    studySheets: 1,
  },
}

const COURSE = {
  id: 101,
  code: 'CMSC131',
  name: 'Object-Oriented Programming I',
  school: {
    id: 1,
    name: 'University of Maryland',
    short: 'UMD',
  },
}

const SHEET = {
  id: 501,
  title: 'Recursion Exam Guide',
  description: 'Practice prompts and base-case patterns for recursion-heavy exams.',
  content: 'Recursive traces, stack frames, and recurrence warmups.',
  createdAt: '2026-03-19T00:10:00.000Z',
  updatedAt: '2026-03-19T00:10:00.000Z',
  userId: 17,
  stars: 6,
  downloads: 18,
  forks: 1,
  starred: false,
  commentCount: 0,
  reactions: { likes: 2, dislikes: 0, userReaction: null },
  course: COURSE,
  author: { id: 17, username: 'public_author' },
  incomingContributions: [],
  outgoingContributions: [],
  hasAttachment: false,
  attachmentName: null,
  attachmentType: null,
  allowDownloads: true,
}

const VISIBLE_USER = {
  id: 80,
  username: 'public_user',
  role: 'student',
  avatarUrl: null,
  createdAt: '2026-03-19T00:11:00.000Z',
}

async function mockPublicSearchApp(page) {
  let sessionMode = 'public'

  await page.route('**/api/auth/me', async (route) => {
    if (sessionMode === 'authenticated') {
      await route.fulfill({ status: 200, json: SESSION_USER })
      return
    }

    await route.fulfill({ status: 401, json: { error: 'Not authenticated.' } })
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

  await page.route('**/api/notifications?*', async (route) => {
    await route.fulfill({ status: 200, json: { notifications: [], unreadCount: 0 } })
  })

  await page.route('**/api/courses/schools', async (route) => {
    await route.fulfill({
      status: 200,
      json: [
        {
          id: COURSE.school.id,
          name: COURSE.school.name,
          short: COURSE.school.short,
          courses: [COURSE],
        },
      ],
    })
  })

  await page.route('**/api/sheets?*', async (route) => {
    const requestUrl = new URL(route.request().url())
    const search = requestUrl.searchParams.get('search') || ''
    const courseId = requestUrl.searchParams.get('courseId') || ''

    const matchesSearch = !search || search.toLowerCase() === 'recursion'
    const matchesCourse = !courseId || Number(courseId) === COURSE.id
    const sheets = matchesSearch && matchesCourse ? [SHEET] : []

    await route.fulfill({ status: 200, json: { sheets, total: sheets.length } })
  })

  await page.route('**/api/search?*', async (route) => {
    const requestUrl = new URL(route.request().url())
    const query = (requestUrl.searchParams.get('q') || '').toLowerCase()

    if (query.includes('cmsc')) {
      await route.fulfill({
        status: 200,
        json: {
          query,
          type: 'all',
          results: {
            sheets: [],
            courses: [COURSE],
            users: [],
          },
        },
      })
      return
    }

    if (query.includes('user')) {
      await route.fulfill({
        status: 200,
        json: {
          query,
          type: 'all',
          results: {
            sheets: [],
            courses: [],
            users: [VISIBLE_USER],
          },
        },
      })
      return
    }

    await route.fulfill({
      status: 200,
      json: {
        query,
        type: 'all',
        results: {
          sheets: [],
          courses: [],
          users: [],
        },
      },
    })
  })

  return {
    setAuthenticated() {
      sessionMode = 'authenticated'
    },
  }
}

function assertHealthyPage(pageErrors) {
  expect(pageErrors, pageErrors.map((error) => error.message).join('\n')).toEqual([])
}

async function disableSheetTutorial(page) {
  await page.evaluate(() => window.localStorage.setItem('tutorial_sheets_seen', '1'))
}

test('public search flows preserve canonical navigation and visible-user results @regression', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await page.addInitScript(() => {
    window.__studyhubNavs = []

    const wrapHistoryMethod = (methodName) => {
      const originalMethod = window.history[methodName]

      window.history[methodName] = function patchedHistoryMethod(state, title, url) {
        window.__studyhubNavs.push(String(url || window.location.pathname + window.location.search))
        return originalMethod.apply(this, [state, title, url])
      }
    }

    wrapHistoryMethod('pushState')
    wrapHistoryMethod('replaceState')
  })

  const app = await mockPublicSearchApp(page)
  await page.goto('/')

  await page.getByPlaceholder('Search sheets, courses, topics...').fill('recursion')
  await page.getByRole('button', { name: 'Search' }).click()

  await expect(page).toHaveURL(/\/login$/)

  const publicNavigationHistory = await page.evaluate(() => window.__studyhubNavs)
  expect(publicNavigationHistory).toContain('/sheets?search=recursion')

  app.setAuthenticated()
  await disableSheetTutorial(page)
  await page.goto('/sheets?search=recursion')

  await expect(page).toHaveURL(/\/sheets\?search=recursion$/)
  await expect(page.getByRole('heading', { name: 'Study Sheets' })).toBeVisible()
  await expect(page.getByRole('link', { name: SHEET.title })).toBeVisible()

  await page.getByText('Search sheets, courses...', { exact: true }).click()
  await page.getByPlaceholder('Search sheets, courses, users...').fill('cmsc')

  await expect(page.getByText(`${COURSE.code} — ${COURSE.name}`)).toBeVisible()
  await page.getByText(`${COURSE.code} — ${COURSE.name}`).click()

  await expect(page).toHaveURL(new RegExp(`/sheets\\?courseId=${COURSE.id}$`))
  await expect(page.getByRole('link', { name: SHEET.title })).toBeVisible()

  await page.getByText('Search sheets, courses...', { exact: true }).click()
  await page.getByPlaceholder('Search sheets, courses, users...').fill('user')

  await expect(page.getByText(VISIBLE_USER.username, { exact: true })).toBeVisible()
  await expect(page.getByText('hidden_user', { exact: true })).toHaveCount(0)

  assertHealthyPage(pageErrors)
})

test('legacy sheets URLs normalize q and course into canonical params @regression', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error))

  const app = await mockPublicSearchApp(page)
  app.setAuthenticated()

  await page.goto('/')
  await disableSheetTutorial(page)
  await page.goto('/sheets?q=recursion&course=101')

  await expect(page).toHaveURL(/\/sheets\?search=recursion&courseId=101$/)
  await expect(page.getByRole('heading', { name: 'Study Sheets' })).toBeVisible()
  await expect(page.getByRole('link', { name: SHEET.title })).toBeVisible()

  assertHealthyPage(pageErrors)
})