const log = require('../../lib/logger')

const TENOR_BASE = 'https://tenor.googleapis.com/v2'
const TENOR_TIMEOUT_MS = 5000

function getTenorKey() {
  return String(process.env.TENOR_API_KEY || '').trim()
}

function isTenorConfigured() {
  return Boolean(getTenorKey())
}

// Tenor's response includes `media_formats.{tinygif,gif}.url` pointing at
// `media.tenor.com` / `c.tenor.com`. Validate the host server-side so a
// shape change or upstream cache-poisoning can't relay `javascript:` /
// `data:` / attacker-controlled URLs to the frontend, which renders the
// preview directly into <img src>. Belt-and-suspenders against XSS.
const TENOR_MEDIA_HOSTS = new Set([
  'media.tenor.com',
  'media1.tenor.com',
  'media2.tenor.com',
  'media3.tenor.com',
  'c.tenor.com',
])

function isAllowedTenorUrl(url) {
  if (typeof url !== 'string' || !url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && TENOR_MEDIA_HOSTS.has(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

function normalizeMediaItem(item) {
  if (!item || typeof item !== 'object') return null
  const tinygif = item.media_formats?.tinygif?.url
  const gif = item.media_formats?.gif?.url
  const preview = isAllowedTenorUrl(tinygif) ? tinygif : isAllowedTenorUrl(gif) ? gif : ''
  const full = isAllowedTenorUrl(gif) ? gif : isAllowedTenorUrl(tinygif) ? tinygif : ''
  if (!preview || !full) return null
  return {
    id: String(item.id || ''),
    preview,
    full,
    title: typeof item.content_description === 'string' ? item.content_description : 'GIF',
  }
}

async function fetchTenor(path, params, { signal } = {}) {
  const key = getTenorKey()
  if (!key) {
    const err = new Error('GIF search is not configured.')
    err.code = 'GIF_NOT_CONFIGURED'
    err.statusCode = 503
    throw err
  }
  const url = new URL(`${TENOR_BASE}/${path}`)
  url.searchParams.set('key', key)
  url.searchParams.set('client_key', 'studyhub')
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TENOR_TIMEOUT_MS)
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    if (!response.ok) {
      const err = new Error(`Tenor responded ${response.status}.`)
      err.statusCode = response.status >= 500 ? 502 : 400
      throw err
    }
    const data = await response.json()
    const results = Array.isArray(data?.results) ? data.results : []
    return results.map(normalizeMediaItem).filter(Boolean)
  } catch (error) {
    if (error.code === 'GIF_NOT_CONFIGURED') throw error
    // Preserve the typed status from the non-OK branch above. Without this
    // re-throw the catch wraps everything as 502 and the route's 4xx ↔ 5xx
    // distinction is lost (gifs.service.unit.test.js regression-guards).
    if (Number.isInteger(error.statusCode)) throw error
    if (error.name === 'AbortError') {
      const err = new Error('GIF search timed out.')
      err.statusCode = 504
      throw err
    }
    // Log only the error class/code — error.message can include the full
    // request URL on some Node versions which contains `key=...&q=<user-query>`.
    log.warn(
      {
        event: 'gifs.tenor_failed',
        errName: error?.name || 'Error',
        errCode: error?.code || null,
      },
      'Tenor request failed',
    )
    const err = new Error('GIF search is temporarily unavailable.')
    err.statusCode = 502
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

async function searchGifs({ query, limit, locale, signal }) {
  return fetchTenor(
    'search',
    {
      q: query,
      limit,
      locale,
      media_filter: 'tinygif,gif',
      contentfilter: 'high',
    },
    { signal },
  )
}

async function featuredGifs({ limit, locale, signal }) {
  return fetchTenor(
    'featured',
    {
      limit,
      locale,
      media_filter: 'tinygif,gif',
      contentfilter: 'high',
    },
    { signal },
  )
}

module.exports = {
  searchGifs,
  featuredGifs,
  isTenorConfigured,
}
