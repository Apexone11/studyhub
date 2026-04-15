import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../../config'
import { useRolesV2Flags } from '../../lib/rolesV2Flags'

/**
 * Renders the Self-learner-only "TOPICS I FOLLOW" sidebar section.
 * Pulls follows from /api/hashtags/me with a one-shot fetch (cache via useFetch
 * is overkill here — the list rarely changes mid-session and a missed update
 * resolves on the next route mount). See docs/roles-and-permissions-plan.md §7.
 */
export default function SidebarTopics({ onNavClick }) {
  const { core: rolesV2Core } = useRolesV2Flags()
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!rolesV2Core) return undefined
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
  }, [rolesV2Core])

  if (!rolesV2Core) return null
  if (loading) return null

  return (
    <div className="sh-sidebar-section">
      <div className="sh-label" style={{ marginBottom: 8, paddingLeft: 2 }}>
        TOPICS I FOLLOW
      </div>
      {topics.length === 0 ? (
        <Link
          to="/feed"
          onClick={onNavClick}
          style={{
            fontSize: 'var(--type-xs)',
            color: 'var(--sh-brand)',
            padding: '4px 2px',
            textDecoration: 'none',
          }}
        >
          Pick topics on your feed &rarr;
        </Link>
      ) : (
        topics.slice(0, 8).map((t) => (
          <Link
            key={t.id}
            to={`/feed?topic=${encodeURIComponent(t.name)}`}
            onClick={onNavClick}
            style={{
              display: 'block',
              padding: '6px 2px',
              borderBottom: '1px solid var(--sh-border)',
              textDecoration: 'none',
              fontSize: 'var(--type-sm)',
              fontWeight: 600,
              color: 'var(--sh-text)',
            }}
          >
            #{t.name}
          </Link>
        ))
      )}
    </div>
  )
}
