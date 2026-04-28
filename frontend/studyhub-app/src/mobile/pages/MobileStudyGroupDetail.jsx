// src/mobile/pages/MobileStudyGroupDetail.jsx
// Study group detail — group info, member count, resources, sessions, join action.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import anime from '../lib/animeCompat'
import { API } from '../../config'
import { resolveImageUrl } from '../../lib/imageUrls'
import MobileTopBar from '../components/MobileTopBar'

const PREFERS_REDUCED =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* ── Fetch helpers ─────────────────────────────────────────────── */

async function fetchGroup(id) {
  const res = await fetch(`${API}/api/study-groups/${id}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load study group')
  return res.json()
}

async function joinGroup(id) {
  const res = await fetch(`${API}/api/study-groups/${id}/members`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Could not join')
  return res.json()
}

/* ── Stat pill ─────────────────────────────────────────────────── */

function StatPill({ label, value }) {
  return (
    <div className="mob-group-stat-pill">
      <span className="mob-group-stat-value">{value}</span>
      <span className="mob-group-stat-label">{label}</span>
    </div>
  )
}

/* ── Main component ────────────────────────────────────────────── */

export default function MobileStudyGroupDetail() {
  const { groupId } = useParams()
  const [group, setGroup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [joining, setJoining] = useState(false)

  const contentRef = useRef(null)

  useEffect(() => {
    let active = true
    fetchGroup(groupId)
      .then((data) => {
        if (active) setGroup(data.group || data)
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [groupId])

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

  const handleJoin = useCallback(async () => {
    if (joining) return
    setJoining(true)
    try {
      await joinGroup(groupId)
      setGroup((prev) =>
        prev ? { ...prev, isMember: true, memberCount: (prev.memberCount || 0) + 1 } : prev,
      )
    } catch {
      // ignore
    } finally {
      setJoining(false)
    }
  }, [groupId, joining])

  if (loading) {
    return (
      <>
        <MobileTopBar title="Study Group" showBack />
        <div className="mob-profile-skeleton">
          <div className="mob-profile-skeleton-avatar" />
          <div className="mob-profile-skeleton-name" />
          <div className="mob-profile-skeleton-bio" />
          <div className="mob-profile-skeleton-stats" />
        </div>
      </>
    )
  }

  if (error || !group) {
    return (
      <>
        <MobileTopBar title="Study Group" showBack />
        <div className="mob-feed-empty">
          <h3 className="mob-feed-empty-title">Group not found</h3>
          <p className="mob-feed-empty-text">{error || 'This group may have been removed.'}</p>
        </div>
      </>
    )
  }

  const initial = (group.name || '?').charAt(0).toUpperCase()
  const avatarUrl = resolveImageUrl(group.avatarUrl)

  return (
    <div className="mob-group">
      <MobileTopBar title="Study Group" showBack />

      <div ref={contentRef} className="mob-group-content">
        {/* Header card */}
        <div className="mob-profile-card">
          <div className="mob-profile-avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="mob-profile-avatar-img" />
            ) : (
              <div className="mob-profile-avatar-fallback">{initial}</div>
            )}
          </div>
          <h2 className="mob-profile-name">{group.name}</h2>
          {group.courseName && (
            <p className="mob-profile-username">{group.courseCode || group.courseName}</p>
          )}
          {group.description && <p className="mob-profile-bio">{group.description}</p>}

          {/* Stats */}
          <div className="mob-group-stats">
            <StatPill label="Members" value={group.memberCount || 0} />
            <StatPill label="Resources" value={group.resourceCount || 0} />
            <StatPill label="Sessions" value={group.upcomingSessionCount || 0} />
            <StatPill label="Discussions" value={group.discussionPostCount || 0} />
          </div>
        </div>

        {/* Join / Status */}
        {group.isMember ? (
          <div className="mob-group-member-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M20 6L9 17l-5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>You are a member ({group.userRole || 'member'})</span>
          </div>
        ) : (
          <button
            type="button"
            className="mob-group-join-btn"
            onClick={handleJoin}
            disabled={joining}
          >
            {joining
              ? 'Joining...'
              : group.privacy === 'private'
                ? 'Request to Join'
                : 'Join Group'}
          </button>
        )}

        {/* Info rows */}
        <div className="mob-profile-actions">
          {group.schoolName && (
            <div className="mob-profile-action" style={{ cursor: 'default' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M2 22h20M12 2L2 8l10 6 10-6-10-6zM6 11v5l6 3 6-3v-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{group.schoolName}</span>
            </div>
          )}
          <div className="mob-profile-action" style={{ cursor: 'default' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
              <path
                d="M2 20c0-2.5 2.5-4.5 7-4.5s7 2 7 4.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span>
              {group.availableSeats != null
                ? `${group.availableSeats} seats available`
                : `${group.maxMembers || 50} max members`}
            </span>
          </div>
          <div className="mob-profile-action" style={{ cursor: 'default' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect
                x="3"
                y="4"
                width="18"
                height="18"
                rx="2"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M16 2v4M8 2v4M3 10h18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span>
              Created{' '}
              {new Date(group.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
