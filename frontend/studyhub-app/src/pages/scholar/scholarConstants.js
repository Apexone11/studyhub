/**
 * scholarConstants.js — Shared constants for Scholar pages.
 */

// Paper id regex must mirror backend `CANONICAL_ID_RE`. Used to validate
// `?paperId=` deep links before fetching (L3-LOW-5). The DOI suffix uses
// an explicit printable-ASCII allowlist (no `[^\s]`) to defend against
// null-byte injection per Week 4's hardened regex.
export const PAPER_ID_REGEX =
  /^(doi:10\.\d{4,9}\/[A-Za-z0-9._\-/:;()<>+]{1,200}|arxiv:\d{4}\.\d{4,5}(v\d+)?|ss:[a-f0-9]{32,64}|oa:W\d{4,12})$/i

export const TRY_CHIPS = [
  'transformer attention',
  'krebs cycle regulation',
  'marine primary production',
  'diffusion models',
]

// Ordered most-populous-first per Figma §3 "Browse by topic" treatment.
// Counts are stable display strings; live counts will replace these once the
// /api/scholar/topics endpoint reports per-topic populations.
export const POPULAR_TOPICS = [
  { slug: 'medicine', label: 'Medicine', count: '28.4k' },
  { slug: 'machine-learning', label: 'Machine Learning', count: '24.3k' },
  { slug: 'engineering', label: 'Engineering', count: '21.8k' },
  { slug: 'physics-general', label: 'Physics', count: '19.6k' },
  { slug: 'nlp', label: 'NLP', count: '18.9k' },
  { slug: 'public-health', label: 'Public Health', count: '17.5k' },
  { slug: 'chemistry', label: 'Chemistry', count: '16.4k' },
  { slug: 'materials-science', label: 'Materials Science', count: '15.7k' },
  { slug: 'cell-biology', label: 'Cell Biology', count: '14.2k' },
  { slug: 'psychology', label: 'Psychology', count: '13.8k' },
  { slug: 'computer-vision', label: 'Computer Vision', count: '12.7k' },
  { slug: 'economics', label: 'Economics', count: '11.9k' },
  { slug: 'mathematics', label: 'Mathematics', count: '10.6k' },
  { slug: 'neuroscience', label: 'Neuroscience', count: '9.6k' },
  { slug: 'astrophysics', label: 'Astrophysics', count: '9.1k' },
  { slug: 'biochemistry', label: 'Biochemistry', count: '8.4k' },
  { slug: 'genomics', label: 'Genomics', count: '7.8k' },
  { slug: 'sociology', label: 'Sociology', count: '7.2k' },
  { slug: 'statistics', label: 'Statistics', count: '6.8k' },
  { slug: 'climate-science', label: 'Climate Science', count: '6.1k' },
  { slug: 'earth-science', label: 'Earth Science', count: '5.6k' },
  { slug: 'quantum-physics', label: 'Quantum Physics', count: '5.2k' },
  { slug: 'education', label: 'Education', count: '4.9k' },
  { slug: 'linguistics', label: 'Linguistics', count: '3.7k' },
]

// Backend source adapter slugs (mirrors `backend/src/modules/scholar/sources/*`).
// Used by the Filters drawer multi-select chips. Only adapters that emit
// search results belong here. Unpaywall is enrichment-only on the backend
// (its `search()` is a deliberate no-op), so picking it would silently
// produce zero results — keep it out of the user-facing source list.
export const SCHOLAR_SOURCES = [
  { slug: 'semanticScholar', label: 'Semantic Scholar' },
  { slug: 'openAlex', label: 'OpenAlex' },
  { slug: 'crossref', label: 'CrossRef' },
  { slug: 'arxiv', label: 'arXiv' },
]

// Sort options for the search results page. Param value matches what
// ScholarSearchPage reads from URLSearchParams.
export const SCHOLAR_SORTS = [
  { slug: 'relevance', label: 'Relevance' },
  { slug: 'year-desc', label: 'Year (newest first)' },
  { slug: 'citations-desc', label: 'Most cited' },
  { slug: 'recent', label: 'Recently added' },
]

export const CITE_STYLES = [
  { id: 'bibtex', label: 'BibTeX' },
  { id: 'ris', label: 'RIS' },
  { id: 'csl-json', label: 'CSL JSON' },
  { id: 'apa', label: 'APA' },
  { id: 'mla', label: 'MLA' },
  { id: 'chicago', label: 'Chicago' },
  { id: 'ieee', label: 'IEEE' },
  { id: 'harvard', label: 'Harvard' },
]

/** Validate a Scholar paper id from URL params or user input. */
export function isValidPaperId(raw) {
  if (typeof raw !== 'string' || raw.length > 256) return false
  return PAPER_ID_REGEX.test(raw)
}

/** Format a number as 14.2k / 1.2M (compact display for citation counts). */
export function formatCount(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '0'
  if (n < 1000) return String(n)
  if (n < 1_000_000) {
    return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '') + 'k'
  }
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
}

/** Truncate a string at the nearest word boundary. */
export function truncate(s, max = 200) {
  if (!s || typeof s !== 'string') return ''
  if (s.length <= max) return s
  const slice = s.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice) + '…'
}
