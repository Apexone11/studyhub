/**
 * scholar.constants.js — Constants and validation regexes for Scholar v1.
 *
 * Source-of-truth for adapter hostnames, canonical paper-id regex,
 * citation styles, and dedupe rules. See master plan §18.4 + §18.5 +
 * §18.8 and the Loop 3 (security) findings (L3-MED-4 + L3-CRIT-2).
 */

// ── Hostname allowlist for safeFetch ─────────────────────────────────────

const HOSTS = Object.freeze({
  semanticScholar: 'api.semanticscholar.org',
  openAlex: 'api.openalex.org',
  crossref: 'api.crossref.org',
  arxiv: 'export.arxiv.org',
  unpaywall: 'api.unpaywall.org',
})

// Each adapter passes ONLY its own host to safeFetch (CLAUDE.md A21
// equivalent — narrow allowlist beats broad). The combined list here
// is for the PDF cache helper which fetches from any of them.
const PDF_FETCH_ALLOWLIST = Object.freeze([
  HOSTS.semanticScholar,
  HOSTS.openAlex,
  HOSTS.crossref,
  HOSTS.arxiv,
  HOSTS.unpaywall,
  // Common publisher CDNs that resolve from arXiv / Unpaywall metadata.
  // safeFetch.allowlist takes the resolved hostname so each redirect
  // host has to be added explicitly. We start narrow; expanding requires
  // a new plan-side decision.
])

// ── Canonical paper-id regex (L3-MED-4) ─────────────────────────────────

// Format: doi:10.<digits>/<token> | arxiv:<YYYY.NNNN[v#]> | ss:<sha-like hex>
//
// Note on the DOI suffix character class: we use an explicit
// printable-ASCII allowlist instead of `[^\s]` because JavaScript's `\s`
// does not include the C0 control characters U+0000-U+0008 / U+000B-U+000C
// / U+000E-U+001F. A naive `[^\s]` lets a null byte (`\0`) pass — that
// surfaced as a real injection vector during 2026-05-04 security tests.
// The allowlist below matches the DOI Foundation's "Suggested URI" syntax
// (RFC 3986 unreserved + sub-delims + a few service-friendly extras like
// `:`, `;`, `(`, `)`, `<`, `>`).
const CANONICAL_ID_RE =
  /^(doi:10\.\d{4,9}\/[A-Za-z0-9._\-/:;()<>+]{1,200}|arxiv:\d{4}\.\d{4,5}(v\d+)?|ss:[a-f0-9]{32,64}|oa:W\d{4,12})$/i

// Standalone DOI without prefix (used inside JSON payloads). Same
// printable-ASCII allowlist as above.
const DOI_RE = /^10\.\d{4,9}\/[A-Za-z0-9._\-/:;()<>+]{1,200}$/

// Standalone arXiv id (post-2007 format).
const ARXIV_RE = /^\d{4}\.\d{4,5}(v\d+)?$/

// ── Search input bounds ─────────────────────────────────────────────────

const SEARCH_QUERY_MIN = 1
const SEARCH_QUERY_MAX = 200
const SEARCH_LIMIT_MAX = 50
const SEARCH_LIMIT_DEFAULT = 20
const SEARCH_YEAR_MIN = 1900
const SEARCH_YEAR_MAX = 2100

// Drawer-driven year-range bounds: stricter than the legacy 1900-2100
// window because those numeric inputs come straight from a user-facing
// form and we do not want to let absurd values (e.g., year 0 or 2999)
// reach the adapters. The plan explicitly specifies [1700, currentYear+1].
const SEARCH_YEAR_RANGE_MIN = 1700
const SEARCH_YEAR_RANGE_MAX = new Date().getUTCFullYear() + 1

// `minCitations` upper bound. Any value above this is almost certainly a
// mistake or an attempt to force an empty result set; clamp / reject.
const SEARCH_MIN_CITATIONS_MAX = 1_000_000

// Length caps for free-form filter text fields. Mirrors the existing
// SEARCH_QUERY_MAX shape so all scholar text inputs share a contract.
const SEARCH_AUTHOR_MAX = 200
const SEARCH_VENUE_MAX = 200

// Allowlist of search-source slugs the user may pick in the Filters
// drawer. Mirrors `frontend/.../scholarConstants.js#SCHOLAR_SOURCES` —
// when the frontend list changes, update this Set in lockstep. Note:
// `unpaywall` is enrichment-only in the fan-out (never returns search
// results) so picking it alone yields zero results by design.
const SCHOLAR_SOURCE_SLUGS = Object.freeze([
  'semanticScholar',
  'openAlex',
  'crossref',
  'arxiv',
  'unpaywall',
])
const SCHOLAR_SOURCE_SLUG_SET = new Set(SCHOLAR_SOURCE_SLUGS)

// Allowlist of sort modes accepted by the search endpoint. Mirrors
// `frontend/.../scholarConstants.js#SCHOLAR_SORTS`.
const SCHOLAR_SORT_SLUGS = Object.freeze(['relevance', 'year-desc', 'citations-desc', 'recent'])
const SCHOLAR_SORT_SLUG_SET = new Set(SCHOLAR_SORT_SLUGS)

// Allowlist of topic / domain slugs the user may pick. Mirrors
// `frontend/.../scholarConstants.js#POPULAR_TOPICS` (slug field). Defined
// here standalone — never imported from the frontend, per CLAUDE.md
// (frontend and backend are separate trust domains).
const SCHOLAR_DOMAIN_SLUGS = Object.freeze([
  'medicine',
  'machine-learning',
  'engineering',
  'physics-general',
  'nlp',
  'public-health',
  'chemistry',
  'materials-science',
  'cell-biology',
  'psychology',
  'computer-vision',
  'economics',
  'mathematics',
  'neuroscience',
  'astrophysics',
  'biochemistry',
  'genomics',
  'sociology',
  'statistics',
  'climate-science',
  'earth-science',
  'quantum-physics',
  'education',
  'linguistics',
])
const SCHOLAR_DOMAIN_SLUG_SET = new Set(SCHOLAR_DOMAIN_SLUGS)

// Cap on how many entries a multi-select param may carry. The drawer
// caps via UI but a hand-crafted URL could try to flood the validator;
// reject anything past these caps to keep validation cost bounded.
const SCHOLAR_SOURCES_MAX = SCHOLAR_SOURCE_SLUGS.length
const SCHOLAR_DOMAINS_MAX = SCHOLAR_DOMAIN_SLUGS.length

/** Lower-case + space-to-hyphen so adapter topic strings can match the
 *  domain-slug allowlist. Used for both sides of the `domains` filter
 *  intersection check so "Machine Learning" → "machine-learning".
 */
function slugifyTopic(raw) {
  if (!raw || typeof raw !== 'string') return ''
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Per-adapter soft timeout in the fan-out (master plan §18.5).
const ADAPTER_SOFT_TIMEOUT_MS = 3_000

// Search cache TTL (Loop 5 CRIT-3) — 1 hour per (q, filter, source) tuple.
const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000

// Paper-detail cache freshness window. Popular papers refresh daily; the
// rest stay cached up to 30 days. The default `staleAt` write is at the
// `staleAt` field on insert; this constant is the *default*.
const PAPER_DEFAULT_STALE_DAYS = 30
const PAPER_POPULAR_STALE_DAYS = 1

// ── Citation styles ─────────────────────────────────────────────────────

const CITE_STYLES = Object.freeze([
  'bibtex',
  'ris',
  'csl-json',
  'apa',
  'mla',
  'chicago',
  'ieee',
  'harvard',
])

// MIME / file-extension table for the Content-Disposition header.
const CITE_STYLE_META = Object.freeze({
  bibtex: { contentType: 'application/x-bibtex; charset=utf-8', extension: 'bib' },
  ris: { contentType: 'application/x-research-info-systems; charset=utf-8', extension: 'ris' },
  'csl-json': {
    contentType: 'application/vnd.citationstyles.csl+json; charset=utf-8',
    extension: 'json',
  },
  apa: { contentType: 'text/plain; charset=utf-8', extension: 'txt' },
  mla: { contentType: 'text/plain; charset=utf-8', extension: 'txt' },
  chicago: { contentType: 'text/plain; charset=utf-8', extension: 'txt' },
  ieee: { contentType: 'text/plain; charset=utf-8', extension: 'txt' },
  harvard: { contentType: 'text/plain; charset=utf-8', extension: 'txt' },
})

// ── Open-access licenses (license gate before any PDF cache write) ──────

// Allowed: Creative Commons + Public Domain. Anything else is link-out only.
const OA_LICENSE_ALLOWLIST_RE = /^(cc[-_ ]|creative\s?commons|public\s?domain|pd-?|pd$)/i

function isOpenAccessLicense(license) {
  if (!license || typeof license !== 'string') return false
  return OA_LICENSE_ALLOWLIST_RE.test(license.trim())
}

// ── Dedupe rules ────────────────────────────────────────────────────────

// Primary dedupe key: DOI when present (case-insensitive). Secondary:
// normalized title hash + first-author surname hash. We never collapse
// across sources without a positive match on either key.

function normalizeTitleForDedupe(title) {
  if (!title || typeof title !== 'string') return ''
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeAuthorForDedupe(author) {
  if (!author || typeof author !== 'string') return ''
  // Use surname only (last whitespace-separated token) for cross-source matching.
  const tokens = author
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[\s,]+/)
    .filter(Boolean)
  return tokens[tokens.length - 1] || ''
}

// ── Source tiers (priority order in fan-out merge) ──────────────────────

// Higher tier wins when two adapters disagree on metadata (e.g.,
// abstract). Open-access PDF link from Unpaywall always overrides.
const SOURCE_TIER = Object.freeze({
  semanticScholar: 5,
  openAlex: 4,
  crossref: 3,
  arxiv: 2,
  unpaywall: 1, // metadata enrichment only; PDF link given priority elsewhere
})

// ── Filename sanitization (cite export Content-Disposition) ─────────────

const FILENAME_SAFE_RE = /[^A-Za-z0-9_.-]/g
const FILENAME_MAX_LENGTH = 80

function sanitizeFilename(raw) {
  if (!raw || typeof raw !== 'string') return 'paper'
  const replaced = raw.replace(FILENAME_SAFE_RE, '_').slice(0, FILENAME_MAX_LENGTH)
  // Trim trailing dots / underscores; never empty.
  return replaced.replace(/^[._]+|[._]+$/g, '') || 'paper'
}

// ── Topic feed (Week 5) ─────────────────────────────────────────────────

const TOPIC_SORT_ALLOWLIST = new Set(['trending', 'recent', 'mostCited'])
const TOPIC_DEFAULT_LIMIT = 20
const TOPIC_MAX_LIMIT = 50

// ── BibTeX-active character escapes (L3-HIGH-6) ─────────────────────────

const BIBTEX_ACTIVE_CHAR_MAP = Object.freeze({
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  '#': '\\#',
  '%': '\\%',
  '&': '\\&',
  $: '\\$',
  _: '\\_',
  '^': '\\^{}',
  '~': '\\~{}',
})

module.exports = {
  HOSTS,
  PDF_FETCH_ALLOWLIST,
  CANONICAL_ID_RE,
  DOI_RE,
  ARXIV_RE,
  SEARCH_QUERY_MIN,
  SEARCH_QUERY_MAX,
  SEARCH_LIMIT_MAX,
  SEARCH_LIMIT_DEFAULT,
  SEARCH_YEAR_MIN,
  SEARCH_YEAR_MAX,
  SEARCH_YEAR_RANGE_MIN,
  SEARCH_YEAR_RANGE_MAX,
  SEARCH_MIN_CITATIONS_MAX,
  SEARCH_AUTHOR_MAX,
  SEARCH_VENUE_MAX,
  SCHOLAR_SOURCE_SLUGS,
  SCHOLAR_SOURCE_SLUG_SET,
  SCHOLAR_SORT_SLUGS,
  SCHOLAR_SORT_SLUG_SET,
  SCHOLAR_DOMAIN_SLUGS,
  SCHOLAR_DOMAIN_SLUG_SET,
  SCHOLAR_SOURCES_MAX,
  SCHOLAR_DOMAINS_MAX,
  slugifyTopic,
  ADAPTER_SOFT_TIMEOUT_MS,
  SEARCH_CACHE_TTL_MS,
  PAPER_DEFAULT_STALE_DAYS,
  PAPER_POPULAR_STALE_DAYS,
  CITE_STYLES,
  CITE_STYLE_META,
  OA_LICENSE_ALLOWLIST_RE,
  isOpenAccessLicense,
  normalizeTitleForDedupe,
  normalizeAuthorForDedupe,
  SOURCE_TIER,
  sanitizeFilename,
  BIBTEX_ACTIVE_CHAR_MAP,
  TOPIC_SORT_ALLOWLIST,
  TOPIC_DEFAULT_LIMIT,
  TOPIC_MAX_LIMIT,
}
