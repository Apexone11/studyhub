const log = require('../../lib/logger')

/**
 * GIF search proxy.
 *
 * Tenor was deprecated by Google in 2026 (no new API key sign-ups after
 * 2026-01-13, full sunset 2026-06-30). Switched to GIPHY 2026-05-03 —
 * same response shape, same fail-closed contract, same Tenor-style host
 * allowlist on the returned URLs.
 *
 * Backwards compatibility: the route layer + frontend still call
 * `searchGifs` / `featuredGifs` / `isTenorConfigured`. The names stay
 * (so the existing test mocks + the OpenAPI doc keep working) but the
 * implementation talks to GIPHY now.
 */

const GIPHY_BASE = 'https://api.giphy.com/v1/gifs'
const GIPHY_TIMEOUT_MS = 5000

function getGiphyKey() {
  // Read TENOR_API_KEY as a legacy fallback so a Railway env that still
  // has the old name works during the rename window.
  return String(process.env.GIPHY_API_KEY || process.env.TENOR_API_KEY || '').trim()
}

function isTenorConfigured() {
  // Name kept for backwards compatibility with the route + tests.
  return Boolean(getGiphyKey())
}

// GIPHY's response includes `images.fixed_height_small.url` (preview-size)
// and `images.original.url` (full-size), both pointing at `media*.giphy.com`
// or `i.giphy.com`. Validate the host server-side so a shape change or
// upstream cache-poisoning can't relay `javascript:` / `data:` /
// attacker-controlled URLs to the frontend, which renders the preview
// directly into <img src>. Belt-and-suspenders against XSS.
const GIPHY_MEDIA_HOSTS = new Set([
  'media.giphy.com',
  'media0.giphy.com',
  'media1.giphy.com',
  'media2.giphy.com',
  'media3.giphy.com',
  'media4.giphy.com',
  'i.giphy.com',
])

function isAllowedGifUrl(url) {
  if (typeof url !== 'string' || !url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && GIPHY_MEDIA_HOSTS.has(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

function normalizeMediaItem(item) {
  if (!item || typeof item !== 'object') return null
  // GIPHY shape: item.images.{fixed_height_small,fixed_width_small,original,downsized}.url
  // Pick fixed_height_small as the preview (small + cheap to load) and
  // original as the full version. Fall through if any host fails the
  // allowlist.
  const previewCandidate =
    item.images?.fixed_height_small?.url ||
    item.images?.fixed_width_small?.url ||
    item.images?.preview_gif?.url ||
    ''
  const fullCandidate =
    item.images?.downsized?.url ||
    item.images?.original?.url ||
    item.images?.fixed_height?.url ||
    ''
  const preview = isAllowedGifUrl(previewCandidate)
    ? previewCandidate
    : isAllowedGifUrl(fullCandidate)
      ? fullCandidate
      : ''
  const full = isAllowedGifUrl(fullCandidate)
    ? fullCandidate
    : isAllowedGifUrl(previewCandidate)
      ? previewCandidate
      : ''
  if (!preview || !full) return null
  return {
    id: String(item.id || ''),
    preview,
    full,
    title: typeof item.title === 'string' && item.title.trim() ? item.title : 'GIF',
  }
}

async function fetchGiphy(path, params, { signal } = {}) {
  const key = getGiphyKey()
  if (!key) {
    const err = new Error('GIF search is not configured.')
    err.code = 'GIF_NOT_CONFIGURED'
    err.statusCode = 503
    throw err
  }
  const url = new URL(`${GIPHY_BASE}/${path}`)
  url.searchParams.set('api_key', key)
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GIPHY_TIMEOUT_MS)
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    if (!response.ok) {
      const err = new Error(`GIPHY responded ${response.status}.`)
      err.statusCode = response.status >= 500 ? 502 : 400
      throw err
    }
    const data = await response.json()
    const results = Array.isArray(data?.data) ? data.data : []
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
    // request URL on some Node versions which contains `api_key=...&q=...`.
    log.warn(
      {
        event: 'gifs.giphy_failed',
        errName: error?.name || 'Error',
        errCode: error?.code || null,
      },
      'GIPHY request failed',
    )
    const err = new Error('GIF search is temporarily unavailable.')
    err.statusCode = 502
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

async function searchGifs({ query, limit, locale, signal }) {
  // GIPHY accepts: q, limit, offset, rating (g/pg/pg-13/r), lang (2-letter).
  // We map locale 'en_US' -> lang 'en' (drop the country part, GIPHY only
  // wants the language).
  const lang = typeof locale === 'string' ? locale.slice(0, 2) : ''
  return fetchGiphy(
    'search',
    {
      q: query,
      limit,
      lang,
      rating: 'pg-13',
    },
    { signal },
  )
}

async function featuredGifs({ limit, locale, signal }) {
  // GIPHY's equivalent of "featured" is /trending. Same query params apart
  // from `q` (which doesn't apply).
  const lang = typeof locale === 'string' ? locale.slice(0, 2) : ''
  return fetchGiphy(
    'trending',
    {
      limit,
      lang,
      rating: 'pg-13',
    },
    { signal },
  )
}

module.exports = {
  searchGifs,
  featuredGifs,
  isTenorConfigured,
}
