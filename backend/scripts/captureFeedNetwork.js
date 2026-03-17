const fs = require('node:fs/promises')
const path = require('node:path')
const { createPrismaClient } = require('../src/lib/prisma')
const { signAuthToken } = require('../src/lib/authTokens')

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

async function parseResponseBody(response) {
  const raw = await response.text()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function extractCookie(response) {
  const raw = response.headers.get('set-cookie')
  return raw ? raw.split(';')[0] : ''
}

async function buildLocalSessionCookie(username) {
  const prisma = createPrismaClient()
  try {
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, role: true },
    })
    if (!user) {
      throw new Error(`User "${username}" was not found for local token fallback.`)
    }

    const token = signAuthToken(user)
    return `studyhub_session=${encodeURIComponent(token)}`
  } finally {
    await prisma.$disconnect()
  }
}

async function main() {
  const apiBase = String(process.env.BETA_API_BASE_URL || 'http://127.0.0.1:4000').replace(/\/$/, '')
  const username = process.env.BETA_DIAG_USERNAME || process.env.BETA_OWNER_USERNAME || 'studyhub_owner'
  const password = process.env.BETA_DIAG_PASSWORD || process.env.BETA_OWNER_PASSWORD || 'AdminPass123'
  const outputPath = process.env.BETA_DIAG_OUTPUT
    ? path.resolve(process.env.BETA_DIAG_OUTPUT)
    : path.resolve(__dirname, '..', '..', 'beta-diagnostics', 'feed-network.json')

  const payload = {
    capturedAt: new Date().toISOString(),
    apiBase,
    username,
    login: null,
    feed: null,
    errors: [],
  }

  try {
    const loginResponse = await fetch(`${apiBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const loginBody = await parseResponseBody(loginResponse)
    let cookie = extractCookie(loginResponse)

    payload.login = {
      status: loginResponse.status,
      body: loginBody,
      hasCookie: Boolean(cookie),
      cookie: cookie || '',
    }

    if (!cookie && loginResponse.status === 429) {
      cookie = await buildLocalSessionCookie(username)
      payload.login = {
        ...payload.login,
        hasCookie: true,
        cookie,
        usedLocalTokenFallback: true,
      }
    }

    if (!cookie) {
      payload.errors.push('No auth cookie returned from login.')
    }

    const feedResponse = await fetch(`${apiBase}/api/feed?limit=24`, {
      headers: cookie ? { cookie } : undefined,
    })
    const feedBody = await parseResponseBody(feedResponse)
    payload.feed = {
      status: feedResponse.status,
      headers: Object.fromEntries(feedResponse.headers.entries()),
      body: feedBody,
    }
  } catch (error) {
    payload.errors.push(error instanceof Error ? error.message : String(error))
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`Captured feed network diagnostics at ${outputPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
