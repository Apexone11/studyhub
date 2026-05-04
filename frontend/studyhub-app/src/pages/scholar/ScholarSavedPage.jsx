/**
 * ScholarSavedPage.jsx — `/scholar/saved` and `/scholar/shelf/:id`.
 *
 * Reuses BookShelf / ShelfBook (sourceType='paper') so saved papers
 * live alongside saved books with no duplicated storage.
 *
 * Lists shelves the user owns + paper rows in a list/grid toggle.
 */
import { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { usePageTitle } from '../../lib/usePageTitle'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import './ScholarPage.css'

export default function ScholarSavedPage() {
  usePageTitle('Saved papers')
  // Copilot fix: deep-link `/scholar/shelf/:id` now seeds activeShelfId
  // so navigating directly to a shelf URL filters correctly.
  const { id: shelfIdParam } = useParams()
  const initialShelfId = shelfIdParam ? Number.parseInt(shelfIdParam, 10) : null
  const [shelves, setShelves] = useState([])
  const [activeShelfId, setActiveShelfId] = useState(
    Number.isInteger(initialShelfId) && initialShelfId > 0 ? initialShelfId : null,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [view, setView] = useState('list')

  const fetchShelves = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Copilot fix: must request includeBooks=true — listShelvesHandler
      // omits the `books` array unless asked. Without this, every shelf
      // appeared empty.
      const res = await fetch(`${API}/api/library/shelves?includeBooks=true`, {
        credentials: 'include',
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error(`Could not load shelves (${res.status})`)
      const json = await res.json()
      setShelves(Array.isArray(json.shelves) ? json.shelves : [])
    } catch (err) {
      setError(err.message || 'Failed to load shelves')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchShelves()
  }, [fetchShelves])

  // Sync route param changes (deep-link navigation between shelves)
  // back into local state.
  useEffect(() => {
    if (shelfIdParam) {
      const parsed = Number.parseInt(shelfIdParam, 10)
      if (Number.isInteger(parsed) && parsed > 0) setActiveShelfId(parsed)
    }
  }, [shelfIdParam])

  const allPaperRows = shelves.flatMap((shelf) =>
    (shelf.books || [])
      .filter((b) => b.sourceType === 'paper')
      .map((b) => ({ ...b, shelfId: shelf.id, shelfName: shelf.name })),
  )

  const visiblePapers = activeShelfId
    ? allPaperRows.filter((row) => row.shelfId === activeShelfId)
    : allPaperRows

  return (
    <div className="scholar-page">
      <Navbar />
      <main className="scholar-shell" style={{ paddingTop: 32 }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: 'var(--font-paper)',
                fontSize: 'var(--type-xl)',
                margin: 0,
                color: 'var(--sh-heading)',
              }}
            >
              Saved papers
            </h1>
            <p style={{ color: 'var(--sh-subtext)', margin: '4px 0 0' }}>
              {visiblePapers.length} {visiblePapers.length === 1 ? 'paper' : 'papers'}
            </p>
          </div>
          <div role="radiogroup" aria-label="View mode" style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              role="radio"
              aria-checked={view === 'list'}
              className="scholar-action-btn"
              onClick={() => setView('list')}
            >
              List
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={view === 'grid'}
              className="scholar-action-btn"
              onClick={() => setView('grid')}
            >
              Grid
            </button>
          </div>
        </header>

        {loading && <div style={{ color: 'var(--sh-subtext)' }}>Loading shelves…</div>}
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

        {!loading && !error && (
          <>
            <div
              style={{
                display: 'flex',
                gap: 12,
                overflowX: 'auto',
                marginBottom: 24,
                paddingBottom: 8,
              }}
            >
              <button
                type="button"
                onClick={() => setActiveShelfId(null)}
                className="scholar-action-btn"
                style={{
                  background: activeShelfId === null ? 'var(--sh-brand-soft)' : undefined,
                  color: activeShelfId === null ? 'var(--sh-brand)' : undefined,
                }}
              >
                All saved
              </button>
              {shelves.map((shelf) => (
                <button
                  key={shelf.id}
                  type="button"
                  onClick={() => setActiveShelfId(shelf.id)}
                  className="scholar-action-btn"
                  style={{
                    background: activeShelfId === shelf.id ? 'var(--sh-brand-soft)' : undefined,
                    color: activeShelfId === shelf.id ? 'var(--sh-brand)' : undefined,
                  }}
                >
                  {shelf.name}
                </button>
              ))}
            </div>

            {visiblePapers.length === 0 ? (
              <div
                style={{
                  color: 'var(--sh-subtext)',
                  background: 'var(--sh-soft)',
                  padding: 24,
                  borderRadius: 14,
                  border: '1px solid var(--sh-border)',
                }}
              >
                No saved papers yet. Open a paper and click Save to start a list.
              </div>
            ) : (
              <div
                className={
                  view === 'grid' ? 'paper-card-grid' : 'paper-card-grid paper-card-grid--list'
                }
              >
                {visiblePapers.map((row) => (
                  <Link
                    key={`${row.shelfId}-${row.id}`}
                    to={`/scholar/paper/${encodeURIComponent(row.paperId || row.volumeId)}`}
                    className="paper-card paper-card--compact"
                  >
                    <h3 className="paper-card__title">{row.title}</h3>
                    <div className="paper-card__authors">
                      <span className="paper-card__author-names">{row.author}</span>
                    </div>
                    <div className="paper-card__venue" style={{ fontSize: 'var(--type-xs)' }}>
                      {row.shelfName}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        <Link
          to="/scholar"
          style={{
            display: 'inline-block',
            marginTop: 32,
            color: 'var(--sh-brand)',
            textDecoration: 'none',
          }}
        >
          ← Back to Scholar
        </Link>
      </main>
    </div>
  )
}
