// src/mobile/pages/MobileSheetDetail.jsx
// Sheet detail view — title, author, course, description, star/fork actions,
// and an iframe preview of the HTML content.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import anime from '../lib/animeCompat'
import { useSession } from '../../lib/session-context'
import { API } from '../../config'
import MobileTopBar from '../components/MobileTopBar'

const PREFERS_REDUCED =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* ── Fetch helpers ─────────────────────────────────────────────── */

async function fetchSheet(id) {
  const res = await fetch(`${API}/api/sheets/${id}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load sheet')
  return res.json()
}

async function toggleStar(id, starred) {
  const method = starred ? 'DELETE' : 'POST'
  await fetch(`${API}/api/sheets/${id}/star`, { method, credentials: 'include' })
}

/* ── Time formatting ───────────────────────────────────────────── */

function formatDate(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/* ── Main component ────────────────────────────────────────────── */

export default function MobileSheetDetail() {
  const { sheetId } = useParams()
  const { user } = useSession()
  const navigate = useNavigate()

  const [sheet, setSheet] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [starred, setStarred] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewError, setPreviewError] = useState('')

  const contentRef = useRef(null)
  const previewFetchRef = useRef(false)

  useEffect(() => {
    let active = true
    fetchSheet(sheetId)
      .then((data) => {
        if (!active) return
        const s = data.sheet || data
        setSheet(s)
        setStarred(Boolean(s.starred))
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [sheetId])

  // Animate entrance
  useEffect(() => {
    if (loading || PREFERS_REDUCED || !contentRef.current) return
    anime({
      targets: contentRef.current.children,
      translateY: [16, 0],
      opacity: [0, 1],
      duration: 350,
      delay: anime.stagger(60),
      easing: 'easeOutCubic',
    })
  }, [loading])

  const handleStar = useCallback(async () => {
    if (!user) return
    const prev = starred
    setStarred(!prev)
    try {
      await toggleStar(sheetId, prev)
    } catch {
      setStarred(prev)
    }
  }, [sheetId, starred, user])

  const handleFork = useCallback(() => {
    navigate(`/m/sheets/${sheetId}/fork`)
  }, [sheetId, navigate])

  // Fetch the signed preview URL lazily the first time the user taps
  // "Preview". The backend endpoint `/api/sheets/:id/html-preview` returns
  // JSON containing a short-lived `previewUrl` that points at the sandboxed
  // `/preview/html?token=...` route — we can only put THAT url in an iframe.
  // (Pointing the iframe at `/api/sheets/:id/html-preview` directly caused
  // ERR_BLOCKED_BY_RESPONSE because the JSON endpoint lives on the app
  // surface, which sets `X-Frame-Options: DENY` and `frame-ancestors 'none'`.)
  useEffect(() => {
    if (!showPreview || previewUrl || previewError) return
    if (!sheet || sheet.contentFormat !== 'html') return
    if (previewFetchRef.current) return

    previewFetchRef.current = true
    let active = true

    fetch(`${API}/api/sheets/${sheetId}/html-preview`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!active) return
        if (!res.ok || !data?.previewUrl) {
          throw new Error(data?.error || 'Could not load preview.')
        }
        setPreviewUrl(data.previewUrl)
      })
      .catch((err) => {
        if (active) setPreviewError(err.message || 'Could not load preview.')
      })
      .finally(() => {
        previewFetchRef.current = false
      })

    return () => {
      active = false
    }
  }, [showPreview, previewUrl, previewError, sheet, sheetId])

  if (loading) {
    return (
      <>
        <MobileTopBar title="Sheet" showBack />
        <div className="mob-sheet-skeleton">
          <div className="mob-sheet-skeleton-title" />
          <div className="mob-sheet-skeleton-meta" />
          <div className="mob-sheet-skeleton-body" />
        </div>
      </>
    )
  }

  if (error || !sheet) {
    return (
      <>
        <MobileTopBar title="Sheet" showBack />
        <div className="mob-feed-empty">
          <h3 className="mob-feed-empty-title">Sheet not found</h3>
          <p className="mob-feed-empty-text">{error || 'This sheet may have been removed.'}</p>
        </div>
      </>
    )
  }

  const authorName = sheet.author?.username || 'Anonymous'
  const courseTag = sheet.course?.code || sheet.course?.name || null

  return (
    <div className="mob-sheet">
      <MobileTopBar title="Sheet" showBack />

      <div ref={contentRef} className="mob-sheet-content">
        {/* Header */}
        <div className="mob-sheet-header">
          <h1 className="mob-sheet-title">{sheet.title}</h1>

          <div className="mob-sheet-meta">
            <span className="mob-sheet-author">{authorName}</span>
            {courseTag && (
              <>
                <span className="mob-feed-card-dot" />
                <span className="mob-sheet-course">{courseTag}</span>
              </>
            )}
            <span className="mob-feed-card-dot" />
            <span className="mob-sheet-date">{formatDate(sheet.createdAt)}</span>
          </div>

          {sheet.description && <p className="mob-sheet-description">{sheet.description}</p>}
        </div>

        {/* Actions bar */}
        <div className="mob-sheet-actions">
          <button
            type="button"
            className={`mob-sheet-action-btn ${starred ? 'mob-sheet-action-btn--active' : ''}`}
            onClick={handleStar}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={starred ? 'currentColor' : 'none'}
              aria-hidden="true"
            >
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{starred ? 'Starred' : 'Star'}</span>
          </button>

          {sheet?.allowEditing === true && sheet?.userId !== user?.id ? (
            <button type="button" className="mob-sheet-action-btn" onClick={handleFork}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="18" r="3" stroke="currentColor" strokeWidth="2" />
                <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="2" />
                <circle cx="18" cy="6" r="3" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M12 15V9M6 9v1c0 2 2 3 6 3s6-1 6-3V9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span>Fork</span>
            </button>
          ) : null}

          <button
            type="button"
            className="mob-sheet-action-btn"
            onClick={() => setShowPreview((p) => !p)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span>{showPreview ? 'Hide' : 'Preview'}</span>
          </button>
        </div>

        {/* Fork source */}
        {sheet.forkSource && (
          <div className="mob-sheet-fork-source">
            Forked from{' '}
            <button
              type="button"
              className="mob-sheet-fork-link"
              onClick={() => navigate(`/m/sheets/${sheet.forkSource.id}`)}
            >
              {sheet.forkSource.title}
            </button>
            {sheet.forkSource.author && <span> by {sheet.forkSource.author.username}</span>}
          </div>
        )}

        {/* Stats */}
        <div className="mob-sheet-stats">
          {sheet.reactions && (
            <span className="mob-sheet-stat">{sheet.reactions.likes || 0} likes</span>
          )}
          {sheet.commentCount > 0 && (
            <span className="mob-sheet-stat">{sheet.commentCount} comments</span>
          )}
        </div>

        {/* Preview iframe */}
        {showPreview && (
          <div className="mob-sheet-preview">
            {!previewUrl && !previewError && (
              <div className="mob-sheet-preview-state">Loading preview…</div>
            )}
            {previewError && !previewUrl && (
              <div className="mob-sheet-preview-state mob-sheet-preview-state--error">
                {previewError}
              </div>
            )}
            {previewUrl && (
              <iframe
                src={previewUrl}
                title="Sheet preview"
                className="mob-sheet-iframe"
                sandbox="allow-same-origin"
                referrerPolicy="no-referrer"
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
