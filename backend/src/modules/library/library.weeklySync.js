/**
 * library.weeklySync.js — Weekly Google Books corpus expansion.
 * Master plan §3.3 + L5-HIGH-5 + L1-LOW-5.
 *
 * Picks 5 LibrarySyncState rows whose `lastRunAt` is older than 28
 * days (or NULL) and paginates each from `lastStartIndex` for one
 * page of DEFAULT_PAGE_SIZE results. Caps at 80 fetches/day total.
 * Stops on 403/429 with exponential backoff. Honors
 * `LIBRARY_SYNC_ENABLED=false` env kill-switch.
 *
 * Allowlist: hostnames passed to safeFetch is `['www.googleapis.com']`.
 */

const prisma = require('../../lib/prisma')
const log = require('../../lib/logger')
const { captureError } = require('../../monitoring/sentry')
const { safeFetch } = require('../../lib/safeFetch')
const { GOOGLE_BOOKS_BASE, DEFAULT_PAGE_SIZE } = require('./library.constants')

const ALLOWLIST = ['www.googleapis.com']
const QUERIES_PER_RUN = 5
const DAILY_FETCH_CAP = 80
const QUERY_RESET_DAYS = 28 * 4 // ~8 weeks; query reset cycle (master plan L1-LOW-5)
const QUERY_RECYCLE_DAYS = 28 // re-eligibility window
const BACKOFF_MIN_MS = 60 * 1000
const BACKOFF_MAX_MS = 6 * 60 * 60 * 1000

let backoffUntil = 0
let currentBackoffMs = BACKOFF_MIN_MS
let dailyFetchCount = 0
let dailyFetchDate = todayUtc()

function todayUtc() {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

function resetDailyCounterIfNeeded() {
  const today = todayUtc()
  if (today !== dailyFetchDate) {
    dailyFetchDate = today
    dailyFetchCount = 0
  }
}

function isKillSwitched() {
  return String(process.env.LIBRARY_SYNC_ENABLED || 'true').toLowerCase() === 'false'
}

/**
 * Pick the 5 oldest queries that are eligible to run. A query is
 * eligible when:
 *   - `lastRunAt` is NULL (never run), OR
 *   - `lastRunAt < NOW() - 28 days` AND not capDiscovered, OR
 *   - `capDiscovered === true AND resetAt <= NOW()` (recycle).
 */
async function pickEligibleQueries() {
  const cutoff = new Date(Date.now() - QUERY_RECYCLE_DAYS * 24 * 60 * 60 * 1000)
  const now = new Date()
  return prisma.librarySyncState.findMany({
    where: {
      OR: [
        { lastRunAt: null },
        {
          AND: [
            { lastRunAt: { lt: cutoff } },
            {
              OR: [{ capDiscovered: false }, { resetAt: { lte: now } }],
            },
          ],
        },
      ],
    },
    orderBy: [{ lastRunAt: 'asc' }],
    take: QUERIES_PER_RUN,
  })
}

/**
 * Fetch one page of a query's books from Google Books. Returns
 * { items, totalItems, transient } where `transient` indicates a
 * 403 / 429 / network failure that should trigger backoff.
 */
async function fetchOnePage(state) {
  const params = new URLSearchParams()
  params.append('q', state.queryKey)
  params.append('startIndex', String(state.lastStartIndex))
  params.append('maxResults', String(DEFAULT_PAGE_SIZE))
  params.append('orderBy', 'relevance')
  params.append('langRestrict', 'en')
  params.append('printType', 'books')
  if (process.env.GOOGLE_BOOKS_API_KEY) {
    params.append('key', process.env.GOOGLE_BOOKS_API_KEY)
  }
  const url = `${GOOGLE_BOOKS_BASE}/volumes?${params.toString()}`
  const headers = {}
  // Polite-pool email header for Google Books quota tracking.
  const contact = process.env.LIBRARY_SYNC_CONTACT_EMAIL
  if (contact) headers['User-Agent'] = `StudyHub/2.2 (${contact})`
  const result = await safeFetch(url, {
    allowlist: ALLOWLIST,
    method: 'GET',
    headers,
    timeoutMs: 10000,
    expect: 'json',
  })
  if (!result.ok) {
    if (result.status === 403 || result.status === 429) {
      return { items: [], totalItems: 0, transient: true }
    }
    return { items: [], totalItems: 0, transient: false }
  }
  return {
    items: Array.isArray(result.body?.items) ? result.body.items : [],
    totalItems: Number.isInteger(result.body?.totalItems) ? result.body.totalItems : 0,
    transient: false,
  }
}

/**
 * Persist a Google Books volume into the CachedBook table.
 * Returns true on insert/update success, false otherwise.
 */
async function upsertCachedBook(item) {
  try {
    const info = item.volumeInfo || {}
    const data = {
      volumeId: item.id,
      title: info.title || 'Untitled',
      authors: info.authors || [],
      categories: info.categories || [],
      language: info.language || 'en',
      pageCount: info.pageCount || 0,
      coverUrl: info.imageLinks
        ? info.imageLinks.thumbnail || info.imageLinks.smallThumbnail || null
        : null,
      previewLink: info.previewLink || null,
      description: typeof info.description === 'string' ? info.description.slice(0, 8000) : null,
      publishedDate: info.publishedDate || null,
    }
    if (!data.volumeId) return false
    await prisma.cachedBook.upsert({
      where: { volumeId: data.volumeId },
      update: { ...data, syncedAt: new Date() },
      create: data,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Run one weekly sync pass. Returns { picked, fetched, items, capped,
 * killed }.
 */
async function syncWeeklyCorpus() {
  if (isKillSwitched()) {
    log.info({ event: 'library.weekly_sync.kill_switch' }, 'Library weekly sync disabled by env')
    return { killed: true }
  }
  resetDailyCounterIfNeeded()
  if (Date.now() < backoffUntil) {
    log.info(
      { event: 'library.weekly_sync.backoff_active', until: new Date(backoffUntil).toISOString() },
      'Library weekly sync skipped — in backoff window',
    )
    return { backoffActive: true }
  }
  if (dailyFetchCount >= DAILY_FETCH_CAP) {
    log.info(
      { event: 'library.weekly_sync.daily_cap', dailyFetchCount },
      'Library weekly sync at daily cap',
    )
    return { dailyCap: true }
  }

  const queries = await pickEligibleQueries()
  if (queries.length === 0) {
    return { picked: 0, fetched: 0, items: 0 }
  }

  let totalItems = 0
  let totalFetches = 0
  for (const state of queries) {
    if (dailyFetchCount >= DAILY_FETCH_CAP) break
    let page
    try {
      page = await fetchOnePage(state)
    } catch (err) {
      captureError(err, { tags: { module: 'library.weeklySync', action: 'fetchOnePage' } })
      continue
    }
    totalFetches += 1
    dailyFetchCount += 1

    if (page.transient) {
      // Exponential backoff. Subsequent transient hits double the
      // wait up to 6h, then reset on a clean run.
      backoffUntil = Date.now() + currentBackoffMs
      currentBackoffMs = Math.min(currentBackoffMs * 2, BACKOFF_MAX_MS)
      log.warn(
        { event: 'library.weekly_sync.transient_backoff', currentBackoffMs },
        'Google Books transient error — entering backoff',
      )
      break
    }

    let inserted = 0
    for (const item of page.items) {
      const ok = await upsertCachedBook(item)
      if (ok) inserted += 1
    }
    totalItems += inserted

    const newStartIndex = state.lastStartIndex + page.items.length
    const capDiscovered = page.items.length < DEFAULT_PAGE_SIZE
    const updates = {
      lastRunAt: new Date(),
      lastStartIndex: newStartIndex,
      totalFetched: state.totalFetched + inserted,
      capDiscovered,
    }
    if (capDiscovered) {
      // Reset cycle so a query that hit upstream's tail can be replayed
      // ~8 weeks later from index 0 (master plan L1-LOW-5).
      updates.resetAt = new Date(Date.now() + QUERY_RESET_DAYS * 24 * 60 * 60 * 1000)
      updates.lastStartIndex = 0
    }
    await prisma.librarySyncState
      .update({ where: { id: state.id }, data: updates })
      .catch((err) => {
        captureError(err, { tags: { module: 'library.weeklySync', action: 'updateState' } })
      })
  }

  // Reset backoff on a clean run.
  if (totalFetches > 0 && Date.now() >= backoffUntil) {
    currentBackoffMs = BACKOFF_MIN_MS
  }

  log.info(
    {
      event: 'library.weekly_sync.complete',
      picked: queries.length,
      fetched: totalFetches,
      itemsInserted: totalItems,
      dailyFetchCount,
    },
    'Library weekly sync complete',
  )
  return {
    picked: queries.length,
    fetched: totalFetches,
    items: totalItems,
  }
}

module.exports = {
  syncWeeklyCorpus,
  pickEligibleQueries,
  // exposed for tests
  _internals: { fetchOnePage, upsertCachedBook },
}
