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
import { isSelfLearner } from '../../lib/roleCopy'

export default function FeedFollowSuggestions({ accountType } = {}) {
  const { data: suggestions, loading } = useFetch('/api/users/me/follow-suggestions', {
    initialData: [],
    transform: (data) => (Array.isArray(data) ? data : []),
    swr: 5 * 60 * 1000,
  })
  const [followingSet, setFollowingSet] = useState(new Set())
  const [expanded, setExpanded] = useState(false)

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
        setFollowingSet((prev) => {
          const next = new Set(prev)
          next.delete(username)
          return next
        })
      }
    } catch {
      // Rollback on network error.
      setFollowingSet((prev) => {
        const next = new Set(prev)
        next.delete(username)
        return next
      })
    }
  }, [])

  if (loading || suggestions.length === 0) return null

  // Normalize the backend shape: `_count.followers` -> `followerCount`.
  // The backend returns Prisma's `_count` object directly; rendering the
  // string `"undefined followers"` when that's missing is the bug the
  // in-app label used to show.
  const visibleCount = expanded ? 8 : 4

  return (
    <Panel
      title="People to Follow"
      helper={isSelfLearner(accountType) ? 'Based on topics you follow' : 'Based on your courses'}
    >
      <div style={{ display: 'grid', gap: 8 }}>
        {suggestions.slice(0, visibleCount).map((user) => {
          const isFollowed = followingSet.has(user.username)
          const followerCount =
            typeof user.followerCount === 'number' ? user.followerCount : user._count?.followers
          const hasFollowerCount = typeof followerCount === 'number'
          const sharedCourses = typeof user.sharedCourses === 'number' ? user.sharedCourses : null

          let subLabel = ''
          if (user.reason === 'classmate' && sharedCourses !== null) {
            subLabel = `${sharedCourses} shared course${sharedCourses === 1 ? '' : 's'}`
          } else if (hasFollowerCount) {
            subLabel = `${followerCount} follower${followerCount === 1 ? '' : 's'}`
          } else if (user.displayName) {
            subLabel = user.displayName
          }

          return (
            <div key={user.id} style={rowStyle}>
              <Link
                to={`/users/${user.username}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textDecoration: 'none',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={32} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--sh-heading)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {user.username}
                  </div>
                  {subLabel && (
                    <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>{subLabel}</div>
                  )}
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
      {suggestions.length > visibleCount && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            display: 'block',
            marginTop: 10,
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--sh-brand)',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
          }}
        >
          See more suggestions
        </button>
      )}
      {expanded && suggestions.length > 4 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          style={{
            display: 'block',
            marginTop: 10,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--sh-muted)',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
          }}
        >
          Show fewer
        </button>
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
