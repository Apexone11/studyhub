/**
 * SimilarInLibraryBadge — tiny inline chip showing how many saved papers
 * in the viewer's library are similar to the current paper, linking
 * through to the filtered Saved view.
 *
 * On mount: GET /api/scholar/saved?similarTo=:id&limit=3.
 *   - 200 + count > 0 → render chip "${count} in your library →".
 *   - 200 + count == 0 → render nothing.
 *   - 404 (endpoint not wired yet) → render nothing.
 *   - Any other error → render nothing (silent — this is decorative).
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../../../config'

const CHIP_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  background: 'var(--sh-soft)',
  border: '1px solid var(--sh-border)',
  borderRadius: '999px',
  color: 'var(--sh-accent, var(--sh-brand))',
  fontFamily: 'inherit',
  fontSize: 'var(--type-xs)',
  fontWeight: 500,
  textDecoration: 'none',
  minHeight: '28px',
}

export default function SimilarInLibraryBadge({ paper }) {
  // Track count per paper id. We key by id so a paper-prop swap doesn't
  // need a synchronous setState reset inside the effect (which trips the
  // react-hooks/set-state-in-effect rule).
  const [state, setState] = useState({ id: null, count: null })
  const paperId = paper && typeof paper.id === 'string' ? paper.id : null
  const lastFetchedRef = useRef(null)

  useEffect(() => {
    if (!paperId) return undefined
    if (lastFetchedRef.current === paperId) return undefined
    lastFetchedRef.current = paperId
    let aborted = false
    fetch(`${API}/api/scholar/saved?similarTo=${encodeURIComponent(paperId)}&limit=3`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) return null
        return res.json()
      })
      .then((json) => {
        if (aborted || !json) return
        // Accept either `{ count, items }`, `{ total }`, or raw array.
        let n = 0
        if (typeof json.count === 'number') n = json.count
        else if (typeof json.total === 'number') n = json.total
        else if (Array.isArray(json.items)) n = json.items.length
        else if (Array.isArray(json)) n = json.length
        if (!aborted) setState({ id: paperId, count: n })
      })
      .catch(() => {
        // Decorative chip — silent on error.
      })
    return () => {
      aborted = true
    }
  }, [paperId])

  if (!paperId) return null
  const count = state.id === paperId ? state.count : null
  if (count == null || count <= 0) return null

  return (
    <Link
      to={`/scholar/saved?similarTo=${encodeURIComponent(paperId)}`}
      style={CHIP_STYLE}
      aria-label={`${count} similar paper${count === 1 ? '' : 's'} in your library`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
      <span>
        {count} in your library <span aria-hidden="true">→</span>
      </span>
    </Link>
  )
}
