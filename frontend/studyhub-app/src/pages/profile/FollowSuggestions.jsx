/**
 * FollowSuggestions — "People you may know" widget for own profile.
 *
 * Track B2: Follow System Improvements — Cycle B: Social & Discovery.
 *
 * Fetches from GET /api/users/me/follow-suggestions.
 * Shows classmates first, then popular users as backfill.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FONT, cardStyle, sectionHeadingStyle } from './profileConstants'
import UserAvatar from '../../components/UserAvatar'
import { API } from '../../config'

export default function FollowSuggestions() {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [followingSet, setFollowingSet] = useState(new Set())

  useEffect(() => {
    fetch(`${API}/api/users/me/follow-suggestions`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setSuggestions(data || []))
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false))
  }, [])

  const handleFollow = useCallback(async (username) => {
    try {
      const res = await fetch(`${API}/api/users/${encodeURIComponent(username)}/follow`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        setFollowingSet((prev) => new Set([...prev, username]))
      }
    } catch {
      /* ignore */
    }
  }, [])

  if (loading || suggestions.length === 0) return null

  // `GET /api/users/me/follow-suggestions` returns Prisma's `_count` object
  // directly rather than flat `followerCount` / `sheetCount`, and it does
  // not populate `reason` / `sharedCourses`. Normalize the shape here so
  // the widget doesn't render "undefined follower(s)" or "undefined
  // shared course(s)" — the production bug that this block is fixing.
  return (
    <div style={cardStyle}>
      <h3 style={sectionHeadingStyle}>People You May Know</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {suggestions.slice(0, 6).map((user) => {
          const isFollowed = followingSet.has(user.username)
          const followerCount =
            typeof user.followerCount === 'number' ? user.followerCount : user._count?.followers
          const sheetCount =
            typeof user.sheetCount === 'number' ? user.sheetCount : user._count?.studySheets
          const sharedCourses = typeof user.sharedCourses === 'number' ? user.sharedCourses : null

          let primaryLabel = ''
          if (user.reason === 'classmate' && sharedCourses !== null) {
            primaryLabel = `${sharedCourses} shared course${sharedCourses === 1 ? '' : 's'}`
          } else if (typeof followerCount === 'number') {
            primaryLabel = `${followerCount} follower${followerCount === 1 ? '' : 's'}`
          } else if (user.displayName) {
            primaryLabel = user.displayName
          }

          const sheetSuffix =
            typeof sheetCount === 'number' && sheetCount > 0
              ? ` · ${sheetCount} sheet${sheetCount === 1 ? '' : 's'}`
              : ''

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
                <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={36} />
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
                  {(primaryLabel || sheetSuffix) && (
                    <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
                      {primaryLabel}
                      {sheetSuffix}
                    </div>
                  )}
                </div>
              </Link>
              <button
                type="button"
                onClick={() => !isFollowed && handleFollow(user.username)}
                disabled={isFollowed}
                style={{
                  ...followBtnStyle,
                  background: isFollowed ? 'var(--sh-soft)' : 'var(--sh-brand)',
                  color: isFollowed ? 'var(--sh-muted)' : '#fff',
                  cursor: isFollowed ? 'default' : 'pointer',
                }}
              >
                {isFollowed ? 'Following' : 'Follow'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  borderRadius: 12,
  background: 'var(--sh-bg)',
  transition: 'background .15s',
}

const followBtnStyle = {
  fontSize: 12,
  fontWeight: 700,
  padding: '5px 14px',
  borderRadius: 8,
  border: 'none',
  fontFamily: FONT,
  flexShrink: 0,
  transition: 'background .15s',
}
