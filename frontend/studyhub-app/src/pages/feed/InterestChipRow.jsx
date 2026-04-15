import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'

const HASHTAG_REGEX = /^[a-z0-9_]{1,40}$/

function normalizeInput(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
}

export default function InterestChipRow({ onSelect, activeTopic = null }) {
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`${API}/api/hashtags/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { hashtags: [] }))
      .then((data) => {
        if (cancelled) return
        setTopics(Array.isArray(data.hashtags) ? data.hashtags : [])
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleAdd = useCallback(async () => {
    const name = normalizeInput(draft)
    if (!name || !HASHTAG_REGEX.test(name)) {
      setError('Topic must be 1-40 chars, letters/numbers/underscores only.')
      return
    }
    setError('')
    try {
      const res = await fetch(`${API}/api/hashtags/follow`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not follow topic.')
        return
      }
      if (!topics.find((t) => t.id === data.hashtag.id)) {
        setTopics((prev) => [{ ...data.hashtag, followedAt: new Date().toISOString() }, ...prev])
      }
      setDraft('')
      setAdding(false)
    } catch {
      setError('Check your connection and try again.')
    }
  }, [draft, topics])

  const handleRemove = useCallback(
    async (name) => {
      const prev = topics
      setTopics((list) => list.filter((t) => t.name !== name))
      try {
        const res = await fetch(`${API}/api/hashtags/${encodeURIComponent(name)}/follow`, {
          method: 'DELETE',
          credentials: 'include',
        })
        if (!res.ok) setTopics(prev)
      } catch {
        setTopics(prev)
      }
    },
    [topics],
  )

  if (loading) return null

  return (
    <div
      aria-label="Your topics"
      style={{
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        borderRadius: 12,
        padding: '10px 12px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-muted)', marginRight: 2 }}>
        Topics:
      </span>
      {topics.length === 0 ? (
        <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
          Follow topics to personalise your feed.
        </span>
      ) : null}
      {topics.map((t) => (
        <span
          key={t.id}
          className="sh-chip"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            fontSize: 12,
            borderRadius: 999,
            background: activeTopic === t.name ? 'var(--sh-brand-soft)' : 'var(--sh-soft)',
            border: `1px solid ${activeTopic === t.name ? 'var(--sh-brand)' : 'var(--sh-border)'}`,
            cursor: onSelect ? 'pointer' : 'default',
          }}
        >
          <button
            type="button"
            onClick={() => onSelect && onSelect(activeTopic === t.name ? null : t.name)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--sh-heading)',
              cursor: 'pointer',
            }}
          >
            #{t.name}
          </button>
          <button
            type="button"
            aria-label={`Unfollow ${t.name}`}
            onClick={() => handleRemove(t.name)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--sh-muted)',
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
              padding: 0,
            }}
          >
            &times;
          </button>
        </span>
      ))}

      {adding ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAdd()
              } else if (e.key === 'Escape') {
                setAdding(false)
                setDraft('')
                setError('')
              }
            }}
            placeholder="topic"
            aria-label="New topic name"
            className="sh-input"
            autoFocus
            style={{ fontSize: 12, padding: '4px 8px', width: 120 }}
          />
          <button
            type="button"
            onClick={handleAdd}
            className="sh-button sh-button--primary"
            style={{ fontSize: 11, padding: '4px 10px' }}
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false)
              setDraft('')
              setError('')
            }}
            className="sh-button"
            style={{ fontSize: 11, padding: '4px 10px' }}
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="sh-button"
          style={{ fontSize: 11, padding: '4px 10px' }}
        >
          + Add topic
        </button>
      )}

      {error ? (
        <span role="alert" style={{ fontSize: 11, color: 'var(--sh-danger-text)', width: '100%' }}>
          {error}
        </span>
      ) : null}
    </div>
  )
}
