import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const frontendBaseUrl = String(process.env.BETA_FRONTEND_BASE_URL || 'http://localhost:5173').replace(/\/$/, '')
const apiBaseUrl = String(process.env.BETA_API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '')
const username = String(process.env.BETA_DIAG_USERNAME || process.env.BETA_OWNER_USERNAME || 'studyhub_owner')
const password = String(process.env.BETA_DIAG_PASSWORD || process.env.BETA_OWNER_PASSWORD || 'AdminPass123')
const snapshotSheetId = Number.parseInt(process.env.BETA_SNAPSHOT_SHEET_ID || '111', 10)
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const outputDir = path.resolve(
  process.env.BETA_SNAPSHOT_DIR
    || path.join(process.cwd(), '..', '..', 'beta-artifacts', 'playwright-snapshots', runId),
)

const viewports = [
  { name: 'desktop', width: 1440, height: 900, compact: false },
  { name: 'tablet', width: 1024, height: 768, compact: true },
  { name: 'mobile', width: 390, height: 844, compact: true },
]

const routeChecks = [
  {
    path: '/feed',
    label: 'feed',
    usesSidebar: true,
    assert: async (page) => page.getByText('Share an update').first().waitFor({ state: 'visible', timeout: 15000 }),
  },
  {
    path: '/sheets',
    label: 'sheets',
    usesSidebar: true,
    assert: async (page) => page.getByRole('heading', { name: 'Study Sheets' }).waitFor({ state: 'visible', timeout: 15000 }),
  },
  {
    path: `/sheets/${snapshotSheetId}`,
    label: 'sheet-viewer',
    usesSidebar: true,
    assert: async (page) => page.locator('h1').first().waitFor({ state: 'visible', timeout: 15000 }),
  },
  {
    path: '/dashboard',
    label: 'dashboard',
    usesSidebar: true,
    assert: async (page) => page.getByText('Welcome back,').first().waitFor({ state: 'visible', timeout: 15000 }),
  },
  {
    path: '/notes',
    label: 'notes',
    usesSidebar: true,
    assert: async (page) => page.getByRole('heading', { name: 'My Notes' }).waitFor({ state: 'visible', timeout: 15000 }),
  },
  {
    path: '/announcements',
    label: 'announcements',
    usesSidebar: true,
    assert: async (page) => page.getByRole('heading', { name: 'Announcements' }).waitFor({ state: 'visible', timeout: 15000 }),
  },
  {
    path: '/settings',
    label: 'settings',
    usesSidebar: false,
    assert: async (page) => page.getByRole('button', { name: 'Sign Out' }).waitFor({ state: 'visible', timeout: 15000 }),
  },
  {
    path: '/admin',
    label: 'admin',
    usesSidebar: true,
    assert: async (page) => page.getByRole('heading', { name: 'Admin Overview' }).waitFor({ state: 'visible', timeout: 15000 }),
  },
]

const payload = {
  capturedAt: new Date().toISOString(),
  frontendBaseUrl,
  apiBaseUrl,
  username,
  outputDir,
  viewports,
  pages: [],
  console: [],
  consoleErrors: [],
  pageErrors: [],
  requestFailures: [],
  errors: [],
}

function trim(value, max = 1200) {
  const text = String(value || '')
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function parseSessionCookie(setCookieHeader) {
  const raw = String(setCookieHeader || '')
  const sessionMatch = raw.match(/studyhub_session=([^;]+)/)
  return sessionMatch ? decodeURIComponent(sessionMatch[1]) : ''
}

function sanitizeRoute(routePath) {
  return routePath
    .replace(/^\//, '')
    .replace(/[^a-zA-Z0-9/_-]/g, '_')
    .replace(/\//g, '__') || 'home'
}

function isAppRequestFailure(url) {
  if (!url) return false

  return (
    url.startsWith(frontendBaseUrl)
    || url.startsWith(apiBaseUrl)
    || url.includes('/api/')
  )
}

function isIgnorableRequestFailure(entry) {
  const errorText = String(entry?.errorText || '').toLowerCase()
  return errorText.includes('err_aborted') || errorText.includes('aborted')
}

function routeUrl(routePath) {
  return `${frontendBaseUrl}${routePath}`
}

function viewportRouteScreenshotName(label, viewportName) {
  return `${sanitizeRoute(label)}--${viewportName}.png`
}

async function resolvePreviewPath(context, sessionCookie) {
  const response = await context.request.get(`${apiBaseUrl}/api/feed?limit=200`, {
    headers: sessionCookie ? { Cookie: `studyhub_session=${sessionCookie}` } : undefined,
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(`Could not resolve preview route from feed (${response.status()}).`)
  }

  const items = Array.isArray(data?.items) ? data.items : []
  const previewItem = items.find((item) => item?.hasAttachment && item?.id)

  if (!previewItem) return null

  return previewItem.type === 'sheet'
    ? `/preview/sheet/${previewItem.id}`
    : `/preview/feed-post/${previewItem.id}`
}

async function authenticate(context) {
  const response = await context.request.post(`${apiBaseUrl}/api/auth/login`, {
    data: { username, password },
  })
  const body = await response.json().catch(() => ({}))
  const sessionCookie = parseSessionCookie(response.headers()['set-cookie'])

  payload.login = {
    status: response.status(),
    body,
    hasSessionCookie: Boolean(sessionCookie),
  }

  if (!response.ok() || !sessionCookie) {
    throw new Error(`Beta snapshot login failed (${response.status()}): ${JSON.stringify(body)}`)
  }

  await context.addCookies([
    {
      name: 'studyhub_session',
      value: sessionCookie,
      url: apiBaseUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])

  return sessionCookie
}

async function assertRouteHealth(page, routeCheck, viewport) {
  if (await page.getByText('This page crashed.').count()) {
    throw new Error('Crash fallback rendered for this route.')
  }

  if (routeCheck.usesSidebar && viewport.compact) {
    await page.getByRole('button', { name: 'Open navigation' }).waitFor({ state: 'visible', timeout: 10000 })
  }

  await routeCheck.assert(page)
}

async function captureRoute(page, routeCheck, viewport) {
  const startedAt = Date.now()
  const url = routeUrl(routeCheck.path)
  const screenshotName = viewportRouteScreenshotName(routeCheck.label || routeCheck.path, viewport.name)
  const screenshotPath = path.join(outputDir, screenshotName)
  const consoleErrorCount = payload.consoleErrors.length
  const pageErrorCount = payload.pageErrors.length
  const requestFailureCount = payload.requestFailures.length

  try {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(1200)
    await assertRouteHealth(page, routeCheck, viewport)

    const routeConsoleErrors = payload.consoleErrors.slice(consoleErrorCount)
    const routePageErrors = payload.pageErrors.slice(pageErrorCount)
    const routeRequestFailures = payload.requestFailures
      .slice(requestFailureCount)
      .filter((entry) => !isIgnorableRequestFailure(entry))

    if (routeConsoleErrors.length > 0) {
      throw new Error(`Console errors detected: ${routeConsoleErrors.map((entry) => entry.text).join(' | ')}`)
    }
    if (routePageErrors.length > 0) {
      throw new Error(`Page errors detected: ${routePageErrors.map((entry) => entry.message).join(' | ')}`)
    }
    if (routeRequestFailures.length > 0) {
      throw new Error(`Network request failures detected: ${routeRequestFailures.map((entry) => entry.url).join(' | ')}`)
    }

    await page.screenshot({ path: screenshotPath, fullPage: true })

    payload.pages.push({
      route: routeCheck.path,
      routeLabel: routeCheck.label || routeCheck.path,
      viewport: viewport.name,
      url,
      ok: true,
      screenshot: screenshotPath,
      finalUrl: page.url(),
      elapsedMs: Date.now() - startedAt,
    })
  } catch (error) {
    payload.pages.push({
      route: routeCheck.path,
      routeLabel: routeCheck.label || routeCheck.path,
      viewport: viewport.name,
      url,
      ok: false,
      screenshot: null,
      finalUrl: page.url(),
      elapsedMs: Date.now() - startedAt,
      error: trim(error?.message || String(error)),
    })
  }
}

let browser

try {
  await fs.mkdir(outputDir, { recursive: true })

  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  page.on('console', (message) => {
    const entry = {
      type: message.type(),
      text: trim(message.text(), 2000),
      location: message.location(),
    }

    payload.console.push(entry)
    if (message.type() === 'error') {
      payload.consoleErrors.push(entry)
    }
  })

  page.on('pageerror', (error) => {
    payload.pageErrors.push({
      message: trim(error?.message || String(error), 2000),
      stack: trim(error?.stack || '', 2000),
    })
  })

  page.on('requestfailed', (request) => {
    if (!isAppRequestFailure(request.url())) return

    const failureEntry = {
      url: request.url(),
      method: request.method(),
      errorText: request.failure()?.errorText || 'unknown',
    }

    if (isIgnorableRequestFailure(failureEntry)) return

    payload.requestFailures.push(failureEntry)
  })

  const sessionCookie = await authenticate(context)
  const previewPath = await resolvePreviewPath(context, sessionCookie)

  for (const viewport of viewports) {
    for (const routeCheck of routeChecks) {
      await captureRoute(page, routeCheck, viewport)
    }

    if (!previewPath) {
      payload.errors.push(`Missing preview route for viewport ${viewport.name}.`)
      continue
    }

    await captureRoute(page, {
      path: previewPath,
      label: 'preview',
      usesSidebar: false,
      assert: async (previewPage) => previewPage.getByRole('link', { name: 'Download original' }).waitFor({ state: 'visible', timeout: 15000 }),
    }, viewport)
  }

  payload.summary = {
    pageCount: payload.pages.length,
    failedPages: payload.pages.filter((entry) => !entry.ok).length,
    consoleErrors: payload.consoleErrors.length,
    pageErrors: payload.pageErrors.length,
    requestFailures: payload.requestFailures.length,
  }

  const outputFile = path.join(outputDir, 'snapshot-report.json')
  await fs.writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`Playwright beta snapshots captured at ${outputDir}`)
  console.log(`Report: ${outputFile}`)

  if (
    payload.summary.failedPages > 0
    || payload.summary.consoleErrors > 0
    || payload.summary.pageErrors > 0
    || payload.summary.requestFailures > 0
    || payload.errors.length > 0
  ) {
    process.exitCode = 2
  }
} catch (error) {
  payload.errors.push(trim(error?.stack || error?.message || String(error), 4000))
  const fallbackDir = outputDir || path.resolve(process.cwd(), '..', '..', 'beta-artifacts', 'playwright-snapshots')
  await fs.mkdir(fallbackDir, { recursive: true })
  const outputFile = path.join(fallbackDir, 'snapshot-report.error.json')
  await fs.writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
}
