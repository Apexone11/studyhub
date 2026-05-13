/* ═══════════════════════════════════════════════════════════════════════════
 * WelcomeToFeedPanel -- First-run empty-state panel for the feed.
 *
 * Shown when the feed has zero items because the new user hasn't followed
 * anyone yet. Fetches up to 5 follow suggestions from
 * GET /api/users/me/follow-suggestions (the same endpoint the sidebar
 * widget uses — verified) and renders them with one-click follow buttons
 * styled to match FeedFollowSuggestions.
 *
 * Falls back gracefully if the endpoint returns nothing: the panel still
 * renders the welcome copy with deep links to /sheets and /study-groups.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import useFetch from '../../lib/useFetch'
import { API } from '../../config'
import UserAvatar from '../../components/UserAvatar'

const MAX_SUGGESTIONS = 5

export default function WelcomeToFeedPanel() {
  const { data: suggestions, loading } = useFetch('/api/users/me/follow-suggestions', {
    initialData: [],
    transform: (data) => (Array.isArray(data) ? data.slice(0, MAX_SUGGESTIONS) : []),
    swr: 5 * 60 * 1000,
  })
  const [followingSet, setFollowingSet] = useState(() => new Set())

  const handleFollow = useCallback(async (username) => {
    setFollowingSet((prev) => new Set([...prev, username]))
    try {
      const res = await fetch(`${API}/api/users/${encodeURIComponent(username)}/follow`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        setFollowingSet((prev) => {
          const next = new Set(prev)
          next.delete(username)
          return next
        })
      }
    } catch {
      setFollowingSet((prev) => {
        const next = new Set(prev)
        next.delete(username)
        return next
      })
    }
  }, [])

  return (
    <section
      aria-labelledby="welcome-feed-heading"
      style={{
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-brand-border)',
        borderRadius: 16,
        padding: '20px 22px',
        boxShadow: '0 0 0 1px var(--sh-brand-soft, transparent)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
        <h2
          id="welcome-feed-heading"
          style={{
            margin: 0,
            fontSize: 17,
            fontWeight: 800,
            color: 'var(--sh-heading)',
          }}
        >
          Welcome to your feed
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--sh-subtext)',
            lineHeight: 1.55,
          }}
        >
          Follow a few classmates to start seeing study sheets, notes, and updates here.
        </p>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--sh-muted)', padding: '12px 0' }}>
          Loading people you might know…
        </div>
      ) : suggestions.length === 0 ? (
        <div
          style={{
            fontSize: 13,
            color: 'var(--sh-subtext)',
            background: 'var(--sh-soft)',
            border: '1px solid var(--sh-border)',
            padding: '12px 14px',
            borderRadius: 12,
            lineHeight: 1.55,
          }}
        >
          No suggestions for you just yet. Try browsing{' '}
          <Link to="/sheets" style={linkStyle}>
            study sheets
          </Link>{' '}
          or joining a{' '}
          <Link to="/study-groups" style={linkStyle}>
            study group
          </Link>{' '}
          to start filling your feed.
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gap: 8,
          }}
        >
          {suggestions.map((user) => {
            const isFollowed = followingSet.has(user.username)
            const sharedCourses = typeof user.sharedCourses === 'number' ? user.sharedCourses : null
            const followerCount =
              typeof user.followerCount === 'number' ? user.followerCount : user._count?.followers

            let subLabel = ''
            if (user.reason === 'classmate' && sharedCourses !== null) {
              subLabel = `${sharedCourses} shared course${sharedCourses === 1 ? '' : 's'}`
            } else if (typeof followerCount === 'number') {
              subLabel = `${followerCount} follower${followerCount === 1 ? '' : 's'}`
            } else if (user.displayName) {
              subLabel = user.displayName
            }

            return (
              <li key={user.id} style={rowStyle}>
                <Link
                  to={`/users/${user.username}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flex: 1,
                    minWidth: 0,
                    textDecoration: 'none',
                  }}
                >
                  <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={36} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--sh-heading)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {user.username}
                    </div>
                    {subLabel ? (
                      <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>{subLabel}</div>
                    ) : null}
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => !isFollowed && handleFollow(user.username)}
                  disabled={isFollowed}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: 'none',
                    fontFamily: 'inherit',
                    flexShrink: 0,
                    background: isFollowed ? 'var(--sh-soft)' : 'var(--sh-brand)',
                    color: isFollowed ? 'var(--sh-muted)' : 'var(--sh-btn-primary-text)',
                    cursor: isFollowed ? 'default' : 'pointer',
                    transition: 'background .15s',
                  }}
                >
                  {isFollowed ? 'Following' : 'Follow'}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div
        style={{
          display: 'flex',
          gap: 10,
          marginTop: 16,
          flexWrap: 'wrap',
        }}
      >
        <Link to="/sheets" style={pillLinkPrimary}>
          Browse study sheets
        </Link>
        <Link to="/study-groups" style={pillLinkSecondary}>
          Find study groups
        </Link>
      </div>
    </section>
  )
}

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  borderRadius: 12,
  background: 'var(--sh-soft)',
  border: '1px solid var(--sh-border)',
}

const linkStyle = {
  color: 'var(--sh-brand)',
  fontWeight: 600,
  textDecoration: 'none',
}

const pillLinkPrimary = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 16px',
  fontSize: 12,
  fontWeight: 700,
  borderRadius: 999,
  background: 'var(--sh-brand)',
  color: 'var(--sh-btn-primary-text)',
  textDecoration: 'none',
}

const pillLinkSecondary = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 16px',
  fontSize: 12,
  fontWeight: 700,
  borderRadius: 999,
  background: 'var(--sh-soft)',
  color: 'var(--sh-heading)',
  border: '1px solid var(--sh-border)',
  textDecoration: 'none',
}
