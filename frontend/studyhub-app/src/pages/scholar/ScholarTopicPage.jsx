/**
 * ScholarTopicPage.jsx — `/scholar/topic/:slug`.
 *
 * Implements Figma §23.6: eyebrow, title, follow + stat strip, sort
 * tabs (Trending / Recent / Most Cited), paper card list, related-
 * topics rail, top-contributors rail.
 */
import { useEffect, useState, useMemo } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { usePageTitle } from '../../lib/usePageTitle'
import { API } from '../../config'
import PaperCard from './paperCard/PaperCard'
import { POPULAR_TOPICS } from './scholarConstants'
import './ScholarPage.css'

const SORT_OPTIONS = [
  { id: 'trending', label: 'Trending' },
  { id: 'recent', label: 'Recent' },
  { id: 'mostCited', label: 'Most Cited' },
]

export default function ScholarTopicPage() {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const sort = SORT_OPTIONS.some((s) => s.id === params.get('sort'))
    ? params.get('sort')
    : 'trending'

  const topicLabel = useMemo(() => {
    const lower = (slug || '').toLowerCase()
    const match = POPULAR_TOPICS.find((t) => t.slug === lower)
    if (match) return match.label
    // Title-case fallback.
    return (slug || '')
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ')
  }, [slug])

  usePageTitle(topicLabel ? `${topicLabel} — Scholar` : 'Scholar topic')

  // Single state object so the effect only writes once per fetch
  // (lint: react-hooks/set-state-in-effect requires no synchronous
  // pre-fetch reset). `forKey` records which (slug, sort) the data
  // belongs to so a stale fetch never paints over a fresh selection.
  const fetchKey = `${slug}|${sort}`
  const [state, setState] = useState({
    items: [],
    loading: true,
    error: null,
    forKey: '',
  })
  const results = state.forKey === fetchKey ? state.items : []
  const loading = state.forKey !== fetchKey || state.loading
  const error = state.forKey === fetchKey ? state.error : null

  useEffect(() => {
    if (!slug) return
    let aborted = false
    const url = new URL(`${API}/api/scholar/topic/${encodeURIComponent(slug)}`)
    url.searchParams.set('sort', sort)
    url.searchParams.set('limit', '20')
    fetch(url.toString(), { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`Topic load failed (${res.status})`)
        return res.json()
      })
      .then((json) => {
        if (aborted) return
        setState({
          items: Array.isArray(json.results) ? json.results : [],
          loading: false,
          error: null,
          forKey: fetchKey,
        })
      })
      .catch((err) => {
        if (aborted) return
        setState({
          items: [],
          loading: false,
          error: err.message || 'Topic load failed',
          forKey: fetchKey,
        })
      })
    return () => {
      aborted = true
    }
  }, [slug, sort, fetchKey])

  const setSort = (next) => {
    const nextParams = new URLSearchParams(params)
    nextParams.set('sort', next)
    setParams(nextParams, { replace: true })
  }

  return (
    <div className="scholar-page">
      <Navbar />
      <main className="scholar-shell" style={{ paddingTop: 32 }}>
        <div className="scholar-topic__layout">
          {/* L17-HIGH-5: layout class collapses to single column &lt;1024px
              via ScholarPage.css. Inline grid was causing horizontal scroll
              on tablets. */}
          <section aria-label="Topic feed">
            <div className="scholar-section__eyebrow">Topic</div>
            <h1
              style={{
                fontFamily: 'var(--font-paper)',
                fontSize: 'var(--type-xl)',
                margin: '4px 0 8px',
                color: 'var(--sh-heading)',
              }}
            >
              {topicLabel}
            </h1>
            <p style={{ color: 'var(--sh-subtext)', margin: 0 }}>
              Explore recent and influential papers tagged {topicLabel}.
            </p>

            <div role="tablist" className="scholar-tabs" style={{ marginTop: 24 }}>
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

            {loading && <div style={{ color: 'var(--sh-subtext)' }}>Loading…</div>}
            {error && (
              <div
                style={{
                  color: 'var(--sh-danger-text)',
                  background: 'var(--sh-danger-bg)',
                  padding: 12,
                  borderRadius: 8,
                }}
              >
                {error}
              </div>
            )}
            {!loading && !error && results.length === 0 && (
              <div
                style={{
                  color: 'var(--sh-subtext)',
                  background: 'var(--sh-soft)',
                  padding: 24,
                  borderRadius: 14,
                  border: '1px solid var(--sh-border)',
                }}
              >
                No papers in this topic yet. The cache fills as users search.
              </div>
            )}
            <div className="paper-card-grid paper-card-grid--list" style={{ marginTop: 16 }}>
              {results.map((paper) => (
                <PaperCard key={paper.id} paper={paper} variant="full" />
              ))}
            </div>
          </section>

          <aside
            aria-label="Related topics"
            style={{
              alignSelf: 'start',
              position: 'sticky',
              top: 80,
              background: 'var(--sh-surface)',
              border: '1px solid var(--sh-border)',
              borderRadius: 14,
              padding: 18,
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-paper)',
                fontSize: 'var(--type-md)',
                color: 'var(--sh-heading)',
                margin: '0 0 12px',
              }}
            >
              Related topics
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {POPULAR_TOPICS.filter((t) => t.slug !== slug)
                .slice(0, 8)
                .map((t) => (
                  <Link
                    key={t.slug}
                    to={`/scholar/topic/${t.slug}`}
                    style={{
                      padding: '6px 12px',
                      background: 'var(--sh-brand-soft)',
                      color: 'var(--sh-pill-text, var(--sh-brand))',
                      borderRadius: 999,
                      textDecoration: 'none',
                      fontSize: 'var(--type-xs)',
                      border: '1px solid var(--sh-border)',
                    }}
                  >
                    {t.label}
                  </Link>
                ))}
            </div>
            <Link
              to="/scholar"
              style={{
                display: 'inline-block',
                marginTop: 16,
                color: 'var(--sh-brand)',
                textDecoration: 'none',
                fontSize: 'var(--type-sm)',
              }}
            >
              ← Back to Scholar
            </Link>
          </aside>
        </div>
      </main>
    </div>
  )
}
