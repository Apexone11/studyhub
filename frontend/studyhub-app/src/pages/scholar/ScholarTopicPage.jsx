/**
 * ScholarTopicPage.jsx — `/scholar/topic/:slug`.
 *
 * Topic feed redesign: large sans-serif header, follow pill, sort tabs
 * (Latest / Most cited / Trending / Recently at your school), responsive
 * 1-col phone / 2-col tablet+ paper grid.
 *
 * Endpoints (all 404-tolerant — page renders empty state instead of crash):
 *   - GET /api/scholar/topic/:slug?sort=... (existing) is used as the
 *     primary feed source.
 *   - GET /api/scholar/topics/:slug/papers?sort=... (preferred per brief)
 *     is attempted first; falls back to `/topic/:slug` on 404.
 *   - POST /api/scholar/topics/:slug/follow toggles follow state.
 *   - GET /api/scholar/topics/:slug/follow reads current follow state.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '../../lib/usePageTitle'
import useFetch from '../../lib/useFetch'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { showToast } from '../../lib/toast'
import PaperCard from './paperCard/PaperCard'
import CiteModal from './cite/CiteModal'
import useSavedPapers from './useSavedPapers'
import { POPULAR_TOPICS } from './scholarConstants'
import ScholarShell from './ScholarShell'
import './ScholarPage.css'
import './ScholarLists.css'

const SORT_OPTIONS = [
  { id: 'recent', label: 'Latest' },
  { id: 'mostCited', label: 'Most cited' },
  { id: 'trending', label: 'Trending' },
  { id: 'school', label: 'Recently at your school' },
]

const TOPIC_DESCRIPTIONS = {
  medicine:
    'Clinical research, drug efficacy, public health interventions, and patient-care methodology.',
  'machine-learning':
    'Statistical learning, neural architectures, training techniques, and benchmarks.',
  engineering:
    'Applied research across electrical, mechanical, civil, and software engineering disciplines.',
  'physics-general': 'Theoretical and experimental physics, from condensed matter to particles.',
  nlp: 'Natural language processing, large language models, parsing, and dialogue systems.',
  'public-health': 'Population-scale interventions, epidemiology, and health-system research.',
  chemistry: 'Synthesis, reaction mechanisms, analytical chemistry, and materials.',
  'materials-science':
    'Engineering of metals, polymers, ceramics, and emerging functional materials.',
  'cell-biology': 'Cellular mechanisms, signaling, organelles, and developmental biology.',
  psychology: 'Cognition, behavior, mental health, and experimental social psychology.',
  'computer-vision': 'Image and video understanding, recognition, generation, and 3D vision.',
  economics: 'Macroeconomics, microeconomics, econometrics, and applied policy research.',
  mathematics: 'Pure and applied math, algebra, analysis, geometry, and discrete math.',
  neuroscience: 'Brain function, neural circuits, neurodegeneration, and cognitive systems.',
  astrophysics: 'Cosmology, stellar physics, galaxies, and high-energy astrophysical phenomena.',
  biochemistry: 'Protein structure, enzymes, metabolic pathways, and molecular function.',
  genomics: 'Genome biology, sequencing, variant analysis, and functional genomics.',
  sociology: 'Social structure, inequality, networks, and quantitative sociological methods.',
  statistics: 'Inference, experimental design, Bayesian methods, and statistical learning.',
  'climate-science': 'Climate dynamics, modeling, attribution, and mitigation research.',
  'earth-science': 'Geology, oceanography, atmospheric science, and planetary geoscience.',
  'quantum-physics': 'Quantum mechanics, quantum information, and condensed matter physics.',
  education: 'Pedagogy, learning sciences, assessment, and education policy.',
  linguistics: 'Phonology, syntax, semantics, sociolinguistics, and computational linguistics.',
}

function SkeletonGrid() {
  return (
    <div className="scholar-list__grid" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="scholar-list__skeleton-card">
          <div className="scholar-list__skeleton-line scholar-list__skeleton-line--title" />
          <div className="scholar-list__skeleton-line scholar-list__skeleton-line--meta" />
          <div className="scholar-list__skeleton-line scholar-list__skeleton-line--abstract" />
        </div>
      ))}
    </div>
  )
}

export default function ScholarTopicPage() {
  const { slug } = useParams()
  const safeSlug = (slug || '').toLowerCase()
  const { savedIds, toggleSave } = useSavedPapers()
  const [citePaper, setCitePaper] = useState(null)
  const [params, setParams] = useSearchParams()
  const requestedSort = params.get('sort')
  const sort = SORT_OPTIONS.some((s) => s.id === requestedSort) ? requestedSort : 'recent'

  const topicLabel = useMemo(() => {
    const match = POPULAR_TOPICS.find((t) => t.slug === safeSlug)
    if (match) return match.label
    return safeSlug
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ')
  }, [safeSlug])

  const topicDescription = TOPIC_DESCRIPTIONS[safeSlug] || ''

  usePageTitle(topicLabel ? `${topicLabel} — Scholar` : 'Scholar topic')

  // Primary feed source — tries the preferred /topics/:slug/papers endpoint
  // and falls back to /topic/:slug on 404. SWR keeps the previous data
  // painted during sort switches so the page never flashes a skeleton.
  const preferredPath = `/api/scholar/topics/${encodeURIComponent(safeSlug)}/papers?sort=${sort}&limit=20`
  const {
    data: preferredData,
    error: preferredError,
    loading: preferredLoading,
  } = useFetch(preferredPath, {
    skip: !safeSlug,
    swr: 30000,
    cacheKey: `scholar-topic:preferred:${safeSlug}:${sort}`,
  })

  const fallbackPath = `/api/scholar/topic/${encodeURIComponent(safeSlug)}?sort=${sort}&limit=20`
  const {
    data: fallbackData,
    error: fallbackError,
    loading: fallbackLoading,
  } = useFetch(fallbackPath, {
    skip: !safeSlug || (!!preferredData && !preferredError),
    swr: 30000,
    cacheKey: `scholar-topic:fallback:${safeSlug}:${sort}`,
  })

  const results = useMemo(() => {
    const src = preferredData && !preferredError ? preferredData : fallbackData
    if (!src) return []
    const arr = Array.isArray(src.results)
      ? src.results
      : Array.isArray(src.papers)
        ? src.papers
        : Array.isArray(src.items)
          ? src.items
          : []
    return arr
  }, [preferredData, preferredError, fallbackData])

  const loading = !!safeSlug && (preferredLoading || fallbackLoading) && results.length === 0
  const error = preferredError && fallbackError ? fallbackError : null

  const setSort = useCallback(
    (next) => {
      const nextParams = new URLSearchParams(params)
      nextParams.set('sort', next)
      setParams(nextParams, { replace: true })
    },
    [params, setParams],
  )

  // Follow state — read once on mount, optimistic toggle on click.
  // 404 on the GET means "not implemented yet" — the button still functions
  // and toggles purely client-side until the endpoint exists.
  //
  // Until the backend endpoint exists, persist the followed state to the
  // localStorage key `studyhub.scholar.followedTopics` (Set of slug strings)
  // so the "Following" pill sticks across navigation and reloads.
  const FOLLOW_KEY = 'studyhub.scholar.followedTopics'
  const [followed, setFollowed] = useState(() => {
    if (typeof window === 'undefined' || !safeSlug) return false
    try {
      const raw = window.localStorage.getItem(FOLLOW_KEY)
      if (!raw) return false
      const list = JSON.parse(raw)
      return Array.isArray(list) && list.includes(safeSlug)
    } catch {
      return false
    }
  })
  const [followBusy, setFollowBusy] = useState(false)

  // Write-through helper: mirror the followed-set to localStorage whenever
  // we flip state. Safari private mode throws on setItem — swallow.
  const persistFollowedToLocal = useCallback(
    (slug, next) => {
      if (typeof window === 'undefined' || !slug) return
      try {
        const raw = window.localStorage.getItem(FOLLOW_KEY)
        const parsed = raw ? JSON.parse(raw) : []
        const list = Array.isArray(parsed) ? parsed : []
        const set = new Set(list)
        if (next) set.add(slug)
        else set.delete(slug)
        window.localStorage.setItem(FOLLOW_KEY, JSON.stringify(Array.from(set)))
      } catch {
        // Safari private mode / corrupted value — non-fatal.
      }
    },
    [FOLLOW_KEY],
  )

  useEffect(() => {
    if (!safeSlug) return undefined
    let aborted = false
    fetch(`${API}/api/scholar/topics/${encodeURIComponent(safeSlug)}/follow`, {
      credentials: 'include',
      headers: authHeaders(),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (aborted || !json) return
        // Defer the state write to the next microtask so it does not run
        // inside an effect's synchronous body (React Compiler lint).
        Promise.resolve().then(() => setFollowed(!!json.following))
      })
      .catch(() => {
        // Treat any failure as "not followed yet" — non-fatal.
      })
    return () => {
      aborted = true
    }
  }, [safeSlug])

  const toggleFollow = useCallback(async () => {
    if (!safeSlug || followBusy) return
    setFollowBusy(true)
    const previous = followed
    const next = !previous
    setFollowed(next) // optimistic; reverted on failure
    // Persist locally up-front so a reload during the in-flight fetch
    // keeps the user's choice visible. Backend success overrides later.
    persistFollowedToLocal(safeSlug, next)
    try {
      const res = await fetch(`${API}/api/scholar/topics/${encodeURIComponent(safeSlug)}/follow`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({ follow: next }),
      })
      if (res.status === 404) {
        // Endpoint not built — keep optimistic state + the localStorage
        // mirror is the only persistence path until the route lands.
        showToast(
          previous
            ? `Removed ${topicLabel} from your followed topics.`
            : `Following ${topicLabel} — your list is saved locally for now.`,
          'info',
        )
        return
      }
      if (!res.ok) throw new Error(`Follow failed (${res.status})`)
      const json = await res.json().catch(() => ({}))
      const persisted = typeof json.following === 'boolean' ? json.following : next
      setFollowed(persisted)
      persistFollowedToLocal(safeSlug, persisted)
      showToast(persisted ? `Following ${topicLabel}.` : `Unfollowed ${topicLabel}.`, 'success')
    } catch (err) {
      setFollowed(previous)
      persistFollowedToLocal(safeSlug, previous)
      showToast(err.message || 'Could not update follow state.', 'error')
    } finally {
      setFollowBusy(false)
    }
  }, [safeSlug, followBusy, followed, topicLabel, persistFollowedToLocal])

  return (
    <ScholarShell mainId="scholar-topic-main">
      <div
        className="scholar-shell scholar-list__page"
        style={{ paddingTop: 0, paddingBottom: 'calc(48px + env(safe-area-inset-bottom))' }}
      >
        <section aria-label="Topic feed">
          <div
            style={{
              fontSize: 'var(--type-xs)',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--sh-subtext)',
              marginBottom: 4,
            }}
          >
            Topic
          </div>
          <div className="scholar-topic-v2__header">
            <div style={{ minWidth: 0, flex: '1 1 320px' }}>
              <h1 className="scholar-topic-v2__title">{topicLabel}</h1>
              <p className="scholar-topic-v2__desc">
                {topicDescription
                  ? topicDescription
                  : `Explore recent and influential papers tagged ${topicLabel}.`}
              </p>
            </div>
            <button
              type="button"
              className="scholar-topic-v2__follow"
              aria-pressed={followed}
              disabled={followBusy}
              onClick={toggleFollow}
            >
              {followed ? 'Following' : 'Save topic'}
            </button>
          </div>

          <div role="tablist" className="scholar-tabs" style={{ marginTop: 20 }}>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                role="tab"
                type="button"
                aria-selected={sort === opt.id}
                className="scholar-tab"
                onClick={() => setSort(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {loading && (
            <div style={{ marginTop: 16 }}>
              <SkeletonGrid />
            </div>
          )}

          {!loading && error && (
            <div
              style={{
                color: 'var(--sh-danger-text)',
                background: 'var(--sh-danger-bg)',
                padding: 12,
                borderRadius: 8,
                border: '1px solid var(--sh-border)',
                marginTop: 16,
              }}
            >
              Could not load this topic right now. Try again in a moment.
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="scholar-topic-v2__empty" style={{ marginTop: 16 }}>
              <h2 className="scholar-topic-v2__empty-headline">
                No {topicLabel} papers cached yet
              </h2>
              <p className="scholar-topic-v2__empty-body">
                The topic feed fills in as students search Scholar. Run a search and the next
                visitor will see results here.
              </p>
              <div className="scholar-topic-v2__empty-actions">
                <Link
                  to={`/scholar/search?q=${encodeURIComponent(topicLabel)}`}
                  className="scholar-topic-v2__empty-cta-primary"
                >
                  Search for {topicLabel}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </Link>
                <Link to="/scholar" className="scholar-topic-v2__empty-cta-secondary">
                  Back to topics
                </Link>
              </div>
            </div>
          )}

          {!loading && !error && results.length > 0 && (
            <div className="scholar-list__grid" style={{ marginTop: 16 }}>
              {results.map((paper) => (
                <PaperCard
                  key={paper.id}
                  paper={paper}
                  variant="full"
                  saved={savedIds.has(paper.id)}
                  onSave={toggleSave}
                  onCite={setCitePaper}
                />
              ))}
            </div>
          )}

          {citePaper && (
            <CiteModal
              paperId={citePaper.id}
              paperTitle={citePaper.title}
              onClose={() => setCitePaper(null)}
            />
          )}

          <div style={{ marginTop: 32 }}>
            <Link
              to="/scholar"
              style={{
                color: 'var(--sh-brand)',
                textDecoration: 'none',
                fontSize: 'var(--type-sm)',
              }}
            >
              ← Back to Scholar
            </Link>
          </div>
        </section>
      </div>
    </ScholarShell>
  )
}
