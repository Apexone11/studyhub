import { expect, test } from '@playwright/test'

const TARGET_USERNAME = process.env.BETA_STUDENT1_USERNAME || 'beta_student1'
const TARGET_PASSWORD = process.env.BETA_STUDENT1_PASSWORD || 'BetaStudent123!'
const PUBLIC_USERNAME = process.env.BETA_STUDENT2_USERNAME || 'beta_student2'
const OUTSIDER_USERNAME = process.env.BETA_STUDENT3_USERNAME || 'beta_student3'
const OUTSIDER_PASSWORD = process.env.BETA_STUDENT3_PASSWORD || 'BetaStudent123!'
const API_BASE_URL = process.env.BETA_API_URL || 'http://localhost:4000'
const FRONTEND_BASE_URL = process.env.BETA_FRONTEND_URL || 'http://localhost:5173'
const SEARCH_QUERY = 'beta_student'

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
  })
}

async function loginViaApi(page, username, password) {
  const response = await page.request.post(`${API_BASE_URL}/api/auth/login`, {
    headers: { 'content-type': 'application/json' },
    data: { username, password },
  })

  const payload = await response.json()

  expect(response.ok(), JSON.stringify(payload)).toBe(true)
  expect(payload.user?.username).toBe(username)

  return payload
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

async function openSearchModal(page) {
  await page.getByText('Search sheets, courses...', { exact: true }).click()
  await expect(page.getByPlaceholder('Search sheets, courses, users...')).toBeVisible()
}

async function runUserSearch(page, query) {
  await openSearchModal(page)
  const input = page.getByPlaceholder('Search sheets, courses, users...')
  const responsePromise = page.waitForResponse((response) => {
    if (!response.url().startsWith(`${API_BASE_URL}/api/search`)) return false

    const url = new URL(response.url())
    return url.searchParams.get('q') === query
  })

  await input.fill(query)

  const response = await responsePromise
  expect(response.ok()).toBe(true)

  return response.json()
}

test.describe('live beta-stack search privacy', () => {
  test('unauthenticated users do not see classmates-only profiles in global search @beta', async ({ page }) => {
    await disableTutorials(page)
    await waitForFrontendReady(page)
    await page.goto('/')

    const payload = await runUserSearch(page, SEARCH_QUERY)
    const usernames = payload.results?.users?.map((user) => user.username) || []

    expect(usernames).toContain(PUBLIC_USERNAME)
    expect(usernames).not.toContain(TARGET_USERNAME)
  })

  test('non-classmates do not see classmates-only profiles in global search @beta', async ({ page }) => {
    await disableTutorials(page)
    await waitForFrontendReady(page)
    await loginViaApi(page, OUTSIDER_USERNAME, OUTSIDER_PASSWORD)
    await page.goto('/sheets')

    await expect(page.getByRole('heading', { name: 'Study Sheets' })).toBeVisible()

    const payload = await runUserSearch(page, SEARCH_QUERY)
    const usernames = payload.results?.users?.map((user) => user.username) || []

    expect(usernames).toContain(PUBLIC_USERNAME)
    expect(usernames).toContain(OUTSIDER_USERNAME)
    expect(usernames).not.toContain(TARGET_USERNAME)
  })
})