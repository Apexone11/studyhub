import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'
import TopicPickerModal from './TopicPickerModal'

export default function InterestChipRow({ onSelect, activeTopic = null }) {
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
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

  const handleFollow = useCallback(async (name) => {
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
        const msg = data.error || 'Could not follow topic.'
        setError(msg)
        throw new Error(msg)
      }
      setTopics((prev) =>
        prev.find((t) => t.id === data.hashtag.id)
          ? prev
          : [{ ...data.hashtag, followedAt: new Date().toISOString() }, ...prev],
      )
    } catch (err) {
      // Always surface the real failure message — gating on the stale
      // `error` closure was masking later failures (the value captured
      // when the callback was created may already be cleared by an
      // earlier setError(''), so the "if (!error)" guard skipped the
      // setError call and left the user with no feedback).
      const msg = err?.message || 'Check your connection and try again.'
      setError(msg)
      throw err
    }
  }, [])

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

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '4px 12px',
          borderRadius: 999,
          border: '1px solid var(--sh-brand)',
          background: 'var(--sh-brand-soft)',
          color: 'var(--sh-brand-text, var(--sh-brand))',
          cursor: 'pointer',
        }}
      >
        + Add topic
      </button>

      {error ? (
        <span role="alert" style={{ fontSize: 11, color: 'var(--sh-danger-text)', width: '100%' }}>
          {error}
        </span>
      ) : null}

      <TopicPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        followedNames={topics.map((t) => t.name)}
        onFollow={handleFollow}
        onUnfollow={handleRemove}
      />
    </div>
  )
}
