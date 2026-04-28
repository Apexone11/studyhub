// src/mobile/pages/MobileUserProfilePage.jsx
// Public user profile, viewed inside the mobile shell.
//
// Used when a non-self profile link is tapped — from search results, from
// a message thread participant, from the home feed, or from a deep link
// like `getstudyhub://user/alice`. Renders identity, stats, follow state,
// and a quick way back to the messages tab to start a DM.
//
// Self-profile (the user viewing their own page) routes to /m/profile
// instead, which has a different layout (settings, sign out, etc.).

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../../lib/session-context'
import { API } from '../../config'
import { resolveImageUrl } from '../../lib/imageUrls'
import MobileTopBar from '../components/MobileTopBar'

async function fetchProfileByUsername(username) {
  const res = await fetch(`${API}/api/users/${encodeURIComponent(username)}`, {
    credentials: 'include',
  })
  if (!res.ok) {
    const err = new Error(res.status === 404 ? 'not_found' : 'load_failed')
    err.status = res.status
    throw err
  }
  const data = await res.json()
  return data.user || data
}

async function postFollow(username, follow) {
  const res = await fetch(`${API}/api/users/${encodeURIComponent(username)}/follow`, {
    method: follow ? 'POST' : 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error('follow_failed')
  return res.json()
}

function formatNumber(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '0'
  if (n < 1000) return String(n)
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1)}m`
}

function StatCell({ label, value }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--sh-text)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--sh-text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

export default function MobileUserProfilePage() {
  const { username } = useParams()
  const navigate = useNavigate()
  const { user: currentUser } = useSession()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [followBusy, setFollowBusy] = useState(false)

  // If the user navigates to their own profile, redirect to the dedicated tab.
  useEffect(() => {
    if (currentUser?.username && username && currentUser.username === username) {
      navigate('/m/profile', { replace: true })
    }
  }, [currentUser, username, navigate])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchProfileByUsername(username)
      setProfile(data)
    } catch (err) {
      setError(err.status === 404 ? 'not_found' : 'load_failed')
    } finally {
      setLoading(false)
    }
  }, [username])

  useEffect(() => {
    if (!username) return
    load()
  }, [username, load])

  const handleFollowToggle = useCallback(async () => {
    if (!profile || followBusy) return
    setFollowBusy(true)
    const next = !profile.isFollowedByMe
    setProfile((prev) => (prev ? { ...prev, isFollowedByMe: next } : prev))
    try {
      const result = await postFollow(username, next)
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              isFollowedByMe: Boolean(result?.following),
              followRequested: Boolean(result?.requested),
              _count: {
                ...(prev._count || {}),
                followers:
                  typeof result?.followerCount === 'number'
                    ? result.followerCount
                    : prev._count?.followers,
              },
            }
          : prev,
      )
    } catch {
      setProfile((prev) => (prev ? { ...prev, isFollowedByMe: !next } : prev))
    } finally {
      setFollowBusy(false)
    }
  }, [profile, username, followBusy])

  const handleStartDm = useCallback(() => {
    if (!profile?.id) return
    navigate(`/m/messages?dm=${profile.id}`)
  }, [profile, navigate])

  if (loading) {
    return (
      <>
        <MobileTopBar title="Profile" />
        <div
          style={{ padding: '40px 20px', textAlign: 'center' }}
          aria-busy="true"
          role="status"
          aria-label="Loading profile"
        >
          <div className="mob-feed-spinner" style={{ margin: '0 auto' }} />
        </div>
      </>
    )
  }

  if (error === 'not_found') {
    return (
      <>
        <MobileTopBar title="Profile" />
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-text-muted)' }}>
          <h2 style={{ marginBottom: 8, color: 'var(--sh-text)' }}>User not found</h2>
          <p>We couldn&apos;t find an account with that username.</p>
          <button
            type="button"
            className="mob-auth-submit"
            onClick={() => navigate('/m/home')}
            style={{ marginTop: 20 }}
          >
            Back to home
          </button>
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <MobileTopBar title="Profile" />
        <div role="alert" style={{ padding: 24, textAlign: 'center', color: 'var(--sh-text)' }}>
          <p>Couldn&apos;t load this profile.</p>
          <button
            type="button"
            className="mob-auth-submit"
            onClick={load}
            style={{ marginTop: 16 }}
          >
            Try again
          </button>
        </div>
      </>
    )
  }

  if (!profile) return null

  const isPrivate = Boolean(profile.isPrivate)
  const avatarUrl = resolveImageUrl(profile.avatarUrl)
  const showFullStats = !isPrivate || profile.isFollowedByMe || profile.isOwnProfile

  let followLabel = 'Follow'
  if (profile.isFollowedByMe) followLabel = 'Following'
  else if (profile.followRequested) followLabel = 'Requested'

  return (
    <>
      <MobileTopBar title={profile.displayName || profile.username || 'Profile'} />

      <div style={{ padding: '16px 16px 80px' }}>
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '1px solid var(--sh-border)',
              }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'var(--sh-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
                fontWeight: 700,
                color: 'var(--sh-text-muted)',
              }}
            >
              {(profile.username || '?').charAt(0).toUpperCase()}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--sh-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {profile.displayName || profile.username}
            </h2>
            {profile.displayName && profile.username && (
              <div style={{ fontSize: 13, color: 'var(--sh-text-muted)', marginTop: 2 }}>
                @{profile.username}
              </div>
            )}
          </div>
        </div>

        {profile.bio && (
          <p
            style={{
              fontSize: 14,
              color: 'var(--sh-text)',
              marginBottom: 16,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}
          >
            {profile.bio}
          </p>
        )}

        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '12px 0',
            marginBottom: 16,
            borderTop: '1px solid var(--sh-border)',
            borderBottom: '1px solid var(--sh-border)',
          }}
        >
          {showFullStats ? (
            <>
              <StatCell label="Sheets" value={formatNumber(profile._count?.sheets ?? 0)} />
              <StatCell label="Followers" value={formatNumber(profile._count?.followers ?? 0)} />
              <StatCell label="Following" value={formatNumber(profile._count?.following ?? 0)} />
              <StatCell label="Stars" value={formatNumber(profile.totalStars ?? 0)} />
            </>
          ) : (
            <div
              style={{ flex: 1, textAlign: 'center', color: 'var(--sh-text-muted)', fontSize: 13 }}
            >
              This profile is private. Follow to see their activity.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handleFollowToggle}
            disabled={followBusy}
            className="mob-auth-submit"
            style={{
              flex: 1,
              background: profile.isFollowedByMe ? 'var(--sh-soft)' : 'var(--sh-brand)',
              color: profile.isFollowedByMe ? 'var(--sh-text)' : '#fff',
            }}
          >
            {followLabel}
          </button>
          <button
            type="button"
            onClick={handleStartDm}
            className="mob-auth-submit"
            style={{
              flex: 1,
              background: 'var(--sh-soft)',
              color: 'var(--sh-text)',
            }}
          >
            Message
          </button>
        </div>
      </div>
    </>
  )
}
