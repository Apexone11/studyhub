/* ════════════════════════════════════════════════════════════════════════
 * GoalsCard.jsx — Multi-goal widget on UserProfilePage Overview tab
 *
 * Replaces the old single-goal "What do you want to learn this week?"
 * card on the Feed. Allows the profile owner to add up to 10 active
 * goals and remove any of them. Read-only for other viewers (the goal
 * list is visible to anyone who can see the profile).
 *
 * Backend contract:
 *   GET    /api/users/me/goals
 *   POST   /api/users/me/goals    body: { goal }
 *   DELETE /api/users/me/goals/:goalId
 * ════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { showToast } from '../../lib/toast'

const MAX_GOALS = 10
const MAX_GOAL_LENGTH = 500

export default function GoalsCard({ isOwnProfile }) {
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOwnProfile) {
      // Other-viewer read uses a different endpoint shape on /users/:username,
      // not exposed here yet — keep this card owner-only for now.
      setLoading(false)
      return
    }
    let cancelled = false
    fetch(`${API}/api/users/me/goals`, { credentials: 'include', headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { goals: [] }))
      .then((data) => {
        if (cancelled) return
        setGoals(Array.isArray(data?.goals) ? data.goals : [])
      })
      .catch(() => {
        if (!cancelled) setError('Could not load goals.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOwnProfile])

  if (!isOwnProfile) return null

  async function handleAdd(event) {
    event.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) return
    if (trimmed.length > MAX_GOAL_LENGTH) {
      setError(`Goals can be up to ${MAX_GOAL_LENGTH} characters.`)
      return
    }
    if (goals.length >= MAX_GOALS) {
      setError(`You can have up to ${MAX_GOALS} active goals at once.`)
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/users/me/goals`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not save goal.')
        return
      }
      setGoals((prev) => [data.goal, ...prev])
      setDraft('')
      showToast('Goal added.', 'success')
    } catch {
      setError('Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(goalId) {
    setError('')
    try {
      const res = await fetch(`${API}/api/users/me/goals/${goalId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Could not remove goal.')
        return
      }
      setGoals((prev) => prev.filter((g) => g.id !== goalId))
    } catch {
      setError('Check your connection and try again.')
    }
  }

  return (
    <section
      style={{
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        borderRadius: 14,
        padding: '18px 20px',
      }}
      aria-label="Learning goals"
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--sh-heading)' }}>
          Learning goals
        </h2>
        <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
          {goals.length} / {MAX_GOALS}
        </span>
      </header>
      <p style={{ margin: '6px 0 14px', fontSize: 12, color: 'var(--sh-muted)', lineHeight: 1.6 }}>
        Track what you&rsquo;re working toward. Add up to {MAX_GOALS} goals and remove them when
        they no longer apply.
      </p>

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setError('')
          }}
          maxLength={MAX_GOAL_LENGTH}
          placeholder="Finish CSCI 110 final project by Friday"
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--sh-input-border)',
            background: 'var(--sh-input-bg, var(--sh-surface))',
            color: 'var(--sh-text)',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
          disabled={saving || goals.length >= MAX_GOALS}
        />
        <button
          type="submit"
          disabled={saving || !draft.trim() || goals.length >= MAX_GOALS}
          style={{
            padding: '10px 16px',
            borderRadius: 10,
            border: 'none',
            background: 'var(--sh-brand)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving || !draft.trim() || goals.length >= MAX_GOALS ? 0.55 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Add'}
        </button>
      </form>

      {error ? (
        <div
          role="alert"
          style={{
            background: 'var(--sh-danger-bg)',
            color: 'var(--sh-danger-text)',
            border: '1px solid var(--sh-danger-border)',
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 12,
            marginBottom: 10,
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>Loading…</div>
      ) : goals.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--sh-muted)', lineHeight: 1.6 }}>
          No goals yet. Add the first thing you want to finish this week.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {goals.map((g) => (
            <li
              key={g.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--sh-border)',
                background: 'var(--sh-soft)',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--sh-text)', lineHeight: 1.55, flex: 1 }}>
                {g.goal}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(g.id)}
                aria-label={`Remove goal: ${g.goal}`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--sh-muted)',
                  fontSize: 13,
                  cursor: 'pointer',
                  padding: '2px 6px',
                  borderRadius: 6,
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
