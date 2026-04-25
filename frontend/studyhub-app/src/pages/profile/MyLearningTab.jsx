import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../../config'

/**
 * MyLearningTab — Self-learner replacement for the Study tab.
 * See docs/internal/roles-and-permissions-plan.md §7.1. No course progress, no
 * class schedule — just the four things Self-learners actually need:
 *   - Current learning goal (editable)
 *   - Topics followed
 *   - Recently viewed
 *   - Their own published sheets
 */
export default function MyLearningTab({ profile, recentlyViewed = [] }) {
  const [goal, setGoal] = useState(null)
  const [topics, setTopics] = useState([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`${API}/api/users/me/learning-goal`, { credentials: 'include' }).then((r) =>
        r.ok ? r.json() : { goal: null },
      ),
      fetch(`${API}/api/hashtags/me`, { credentials: 'include' }).then((r) =>
        r.ok ? r.json() : { hashtags: [] },
      ),
    ])
      .then(([goalRes, tagsRes]) => {
        if (cancelled) return
        setGoal(goalRes?.goal || null)
        setTopics(Array.isArray(tagsRes?.hashtags) ? tagsRes.hashtags : [])
      })
      .catch(() => {
        /* non-fatal */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const cardStyle = {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 16,
    padding: 18,
    display: 'grid',
    gap: 10,
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={cardStyle} aria-label="Learning goal">
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--sh-heading)' }}>
          Current learning goal
        </h3>
        {goal?.goal ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-subtext)', lineHeight: 1.6 }}>
            {goal.goal}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-muted)' }}>
            No goal set. Set one from the home feed.
          </p>
        )}
      </section>

      <section style={cardStyle} aria-label="Topics I follow">
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--sh-heading)' }}>
          Topics I follow
        </h3>
        {topics.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-muted)' }}>
            Follow topics to personalise your feed.
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {topics.map((t) => (
              <Link
                key={t.id}
                to={`/feed?topic=${encodeURIComponent(t.name)}`}
                className="sh-chip"
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  borderRadius: 999,
                  background: 'var(--sh-soft)',
                  border: '1px solid var(--sh-border)',
                  textDecoration: 'none',
                  color: 'var(--sh-heading)',
                  fontWeight: 600,
                }}
              >
                #{t.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section style={cardStyle} aria-label="Recently viewed">
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--sh-heading)' }}>
          Recently viewed
        </h3>
        {recentlyViewed.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-muted)' }}>
            Sheets and notes you open will show up here.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            {recentlyViewed.slice(0, 5).map((entry) => (
              <li key={entry.id}>
                <Link
                  to={`/sheets/${entry.id}`}
                  style={{
                    display: 'block',
                    padding: '6px 8px',
                    borderRadius: 8,
                    background: 'var(--sh-soft)',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--sh-heading)',
                    textDecoration: 'none',
                  }}
                >
                  {entry.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={cardStyle} aria-label="Published by me">
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--sh-heading)' }}>
          Sheets I've published
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-subtext)' }}>
          {profile?.counts?.sheets ?? 0} sheet
          {(profile?.counts?.sheets ?? 0) === 1 ? '' : 's'}
          {typeof profile?.counts?.stars === 'number'
            ? ` · ${profile.counts.stars} star${profile.counts.stars === 1 ? '' : 's'} earned`
            : ''}
        </p>
      </section>
    </div>
  )
}
