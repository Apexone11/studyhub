import { expect, test } from '@playwright/test'

const FRONTEND_BASE_URL = process.env.BETA_FRONTEND_URL || 'http://localhost:5173'

const VIEWPORT = { width: 1365, height: 900 }

const PUBLIC_SURFACES = [
  {
    route: '/login',
    snapshot: 'dark-public-login.png',
    ready: (page) => page.getByRole('button', { name: 'Sign In', exact: true }),
  },
  {
    route: '/register',
    snapshot: 'dark-public-register.png',
    ready: (page) => page.getByRole('button', { name: 'Create Account' }),
  },
  {
    route: '/forgot-password',
    snapshot: 'dark-public-forgot-password.png',
    ready: (page) => page.getByRole('button', { name: 'Send Reset Link' }),
  },
  {
    route: '/reset-password?token=beta-reset-token',
    snapshot: 'dark-public-reset-password.png',
    ready: (page) => page.getByRole('button', { name: 'Set New Password' }),
  },
  {
    route: '/pricing',
    snapshot: 'dark-public-pricing-top.png',
    ready: (page) => page.getByRole('heading', { name: 'StudyHub Pro' }),
  },
  {
    route: '/pricing',
    snapshot: 'dark-public-pricing-donation.png',
    ready: (page) => page.getByRole('heading', { name: 'Support StudyHub' }),
    beforeCapture: async (page) => {
      await page.getByRole('heading', { name: 'Support StudyHub' }).scrollIntoViewIfNeeded()
    },
  },
  {
    route: '/supporters',
    snapshot: 'dark-public-supporters.png',
    ready: (page) => page.getByRole('heading', { name: 'Our Supporters' }),
  },
  {
    route: '/terms',
    snapshot: 'dark-public-terms.png',
    ready: (page) => page.locator('.legal-title'),
  },
  {
    route: '/privacy',
    snapshot: 'dark-public-privacy.png',
    ready: (page) => page.locator('.legal-title'),
  },
  {
    route: '/guidelines',
    snapshot: 'dark-public-guidelines.png',
    ready: (page) => page.locator('.legal-title'),
  },
]

test.describe('live beta public dark-mode visual smoke', () => {
  test.use({ viewport: VIEWPORT })

  test('public dark surfaces stay visually stable @beta', async ({ browser }) => {
    test.setTimeout(180000)
    const session = await createDarkModeSession(browser)

    try {
      for (const surface of PUBLIC_SURFACES) {
        await captureSurface(session.page, surface)
      }
    } finally {
      await session.context.close().catch(() => {})
    }
  })
})

async function createDarkModeSession(browser) {
  const context = await browser.newContext({
    baseURL: FRONTEND_BASE_URL,
    viewport: VIEWPORT,
    colorScheme: 'dark',
  })

  await context.addInitScript(() => {
    window.localStorage.setItem('sh-theme', 'dark')
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

    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')

    window.addEventListener('studyhub:auth-expired', (event) => {
      event.stopImmediatePropagation()
    }, { capture: true })
  })

  const page = await context.newPage()
  await waitForFrontendReady(page)

  return { context, page }
}

async function captureSurface(page, surface) {
  await page.goto(surface.route, { waitUntil: 'domcontentloaded' })
  await expect.poll(
    async () => page.evaluate(() => document.documentElement.getAttribute('data-theme')),
    { timeout: 15000 }
  ).toBe('dark')

  await dismissBlockingPrompts(page)
  await expect(surface.ready(page)).toBeVisible({ timeout: 20000 })
  await waitForSurfaceStability(page, surface)

  if (surface.beforeCapture) {
    await surface.beforeCapture(page)
    await page.waitForTimeout(150)
  } else {
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }))
  }

  await stabilizeForSnapshot(page)

  await expect(page).toHaveScreenshot(surface.snapshot, {
    animations: 'disabled',
    caret: 'hide',
    fullPage: false,
    scale: 'css',
    maxDiffPixelRatio: 0.01,
  })
}

async function stabilizeForSnapshot(page) {
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

  await page.evaluate(() => {
    document.getElementById('sh-update-banner')?.remove()

    for (const element of document.querySelectorAll('button, div')) {
      const styles = window.getComputedStyle(element)
      if (styles.position === 'fixed' && Number(styles.zIndex || 0) >= 9997 && styles.bottom !== 'auto') {
        element.style.display = 'none'
      }
    }
  }).catch(() => {})

  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready
    }
  })

  await page.waitForTimeout(250)
}

async function waitForSurfaceStability(page, surface) {
  if (!surface.route.startsWith('/terms') && !surface.route.startsWith('/privacy') && !surface.route.startsWith('/guidelines')) {
    return
  }

  await expect.poll(async () => page.getByText('Loading legal document...').count(), {
    timeout: 25000,
    message: `legal document viewer did not settle for ${surface.route}`,
  }).toBe(0)

  await page.waitForTimeout(200)
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
