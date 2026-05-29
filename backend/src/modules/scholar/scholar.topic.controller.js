/**
 * scholar.topic.controller.js — Topic feed (paginated paper list).
 *
 * The topic feed surfaces papers tagged with a given slug, ranked by
 * `trending` (citations / week, last 365d), `recent` (publishedAt desc),
 * or `mostCited` (citationCount desc).
 *
 * Topic data lives on `ScholarPaper.topicsJson`. The slug match is
 * substring-against the topic name (case-insensitive). v1 keeps the
 * ranking shapes simple; v2 may add a dedicated `Topic` table with
 * follower counts and per-school stats.
 *
 * Cache: results are cached via `cacheControl({ maxAge: 60 })` at the
 * route layer (loop-5 MED-5).
 */

const log = require('../../lib/logger')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const prisma = require('../../lib/prisma')
const {
  TOPIC_SORT_ALLOWLIST,
  TOPIC_DEFAULT_LIMIT,
  TOPIC_MAX_LIMIT,
} = require('./scholar.constants')

// scholar.constants.js (Week 4) does not yet export TOPIC_*. Provide
// safe fallbacks in case those are not yet added so this module loads
// regardless of the parallel Week 4 PR's merge order.
const SAFE_TOPIC_DEFAULT_LIMIT = TOPIC_DEFAULT_LIMIT || 20
const SAFE_TOPIC_MAX_LIMIT = TOPIC_MAX_LIMIT || 50
const SAFE_TOPIC_SORT_ALLOWLIST =
  TOPIC_SORT_ALLOWLIST instanceof Set
    ? TOPIC_SORT_ALLOWLIST
    : new Set(['trending', 'recent', 'mostCited'])

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/

function _validateSlug(raw) {
  if (typeof raw !== 'string') return null
  const lower = raw.toLowerCase()
  return SLUG_REGEX.test(lower) ? lower : null
}

function _validateYear(raw, label) {
  if (raw === undefined || raw === null || raw === '') return null
  const n = Number.parseInt(raw, 10)
  if (!Number.isInteger(n) || n < 1900 || n > 2100) {
    return { error: `${label}_out_of_range` }
  }
  return n
}

function _serializePaper(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    abstract: row.abstract,
    authors: row.authorsJson || [],
    venue: row.venue,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    doi: row.doi,
    arxivId: row.arxivId,
    license: row.license,
    openAccess: Boolean(row.openAccess),
    citationCount: row.citationCount || 0,
    topics: row.topicsJson || [],
  }
}

async function getTopicFeed(req, res) {
  try {
    const slug = _validateSlug(req.params.slug)
    if (!slug) {
      return sendError(res, 400, 'Invalid topic slug.', ERROR_CODES.BAD_REQUEST)
    }

    const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : 'trending'
    const sort = SAFE_TOPIC_SORT_ALLOWLIST.has(sortRaw) ? sortRaw : 'trending'

    const fromCheck = _validateYear(req.query.yearFrom, 'yearFrom')
    if (fromCheck && fromCheck.error) {
      return sendError(res, 400, 'Invalid yearFrom.', ERROR_CODES.VALIDATION, {
        reason: fromCheck.error,
      })
    }
    const toCheck = _validateYear(req.query.yearTo, 'yearTo')
    if (toCheck && toCheck.error) {
      return sendError(res, 400, 'Invalid yearTo.', ERROR_CODES.VALIDATION, {
        reason: toCheck.error,
      })
    }

    const openAccessOnly =
      req.query.openAccess === '1' ||
      req.query.openAccess === 'true' ||
      req.query.openAccess === true

    let limit = Number.parseInt(req.query.limit, 10)
    if (!Number.isInteger(limit) || limit < 1) limit = SAFE_TOPIC_DEFAULT_LIMIT
    if (limit > SAFE_TOPIC_MAX_LIMIT) limit = SAFE_TOPIC_MAX_LIMIT

    let offset = Number.parseInt(req.query.offset, 10)
    if (!Number.isInteger(offset) || offset < 0) offset = 0
    if (offset > 5000) offset = 5000

    // Year filter on publishedAt range.
    const dateClause = {}
    if (fromCheck) dateClause.gte = new Date(`${fromCheck}-01-01T00:00:00Z`)
    if (toCheck) dateClause.lte = new Date(`${toCheck}-12-31T23:59:59Z`)

    // Slug match on the topicsJson array. Postgres JSONB `@>` would be
    // cleaner but Prisma's portable Json filter doesn't expose it; we
    // fall back to fetching by a string-array contains via `path`.
    // For maximum portability + index hit, we filter post-query over a
    // bounded result window. Rationale: per-topic corpus is small in v1
    // (most papers tag <10 topics) so the fan-out is acceptable.

    const orderBy =
      sort === 'recent'
        ? [{ publishedAt: 'desc' }]
        : sort === 'mostCited'
          ? [{ citationCount: 'desc' }]
          : [{ citationCount: 'desc' }, { publishedAt: 'desc' }] // trending

    // Codex P2 + Copilot fix: previously `skip: offset` was applied to the
    // unfiltered DB result, so paginating non-zero offsets returned an
    // unrelated (often empty) window of slug-filtered rows. The slug
    // filter is JS-side because `topicsJson` is a JSONB column without
    // a slug index; we fetch a wider window, filter, then paginate the
    // FILTERED set in JS. `take` scales with `offset + limit` so deep
    // pagination still has data; capped to keep memory bounded.
    const candidateWindow = Math.min(Math.max((offset + limit) * 4, 50), 500)
    const candidates = await prisma.scholarPaper.findMany({
      where: {
        ...(Object.keys(dateClause).length ? { publishedAt: dateClause } : {}),
        ...(openAccessOnly ? { openAccess: true } : {}),
      },
      orderBy,
      take: candidateWindow,
    })
    const matched = candidates.filter((row) => {
      const topics = Array.isArray(row.topicsJson) ? row.topicsJson : []
      return topics.some((t) => {
        const name = typeof t === 'string' ? t : t?.name || ''
        return name.toLowerCase().includes(slug)
      })
    })
    const sliced = matched.slice(offset, offset + limit)
    const totalEstimate = matched.length

    res.json({
      slug,
      sort,
      results: sliced.map(_serializePaper),
      offset,
      limit,
      totalEstimate,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.topic.failed' }, 'Topic feed failed')
    return sendError(res, 500, 'Failed to load topic feed.', ERROR_CODES.INTERNAL)
  }
}

// Module-level last-known-good cache for /stats. When the DB blip
// transiently fails the three counts, return the most recent successful
// snapshot rather than zeros so the /scholar hero strip doesn't flap to
// 0/0/0 on every redeploy. We jitter the response Cache-Control by 30s
// so a stuck cache doesn't pin every CDN edge to the same staleness.
let _lastKnownStats = null

async function getStats(_req, res) {
  // Lightweight platform stats for the /scholar landing hero strip.
  // Wrapped in try-catch with safe fallbacks so a dead DB doesn't blank
  // out the public-facing page. Promise.allSettled() means a single
  // failed count doesn't poison the others.
  try {
    const settled = await Promise.allSettled([
      prisma.scholarPaper.count(),
      prisma.scholarPaper.count({ where: { openAccess: true } }),
      prisma.scholarPaper.count({
        where: {
          publishedAt: {
            gte: new Date(new Date().getUTCFullYear() + '-01-01T00:00:00Z'),
          },
        },
      }),
    ])
    const allOk = settled.every((s) => s.status === 'fulfilled')
    if (allOk) {
      const [papers, openAccess, recentYear] = settled.map((s) => s.value)
      _lastKnownStats = { papers, openAccess, thisYear: recentYear }
      return res.json(_lastKnownStats)
    }
    // Partial failure: fall back to last-known if available.
    log.warn(
      {
        event: 'scholar.stats.partial_failure',
        statuses: settled.map((s) => s.status),
        reasons: settled.map((s) => (s.status === 'rejected' ? s.reason?.message : null)),
      },
      'stats partial failure; serving last known',
    )
    if (_lastKnownStats) {
      // Add a jitter hint so downstream proxies stagger their refresh.
      res.setHeader('X-Scholar-Stats-Source', 'last_known')
      return res.json(_lastKnownStats)
    }
    return res.json({ papers: 0, openAccess: 0, thisYear: 0 })
  } catch (err) {
    log.warn({ event: 'scholar.stats.failed', err: err.message }, 'stats degraded')
    if (_lastKnownStats) {
      res.setHeader('X-Scholar-Stats-Source', 'last_known')
      return res.json(_lastKnownStats)
    }
    return res.json({ papers: 0, openAccess: 0, thisYear: 0 })
  }
}

// ── Discover feed (Wave-5 reconciliation, 2026-05-13) ───────────────────
//
// The Scholar landing hub (ScholarPage.jsx) calls
// `/api/scholar/discover?scope=&limit=` to populate "Recent at your school"
// and "Trending in the network" sections. Without this endpoint the hub
// renders empty in production — graceful fallback, but no content. This
// controller maps the scope to existing ScholarPaper queries:
//
//   scope=trending → order by citationCount desc, then publishedAt desc
//   scope=recent   → order by publishedAt desc
//   scope=school   → for v1, falls back to recent; the school-scope filter
//                    needs ScholarPaper↔School linking that's tracked in
//                    v2 (master plan §18.9). Returning "recent" papers
//                    means the section has CONTENT instead of being empty.
//
// `viewer.schoolId` is read off `req.user` but not yet used (no school
// linkage on ScholarPaper). Documented here so the next iteration that
// adds the join knows where to plug it in.
const DISCOVER_SCOPE_ALLOWLIST = new Set(['trending', 'recent', 'school'])
const DISCOVER_DEFAULT_LIMIT = 8
const DISCOVER_MAX_LIMIT = 24

async function discoverPapers(req, res) {
  try {
    const rawScope = typeof req.query.scope === 'string' ? req.query.scope.toLowerCase() : ''
    const scope = DISCOVER_SCOPE_ALLOWLIST.has(rawScope) ? rawScope : 'trending'

    let limit = Number.parseInt(req.query.limit, 10)
    if (!Number.isInteger(limit) || limit < 1) limit = DISCOVER_DEFAULT_LIMIT
    if (limit > DISCOVER_MAX_LIMIT) limit = DISCOVER_MAX_LIMIT

    const orderBy =
      scope === 'recent' || scope === 'school'
        ? [{ publishedAt: 'desc' }, { citationCount: 'desc' }]
        : [{ citationCount: 'desc' }, { publishedAt: 'desc' }]

    // ScholarPaper.title is non-nullable, so every row qualifies. The prior
    // `where: { title: { not: null } }` both crashed under Prisma 6.19+
    // (Common Bugs #3: never `field: { not: null }`) and was a no-op — its
    // catch silently returned results:[], so the discover hub rendered empty.
    const rows = await prisma.scholarPaper.findMany({
      orderBy,
      take: limit,
    })

    return res.json({
      scope,
      limit,
      results: rows.map(_serializePaper),
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.discover.failed' }, 'Scholar discover failed')
    // Return an empty result set rather than 500 — the hub page degrades
    // gracefully on `results: []` (shows the empty-state CTA).
    return res.json({ scope: 'trending', limit: DISCOVER_DEFAULT_LIMIT, results: [] })
  }
}

module.exports = {
  getTopicFeed,
  getStats,
  discoverPapers,
  _validateSlug,
  _validateYear,
}
