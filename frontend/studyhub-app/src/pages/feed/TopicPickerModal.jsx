/* ════════════════════════════════════════════════════════════════════════
 * TopicPickerModal.jsx — Catalog-driven topic picker for the feed.
 *
 * Replaces the old free-text "Add topic" input. Shows a searchable list
 * of canonical topics seeded from backend/scripts/seedCanonicalTopics.js,
 * grouped by category. The user can search, click to follow, click again
 * to unfollow. The picker also offers a "Custom topic" input at the
 * bottom for power users who need something the catalog doesn't include
 * yet — that path still goes through the existing /api/hashtags/follow
 * endpoint with the same regex validation.
 * ════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { API } from '../../config'

const HASHTAG_REGEX = /^[a-z0-9_]{1,40}$/

function normalizeInput(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/\s+/g, '_')
}

export default function TopicPickerModal({ open, onClose, followedNames, onFollow, onUnfollow }) {
  const [catalog, setCatalog] = useState({ topics: [], categories: [] })
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('')
  const [customDraft, setCustomDraft] = useState('')
  const [customError, setCustomError] = useState('')
  const [busyName, setBusyName] = useState('')
  const closeRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    setLoading(true)
    fetch(`${API}/api/hashtags/catalog`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { topics: [], categories: [] }))
      .then((data) => {
        if (cancelled) return
        setCatalog({
          topics: Array.isArray(data?.topics) ? data.topics : [],
          categories: Array.isArray(data?.categories) ? data.categories : [],
        })
      })
      .catch(() => {
        if (!cancelled) setCatalog({ topics: [], categories: [] })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog.topics.filter((t) => {
      if (activeCategory && t.category !== activeCategory) return false
      if (!q) return true
      return (
        (t.displayName || '').toLowerCase().includes(q) || (t.name || '').toLowerCase().includes(q)
      )
    })
  }, [catalog.topics, query, activeCategory])

  const followedSet = useMemo(() => new Set(followedNames || []), [followedNames])

  async function handleToggle(topic) {
    setBusyName(topic.name)
    try {
      if (followedSet.has(topic.name)) {
        await onUnfollow(topic.name)
      } else {
        await onFollow(topic.name)
      }
    } finally {
      setBusyName('')
    }
  }

  async function handleCustomAdd(event) {
    event.preventDefault()
    const name = normalizeInput(customDraft)
    if (!HASHTAG_REGEX.test(name)) {
      setCustomError('Use 1-40 chars, letters/numbers/underscores only.')
      return
    }
    setCustomError('')
    setBusyName(name)
    try {
      await onFollow(name)
      setCustomDraft('')
    } catch (err) {
      setCustomError(err?.message || 'Could not follow topic.')
    } finally {
      setBusyName('')
    }
  }

  if (!open) return null

  return createPortal(
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 10000,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pick topics"
        style={{
          background: 'var(--sh-surface)',
          borderRadius: 14,
          border: '1px solid var(--sh-border)',
          width: 'min(720px, 100%)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--sh-border)',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--sh-heading)' }}>
              Pick topics for your feed
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--sh-muted)' }}>
              Following topics personalises your For-You feed and surfaces matching sheets, notes,
              and posts.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid var(--sh-border)',
              background: 'var(--sh-surface)',
              color: 'var(--sh-text)',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </header>

        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--sh-border)' }}>
          <input
            type="search"
            placeholder="Search topics…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--sh-input-border)',
              background: 'var(--sh-input-bg, var(--sh-surface))',
              color: 'var(--sh-text)',
              fontSize: 13,
              fontFamily: 'inherit',
            }}
            autoFocus
          />
          {catalog.categories.length > 0 ? (
            <div
              style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                marginTop: 10,
                fontSize: 12,
              }}
            >
              <button
                type="button"
                onClick={() => setActiveCategory('')}
                style={categoryChipStyle(activeCategory === '')}
              >
                All
              </button>
              {catalog.categories.map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={categoryChipStyle(activeCategory === cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--sh-muted)' }}>Loading topics…</div>
          ) : filtered.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--sh-muted)', lineHeight: 1.6 }}>
              No matching topics. Try a different search, or add a custom topic below.
            </div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 8,
              }}
            >
              {filtered.map((t) => {
                const followed = followedSet.has(t.name)
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => handleToggle(t)}
                      disabled={busyName === t.name}
                      aria-pressed={followed}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: `1px solid ${followed ? 'var(--sh-brand)' : 'var(--sh-border)'}`,
                        background: followed ? 'var(--sh-brand-soft)' : 'var(--sh-surface)',
                        color: 'var(--sh-text)',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: busyName === t.name ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span>{t.displayName || t.name}</span>
                      <span
                        aria-hidden
                        style={{
                          fontSize: 13,
                          color: followed ? 'var(--sh-brand)' : 'var(--sh-muted)',
                        }}
                      >
                        {followed ? '✓' : '+'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <form
          onSubmit={handleCustomAdd}
          style={{
            borderTop: '1px solid var(--sh-border)',
            padding: '12px 18px',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-muted)' }}>Custom:</span>
          <input
            value={customDraft}
            onChange={(e) => {
              setCustomDraft(e.target.value)
              setCustomError('')
            }}
            placeholder="machine_learning"
            maxLength={40}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--sh-input-border)',
              fontSize: 13,
              fontFamily: 'inherit',
              background: 'var(--sh-input-bg, var(--sh-surface))',
              color: 'var(--sh-text)',
            }}
          />
          <button
            type="submit"
            disabled={!customDraft.trim() || busyName === normalizeInput(customDraft)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--sh-brand)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              opacity: !customDraft.trim() ? 0.55 : 1,
            }}
          >
            Follow
          </button>
        </form>
        {customError ? (
          <div
            role="alert"
            style={{
              padding: '0 18px 12px',
              fontSize: 12,
              color: 'var(--sh-danger-text)',
            }}
          >
            {customError}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

function categoryChipStyle(active) {
  return {
    padding: '4px 10px',
    borderRadius: 999,
    border: `1px solid ${active ? 'var(--sh-brand)' : 'var(--sh-border)'}`,
    background: active ? 'var(--sh-brand-soft)' : 'var(--sh-surface)',
    color: 'var(--sh-text)',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
  }
}
