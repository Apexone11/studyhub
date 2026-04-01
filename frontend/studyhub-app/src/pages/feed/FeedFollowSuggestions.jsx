/**
 * FeedFollowSuggestions — "People to Follow" widget for the feed sidebar.
 *
 * Fetches from GET /api/users/me/follow-suggestions and renders a compact
 * card that fits the FeedAside layout. Shows up to 4 suggestions with
 * a one-click follow button and a "See All" link to the user's profile.
 */
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from './FeedWidgets'
import UserAvatar from '../../components/UserAvatar'
import useFetch from '../../lib/useFetch'
import { API } from '../../config'

export default function FeedFollowSuggestions() {
  const { data: suggestions, loading } = useFetch('/api/users/me/follow-suggestions', {
    initialData: [],
    transform: (data) => Array.isArray(data) ? data : []
  })
  const [followingSet, setFollowingSet] = useState(new Set())

  const handleFollow = useCallback(async (username) => {
    // Optimistic: show "Following" immediately.
    setFollowingSet((prev) => new Set([...prev, username]))
    try {
      const res = await fetch(`${API}/api/users/${encodeURIComponent(username)}/follow`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        // Rollback on server error.
        setFollowingSet((prev) => { const next = new Set(prev); next.delete(username); return next })
      }
    } catch {
      // Rollback on network error.
      setFollowingSet((prev) => { const next = new Set(prev); next.delete(username); return next })
    }
  }, [])

  if (loading || suggestions.length === 0) return null

  return (
    <Panel title="People to Follow" helper="Based on your courses">
      <div style={{ display: 'grid', gap: 8 }}>
        {suggestions.slice(0, 4).map((user) => {
          const isFollowed = followingSet.has(user.username)
          return (
            <div key={user.id} style={rowStyle}>
              <Link
                to={`/users/${user.username}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flex: 1, minWidth: 0 }}
              >
                <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={32} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.username}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
                    {user.reason === 'classmate'
                      ? `${user.sharedCourses} shared course${user.sharedCourses > 1 ? 's' : ''}`
                      : `${user.followerCount} follower${user.followerCount !== 1 ? 's' : ''}`}
                  </div>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => !isFollowed && handleFollow(user.username)}
                disabled={isFollowed}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 12px',
                  borderRadius: 7,
                  border: 'none',
                  fontFamily: 'inherit',
                  flexShrink: 0,
                  background: isFollowed ? 'var(--sh-soft)' : 'var(--sh-brand)',
                  color: isFollowed ? 'var(--sh-muted)' : 'var(--sh-surface)',
                  cursor: isFollowed ? 'default' : 'pointer',
                  transition: 'background .15s',
                }}
              >
                {isFollowed ? 'Following' : 'Follow'}
              </button>
            </div>
          )
        })}
      </div>
      {suggestions.length > 4 && (
        <Link
          to={`/users/${suggestions[0]?.username || ''}`}
          style={{ display: 'block', marginTop: 10, fontSize: 12, fontWeight: 700, color: 'var(--sh-brand)', textDecoration: 'none' }}
        >
          See more suggestions
        </Link>
      )}
    </Panel>
  )
}

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  borderRadius: 10,
  background: 'var(--sh-soft)',
  border: '1px solid var(--sh-border)',
}

