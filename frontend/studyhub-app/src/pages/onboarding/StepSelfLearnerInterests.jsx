/* ═══════════════════════════════════════════════════════════════════════════
 * StepSelfLearnerInterests -- Onboarding (track=self-learner): pick interests.
 *
 * 20 curated chips + free-text input. Requires at least 3.
 * Each selection becomes a HashtagFollow row on submit.
 * See docs/internal/roles-and-permissions-plan.md §5.1 step 2.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { forwardRef, useState } from 'react'
import { API } from '../../config'

const CURATED_INTERESTS = [
  'calculus',
  'web_dev',
  'spanish',
  'sat_prep',
  'physics',
  'creative_writing',
  'data_science',
  'history',
  'music_theory',
  'philosophy',
  'biology',
  'coding_interview_prep',
  'statistics',
  'marketing',
  'design',
  'psychology',
  'chemistry',
  'economics',
  'law',
  'linguistics',
]

const HASHTAG_REGEX = /^[a-z0-9_]{1,40}$/
const MIN_SELECTION = 3

function prettyLabel(name) {
  return name
    .split('_')
    .map((part) => (part.length <= 3 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(' ')
}

function normalize(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/\s+/g, '_')
}

const StepSelfLearnerInterests = forwardRef(function StepSelfLearnerInterests(
  { onNext, onSkip, submitting },
  ref,
) {
  const [selected, setSelected] = useState(new Set())
  const [custom, setCustom] = useState([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function toggle(name) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function addCustom() {
    const name = normalize(draft)
    if (!name || !HASHTAG_REGEX.test(name)) {
      setError('Topic must be 1-40 chars, letters/numbers/underscores only.')
      return
    }
    if (custom.includes(name) || selected.has(name)) {
      setDraft('')
      return
    }
    setCustom((prev) => [...prev, name])
    setSelected((prev) => new Set([...prev, name]))
    setDraft('')
    setError('')
  }

  const totalSelected = selected.size

  async function handleSubmit() {
    if (totalSelected < MIN_SELECTION) {
      setError(`Pick at least ${MIN_SELECTION} topics so we can fill your feed.`)
      return
    }
    setSaving(true)
    setError('')
    try {
      const names = Array.from(selected)
      const results = await Promise.allSettled(
        names.map((name) =>
          fetch(`${API}/api/hashtags/follow`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          }),
        ),
      )
      const failures = results.filter((r) => r.status === 'rejected' || !r.value?.ok).length
      if (failures === names.length) {
        setError('Could not save your topics. Check your connection and try again.')
        return
      }
      onNext({ tags: names })
    } finally {
      setSaving(false)
    }
  }

  const allChips = [...CURATED_INTERESTS, ...custom]

  return (
    <div style={styles.wrapper}>
      <h2 ref={ref} tabIndex={-1} style={styles.heading}>
        What do you want to learn?
      </h2>
      <p style={styles.subtext}>
        Pick at least {MIN_SELECTION}. We'll use these to fill your feed with relevant sheets,
        notes, and people.
      </p>

      <div style={styles.chipGrid} role="group" aria-label="Learning interests">
        {allChips.map((name) => {
          const isActive = selected.has(name)
          return (
            <button
              key={name}
              type="button"
              aria-pressed={isActive}
              onClick={() => toggle(name)}
              style={{
                ...styles.chip,
                background: isActive ? 'var(--sh-brand)' : 'var(--sh-soft)',
                color: isActive ? 'var(--sh-btn-primary-text)' : 'var(--sh-text)',
                borderColor: isActive ? 'var(--sh-brand)' : 'var(--sh-border)',
              }}
            >
              #{prettyLabel(name)}
            </button>
          )
        })}
      </div>

      <div style={styles.customRow}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCustom()
            }
          }}
          placeholder="Add another topic"
          aria-label="Custom topic"
          className="sh-input"
          style={styles.customInput}
        />
        <button type="button" onClick={addCustom} style={styles.customAddBtn}>
          Add
        </button>
      </div>

      {error ? (
        <p role="alert" style={styles.error}>
          {error}
        </p>
      ) : (
        <p style={styles.counter}>
          {totalSelected} of at least {MIN_SELECTION} selected.
        </p>
      )}

      <div style={styles.actions}>
        <button
          type="button"
          onClick={onSkip}
          disabled={submitting || saving}
          style={styles.skipLink}
        >
          Skip
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || saving || totalSelected < MIN_SELECTION}
          style={styles.primaryBtn}
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  )
})

export default StepSelfLearnerInterests

const styles = {
  wrapper: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' },
  heading: {
    fontSize: 'var(--type-xl)',
    fontWeight: 800,
    color: 'var(--sh-heading)',
    margin: 0,
    outline: 'none',
  },
  subtext: { fontSize: 'var(--type-sm)', color: 'var(--sh-subtext)', margin: 0, lineHeight: 1.5 },
  chipGrid: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 999,
    border: '1px solid var(--sh-border)',
    cursor: 'pointer',
  },
  customRow: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 },
  customInput: { flex: 1, fontSize: 13 },
  customAddBtn: {
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    background: 'var(--sh-soft)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-control)',
    cursor: 'pointer',
    color: 'var(--sh-text)',
  },
  error: { fontSize: 'var(--type-sm)', color: 'var(--sh-danger-text)', margin: 0 },
  counter: { fontSize: 'var(--type-xs)', color: 'var(--sh-muted)', margin: 0 },
  actions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  skipLink: {
    background: 'none',
    border: 'none',
    color: 'var(--sh-muted)',
    fontSize: 'var(--type-sm)',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  primaryBtn: {
    padding: '10px 24px',
    fontSize: 'var(--type-sm)',
    fontWeight: 700,
    color: 'var(--sh-btn-primary-text)',
    background: 'var(--sh-btn-primary-bg)',
    border: 'none',
    borderRadius: 'var(--radius-control)',
    cursor: 'pointer',
  },
}
