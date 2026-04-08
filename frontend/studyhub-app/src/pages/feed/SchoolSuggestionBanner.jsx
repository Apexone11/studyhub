import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../../config'

const DISMISS_KEY = 'sh_school_suggest_dismissed'
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

export default function SchoolSuggestionBanner({ user }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [school, setSchool] = useState(null)
  const [loaded, setLoaded] = useState(false)

  const email = user?.email || ''
  const hasEnrollments = (user?.enrollments?.length || 0) > 0
  const isEdu = email.split('@')[1]?.endsWith('.edu')
  const isOther = user?.accountType === 'other'

  useEffect(() => {
    if (dismissed || hasEnrollments || !isEdu || isOther) return
    let cancelled = false
    fetch(`${API}/api/courses/schools/suggest`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.school) setSchool(data.school)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [dismissed, hasEnrollments, isEdu, isOther])

  if (dismissed || hasEnrollments || !isEdu || isOther || !loaded || !school) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

  return (
    <div
      style={{
        background: 'var(--sh-info-bg)',
        border: '1px solid var(--sh-info-border)',
        borderRadius: 14,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontFamily: FONT,
      }}
    >
      {school.logoUrl ? (
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            flexShrink: 0,
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
          }}
        >
          <img
            src={`${API}${school.logoUrl}`}
            alt={school.short}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }}
            onError={(e) => {
              e.target.style.display = 'none'
            }}
          />
        </div>
      ) : (
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            flexShrink: 0,
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 11,
            fontWeight: 800,
            color: 'var(--sh-brand)',
          }}
        >
          {(school.short || '??').slice(0, 3)}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-slate-900)' }}>
          Are you at {school.name}?
        </div>
        <div style={{ fontSize: 12, color: 'var(--sh-slate-500)', marginTop: 2 }}>
          We matched your email to this school. Set it up to see relevant courses and sheets.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <Link
          to="/my-courses"
          style={{
            padding: '7px 14px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            background: 'var(--sh-brand)',
            color: '#fff',
            textDecoration: 'none',
          }}
        >
          Set Up
        </Link>
        <button
          type="button"
          onClick={dismiss}
          style={{
            padding: '7px 14px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            border: '1px solid var(--sh-border)',
            background: 'transparent',
            color: 'var(--sh-slate-500)',
            cursor: 'pointer',
            fontFamily: FONT,
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
