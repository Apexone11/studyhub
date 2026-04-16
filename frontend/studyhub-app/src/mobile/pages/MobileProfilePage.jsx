// src/mobile/pages/MobileProfilePage.jsx
// Profile tab — identity card, activity stats, quick actions, sign out.
// Fetches the current user's profile data and renders a mobile-first layout.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as _animeModule from 'animejs'
const anime = _animeModule.default || _animeModule
import { useSession } from '../../lib/session-context'
import { API } from '../../config'
import MobileTopBar from '../components/MobileTopBar'

const PREFERS_REDUCED =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* ── Fetch profile stats ───────────────────────────────────────── */

async function fetchProfileStats(userId) {
  const res = await fetch(`${API}/api/users/${userId}`, { credentials: 'include' })
  if (!res.ok) return null
  const data = await res.json()
  return data.user || data
}

/* ── Quick action links ────────────────────────────────────────── */

const QUICK_ACTIONS = [
  {
    key: 'sheets',
    label: 'My Sheets',
    path: '/sheets?mine=true',
    icon: (
      <path
        d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    key: 'starred',
    label: 'Starred',
    path: '/sheets?starred=true',
    icon: (
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    key: 'notes',
    label: 'My Notes',
    path: '/notes',
    icon: (
      <path
        d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    key: 'groups',
    label: 'Study Groups',
    path: '/study-groups',
    icon: (
      <>
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
        <path
          d="M2 20c0-2.5 2.5-4.5 7-4.5s7 2 7 4.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    key: 'settings',
    label: 'Settings',
    path: '/settings',
    icon: (
      <>
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
        <path
          d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
]

/* ── Main Profile page ─────────────────────────────────────────── */

export default function MobileProfilePage() {
  const { user, signOut } = useSession()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const hasUserId = Boolean(user?.id)
  const [loading, setLoading] = useState(hasUserId)
  const contentRef = useRef(null)

  useEffect(() => {
    if (!user?.id) return
    let active = true
    fetchProfileStats(user.id)
      .then((data) => {
        if (active) setProfile(data)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [user?.id])

  // Animate entrance
  useEffect(() => {
    if (loading || PREFERS_REDUCED || !contentRef.current) return
    anime({
      targets: contentRef.current.children,
      translateY: [16, 0],
      opacity: [0, 1],
      duration: 350,
      delay: anime.stagger(60),
      easing: 'easeOutCubic',
    })
  }, [loading])

  const handleSignOut = useCallback(async () => {
    await signOut()
    navigate('/m/landing', { replace: true })
  }, [signOut, navigate])

  const avatarUrl = profile?.avatarUrl || user?.avatarUrl
  const displayName = profile?.displayName || user?.displayName || user?.username || 'Student'
  const username = profile?.username || user?.username || ''
  const bio = profile?.bio || ''
  const sheetCount = profile?.sheetCount ?? profile?._count?.sheets ?? 0
  const starCount = profile?.totalStars ?? 0
  const followerCount = profile?.followerCount ?? profile?._count?.followers ?? 0
  const followingCount = profile?.followingCount ?? profile?._count?.following ?? 0

  return (
    <>
      <MobileTopBar title="Profile" />

      {loading ? (
        <div className="mob-profile-skeleton">
          <div className="mob-profile-skeleton-avatar" />
          <div className="mob-profile-skeleton-name" />
          <div className="mob-profile-skeleton-bio" />
          <div className="mob-profile-skeleton-stats" />
        </div>
      ) : (
        <div ref={contentRef} className="mob-profile">
          {/* Identity card */}
          <div className="mob-profile-card">
            <div className="mob-profile-avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="mob-profile-avatar-img" />
              ) : (
                <div className="mob-profile-avatar-fallback">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <h2 className="mob-profile-name">{displayName}</h2>
            {username && <p className="mob-profile-username">@{username}</p>}
            {bio && <p className="mob-profile-bio">{bio}</p>}

            {/* Stats row */}
            <div className="mob-profile-stats">
              <div className="mob-profile-stat">
                <span className="mob-profile-stat-num">{sheetCount}</span>
                <span className="mob-profile-stat-label">Sheets</span>
              </div>
              <div className="mob-profile-stat">
                <span className="mob-profile-stat-num">{starCount}</span>
                <span className="mob-profile-stat-label">Stars</span>
              </div>
              <div className="mob-profile-stat">
                <span className="mob-profile-stat-num">{followerCount}</span>
                <span className="mob-profile-stat-label">Followers</span>
              </div>
              <div className="mob-profile-stat">
                <span className="mob-profile-stat-num">{followingCount}</span>
                <span className="mob-profile-stat-label">Following</span>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="mob-profile-actions">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.key}
                type="button"
                className="mob-profile-action"
                onClick={() => navigate(action.path)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  {action.icon}
                </svg>
                <span>{action.label}</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className="mob-profile-action-chevron"
                >
                  <path
                    d="M9 18l6-6-6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ))}
          </div>

          {/* Sign out */}
          <button type="button" className="mob-profile-signout" onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      )}
    </>
  )
}
