import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'

const MAX_GOAL_LENGTH = 500
const DISMISS_KEY = 'studyhub.feed.goal-triage.dismissed'

export default function GoalTriageCard() {
  const [goal, setGoal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    let cancelled = false
    fetch(`${API}/api/users/me/learning-goal`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { goal: null }))
      .then((data) => {
        if (cancelled) return
        setGoal(data.goal)
        setDraft(data.goal?.goal || '')
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSave = useCallback(async () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setError('Enter a goal or cancel.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/users/me/learning-goal`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not save goal.')
        return
      }
      setGoal(data.goal)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }, [draft])

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

  if (loading || dismissed) return null

  const hasGoal = Boolean(goal?.goal)

  return (
    <section
      style={{
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-brand)',
        borderRadius: 16,
        padding: '14px 18px',
        boxShadow: '0 0 0 1px var(--sh-brand-soft)',
        display: 'grid',
        gap: 10,
      }}
      aria-label="Learning goal"
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--sh-heading)' }}>
            {hasGoal ? 'Your learning goal' : 'What do you want to learn this week?'}
          </h2>
          {hasGoal && !editing ? (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sh-subtext)' }}>
              {goal.goal}
            </p>
          ) : null}
        </div>
        {hasGoal ? (
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss goal card"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--sh-muted)',
              fontSize: 18,
              cursor: 'pointer',
              padding: '0 2px',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        ) : null}
      </div>

      {editing || !hasGoal ? (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_GOAL_LENGTH))}
            rows={2}
            maxLength={MAX_GOAL_LENGTH}
            placeholder="e.g. Finish the Python async series by Friday"
            className="sh-input"
            style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
          />
          {error ? (
            <div style={{ fontSize: 12, color: 'var(--sh-danger-text)' }}>{error}</div>
          ) : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {hasGoal ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setDraft(goal?.goal || '')
                  setError('')
                }}
                disabled={saving}
                className="sh-button"
                style={{ fontSize: 12 }}
              >
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !draft.trim()}
              className="sh-button sh-button--primary"
              style={{ fontSize: 12 }}
            >
              {saving ? 'Saving…' : hasGoal ? 'Save' : 'Set goal'}
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="sh-button"
            style={{ fontSize: 12 }}
          >
            Edit goal
          </button>
        </div>
      )}
    </section>
  )
}
