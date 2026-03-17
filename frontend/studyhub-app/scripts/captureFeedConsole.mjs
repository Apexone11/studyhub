import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const frontendBaseUrl = String(process.env.BETA_FRONTEND_BASE_URL || 'http://localhost:5173').replace(/\/$/, '')
const apiBaseUrl = String(process.env.BETA_API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '')
const username = process.env.BETA_DIAG_USERNAME || process.env.BETA_OWNER_USERNAME || 'studyhub_owner'
const password = process.env.BETA_DIAG_PASSWORD || process.env.BETA_OWNER_PASSWORD || 'AdminPass123'
const providedSessionCookie = String(process.env.BETA_DIAG_SESSION_COOKIE || '').trim()
const outputPath = process.env.BETA_CONSOLE_OUTPUT
  ? path.resolve(process.env.BETA_CONSOLE_OUTPUT)
  : path.resolve(process.cwd(), '..', '..', 'beta-diagnostics', 'frontend-console.json')

const payload = {
  capturedAt: new Date().toISOString(),
  frontendBaseUrl,
  apiBaseUrl,
  username,
  loginResult: null,
  console: [],
  pageErrors: [],
  requestFailures: [],
  feedResponses: [],
  errors: [],
}

function trim(value, limit = 8000) {
  const text = String(value || '')
  return text.length <= limit ? text : `${text.slice(0, limit)}...`
}

let browser

function parseCookieValue(setCookieHeader, cookieName) {
  if (!setCookieHeader) return ''
  const rawCookie = setCookieHeader.split(';')[0]
  const [name, ...parts] = rawCookie.split('=')
  if (name?.trim() !== cookieName) return ''
  return parts.join('=').trim()
}

try {
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  let sessionCookie = providedSessionCookie
  if (!sessionCookie) {
    const authResponse = await context.request.post(`${apiBaseUrl}/api/auth/login`, {
      data: { username, password },
    })
    const authBody = await authResponse.json().catch(() => ({}))
    const setCookieHeader = authResponse.headers()['set-cookie']
    sessionCookie = parseCookieValue(setCookieHeader, 'studyhub_session')

    payload.loginResult = {
      status: authResponse.status(),
      body: authBody,
      hasSessionCookie: Boolean(sessionCookie),
      usedProvidedSession: false,
    }

    if (!authResponse.ok() || !sessionCookie) {
      throw new Error(`Programmatic login failed (${authResponse.status()}): ${JSON.stringify(authBody)}`)
    }
  } else {
    payload.loginResult = {
      status: 200,
      body: { message: 'Using provided session cookie from feed-network capture.' },
      hasSessionCookie: true,
      usedProvidedSession: true,
    }
  }

  await context.addCookies([
    {
      name: 'studyhub_session',
      value: sessionCookie,
      url: apiBaseUrl,
    },
  ])

  const page = await context.newPage()

  page.on('console', (message) => {
    payload.console.push({
      type: message.type(),
      text: trim(message.text()),
      location: message.location(),
    })
  })

  page.on('pageerror', (error) => {
    payload.pageErrors.push({
      message: trim(error?.message || String(error)),
      stack: trim(error?.stack || ''),
    })
  })

  page.on('requestfailed', (request) => {
    payload.requestFailures.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText || 'unknown',
    })
  })

  page.on('response', async (response) => {
    if (!response.url().includes('/api/feed')) return
    let bodyText = ''
    try {
      bodyText = await response.text()
    } catch {
      bodyText = '[unreadable response body]'
    }
    payload.feedResponses.push({
      url: response.url(),
      status: response.status(),
      body: trim(bodyText, 12000),
    })
  })

  await page.goto(`${frontendBaseUrl}/feed`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/\/feed/, { timeout: 25000 })
  await page.waitForTimeout(3500)

  payload.loginResult = {
    ...payload.loginResult,
    finalUrl: page.url(),
    reachedFeed: page.url().includes('/feed'),
  }
} catch (error) {
  payload.errors.push(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
} finally {
  if (browser) {
    await browser.close()
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`Captured frontend console diagnostics at ${outputPath}`)
}
