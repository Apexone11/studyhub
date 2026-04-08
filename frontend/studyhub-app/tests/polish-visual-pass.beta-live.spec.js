import { expect, test } from '@playwright/test'

const FRONTEND_BASE_URL = process.env.BETA_FRONTEND_URL || 'http://localhost:5173'
const API_BASE_URL = process.env.BETA_API_URL || 'http://localhost:4000'
const STUDENT_USERNAME = process.env.BETA_STUDENT1_USERNAME || 'beta_student1'
const STUDENT_PASSWORD = process.env.BETA_STUDENT1_PASSWORD || 'BetaStudent123!'

const VIEWPORT = { width: 1365, height: 900 }

const SURFACES = [
  {
    route: '/study-groups',
    screenshot: 'study-groups.png',
    ready: (page) => page.getByRole('heading', { name: 'Study Groups' }),
  },
  {
    route: '/messages',
    screenshot: 'messages.png',
    ready: (page) => page.locator('[data-tutorial="messages-conversations"] h2').filter({ hasText: 'Messages' }).first(),
  },
  {
    route: '/supporters',
    screenshot: 'supporters.png',
    ready: (page) => page.getByRole('heading', { name: 'Our Supporters' }),
  },
  {
    route: '/feed',
    screenshot: 'feed.png',
    ready: (page) => page.locator('#feed-search'),
  },
  {
    route: '/terms',
    screenshot: 'terms.png',
    ready: (page) => page.locator('.legal-title'),
    isLegal: true,
  },
  {
    route: '/privacy',
    screenshot: 'privacy.png',
    ready: (page) => page.locator('.legal-title'),
    isLegal: true,
  },
  {
    route: '/guidelines',
    screenshot: 'guidelines.png',
    ready: (page) => page.locator('.legal-title'),
    isLegal: true,
  },
]

test.describe('live beta polish visual pass', () => {
  test.use({ viewport: VIEWPORT })

  test('captures requested beta surfaces @beta', async ({ browser }, testInfo) => {
    test.setTimeout(180000)
    const session = await createAuthenticatedSession(browser)

    try {
      for (const surface of SURFACES) {
        await captureSurface(session.page, surface, testInfo)
      }
    } finally {
      await session.context.close().catch(() => {})
    }
  })
})

async function createAuthenticatedSession(browser) {
  const context = await browser.newContext({
    baseURL: FRONTEND_BASE_URL,
    viewport: VIEWPORT,
  })

  await context.addInitScript(() => {
    window.localStorage.setItem('studyhub_tutorials_disabled', '1')

    const tutorialKeys = [
      'feed',
      'sheets',
      'dashboard',
      'notes',
      'settings',
      'profile',
      'viewer',
      'announcements',
      'upload',
      'messages',
      'studyGroups',
      'myCourses',
    ]

    for (const key of tutorialKeys) {
      window.localStorage.setItem(`tutorial_${key}_seen`, '1')
      window.localStorage.setItem(`tutorial_${key}_v1_seen`, '1')
      window.localStorage.setItem(`tutorial_${key}_v2_seen`, '1')
    }
  })

  const page = await context.newPage()
  await waitForFrontendReady(page)
  const payload = await loginViaApi(page, STUDENT_USERNAME, STUDENT_PASSWORD)
  await acceptCurrentLegalDocuments(page, payload.user?.csrfToken || '')

  return {
    context,
    page,
  }
}

async function captureSurface(page, surface, testInfo) {
  await test.step(`capture ${surface.route}`, async () => {
    await page.goto(surface.route, { waitUntil: 'domcontentloaded' })
    await dismissBlockingPrompts(page)
    await waitForSurfaceStability(page, surface)
    await expect(surface.ready(page)).toBeVisible({ timeout: 20000 })
    await stabilizeForCapture(page)
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }))
    await page.waitForTimeout(200)
    await page.screenshot({
      path: testInfo.outputPath(surface.screenshot),
      fullPage: false,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    })
  })
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

async function waitForSurfaceStability(page, surface) {
  if (!surface.isLegal) {
    return
  }

  await expect.poll(async () => page.getByText('Loading legal document...').count(), {
    timeout: 25000,
    message: `legal document viewer did not settle for ${surface.route}`,
  }).toBe(0)

  await page.waitForTimeout(250)
}

async function stabilizeForCapture(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        transition: none !important;
        caret-color: transparent !important;
      }

      [data-tour],
      .react-joyride__overlay,
      .react-joyride__tooltip,
      .react-joyride__beacon,
      .react-joyride__spotlight,
      #sh-update-banner,
      [style*="z-index: 9997"],
      [style*="z-index: 9998"] {
        display: none !important;
      }
    `,
  }).catch(() => {})

  await page.evaluate(async () => {
    document.getElementById('sh-update-banner')?.remove()

    if (document.fonts?.ready) {
      await document.fonts.ready
    }
  }).catch(() => {})

  await page.waitForTimeout(250)
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

async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}