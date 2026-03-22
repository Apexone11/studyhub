/* ═══════════════════════════════════════════════════════════════════════════
 * UserProfilePage.jsx — Public user profile with follow controls
 *
 * Layout (responsive):
 *   Desktop: Profile header + 2-column (Recent Sheets | Enrolled Courses)
 *   Phone:   Stacked single column, stats wrap, responsive avatar
 *
 * Uses the shared Navbar for navigation consistency across the app.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useRef } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import SafeJoyride from '../../components/SafeJoyride'
import { SkeletonProfile } from '../../components/Skeleton'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'
import { useTutorial } from '../../lib/useTutorial'
import { PROFILE_STEPS } from '../../lib/tutorialSteps'
import { fadeInUp, staggerEntrance } from '../../lib/animations'
import AvatarCropModal from '../../components/AvatarCropModal'
import { showToast } from '../../lib/toast'
import { usePageTitle } from '../../lib/usePageTitle'

import { authHeaders, fmtDate, pageWrapStyle, containerStyle } from './profileConstants'
import {
  ProfileAvatar,
  ProfileStatsRow,
  ProfileActionButtons,
  RecentSheetsSection,
  SharedNotesSection,
  StarredSheetsSection,
  EnrolledCoursesSection,
  FollowModal,
} from './ProfileWidgets'

export default function UserProfilePage() {
  const { username } = useParams()
  usePageTitle(username ? `${username}'s Profile` : 'Profile')
  const navigate = useNavigate()
  const { user: currentUser, isAuthenticated, setSessionUser } = useSession()

  /* ── State ───────────────────────────────────────────────────────────── */
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [following, setFollowing] = useState(false)
  const [followers, setFollowers] = useState(0)
  const [toggling, setToggling] = useState(false)
  const [followModal, setFollowModal] = useState(null) // 'followers' | 'following' | null
  const [followList, setFollowList] = useState([])
  const [followListLoading, setFollowListLoading] = useState(false)

  const isOwnProfile = currentUser?.username === username
  const [showAvatarCrop, setShowAvatarCrop] = useState(false)
  const tutorial = useTutorial('profile', PROFILE_STEPS)
  const profileCardRef = useRef(null)
  const columnsRef = useRef(null)
  const animatedRef = useRef(false)

  /* Animate profile on first data load */
  useEffect(() => {
    if (loading || !profile || animatedRef.current) return
    animatedRef.current = true
    if (profileCardRef.current) fadeInUp(profileCardRef.current, { duration: 400, y: 16 })
    if (columnsRef.current) staggerEntrance(columnsRef.current.children, { staggerMs: 80, duration: 450, y: 14 })
  }, [loading, profile])

  /* ── Load followers/following list ─────────────────────────────────── */
  async function loadFollowList(type) {
    setFollowModal(type)
    setFollowListLoading(true)
    try {
      const res = await fetch(`${API}/api/users/${username}/${type}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      if (res.ok) {
        setFollowList(await res.json())
      }
    } catch { /* ignore */ }
    finally { setFollowListLoading(false) }
  }

  /* ── Load profile data ───────────────────────────────────────────────── */
  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`${API}/api/users/${username}`, { headers: authHeaders(), credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body.error || (r.status === 404 ? 'This user does not exist.' : 'Could not load this profile.'))
        }
        return r.json()
      })
      .then((data) => {
        setProfile(data)
        setFollowing(data.isFollowing || false)
        setFollowers(data.followerCount || 0)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [username])

  /* ── Follow/Unfollow toggle ──────────────────────────────────────────── */
  async function handleFollowToggle() {
    if (!isAuthenticated) { navigate('/login'); return }
    setToggling(true)
    try {
      const method = following ? 'DELETE' : 'POST'
      const res = await fetch(`${API}/api/users/${username}/follow`, {
        method,
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok) {
        setFollowing(data.following)
        setFollowers(data.followerCount)
        showToast(data.following ? `Following ${username}` : `Unfollowed ${username}`, 'success')
      } else {
        showToast(data.error || 'Could not update follow status.', 'error')
      }
    } catch {
      showToast('Could not connect to the server.', 'error')
    }
    finally { setToggling(false) }
  }

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  const initials = username ? username.slice(0, 2).toUpperCase() : '??'

  /* ── Loading state ───────────────────────────────────────────────────── */
  if (loading) return (
    <div style={pageWrapStyle}>
      <Navbar crumbs={[{ label: username, to: `/users/${username}` }]} hideTabs />
      <div style={containerStyle}>
        <SkeletonProfile />
      </div>
    </div>
  )

  /* ── Error state ─────────────────────────────────────────────────────── */
  if (error) return (
    <div style={pageWrapStyle}>
      <Navbar crumbs={[{ label: 'Profile', to: '#' }]} hideTabs />
      <div style={containerStyle}>
        <div style={{ background: 'var(--sh-surface)', borderRadius: 18, border: '1px solid var(--sh-border)', padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 36, color: 'var(--sh-muted)', marginBottom: 14 }}>{/private|classmates/i.test(error) ? '🔒' : '👤'}</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--sh-heading)', marginBottom: 8 }}>
            {/private|classmates/i.test(error) ? 'Profile not available' : 'User not found'}
          </div>
          <div style={{ fontSize: 14, color: 'var(--sh-muted)', marginBottom: 20 }}>
            {error}
          </div>
          <Link to="/sheets" style={{ display: 'inline-flex', padding: '10px 22px', borderRadius: 10, background: 'var(--sh-brand)', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            Browse Sheets
          </Link>
        </div>
      </div>
    </div>
  )

  /* ── Main profile view ───────────────────────────────────────────────── */
  return (
    <div style={pageWrapStyle}>
      <Navbar crumbs={[{ label: profile.username, to: `/users/${username}` }]} hideTabs />

      <div style={containerStyle}>
        {/* ── Profile card ─────────────────────────────────────────────── */}
        <div ref={profileCardRef} style={{ background: 'var(--sh-surface)', borderRadius: 18, border: '1px solid var(--sh-border)', padding: 'clamp(20px, 3vw, 28px)', marginBottom: 20, boxShadow: 'var(--shadow-sm, 0 2px 10px rgba(15,23,42,0.05))' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'clamp(14px, 2vw, 20px)', flexWrap: 'wrap' }}>
            <ProfileAvatar
              profile={profile}
              initials={initials}
              isOwnProfile={isOwnProfile}
              onAvatarClick={() => setShowAvatarCrop(true)}
            />

            {/* Info column */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <h1 style={{ margin: 0, fontSize: 'clamp(18px, 2.5vw, 22px)', fontWeight: 800, color: 'var(--sh-heading)' }}>{profile.username}</h1>
                {profile.role === 'admin'
                  ? <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: 'var(--sh-warning-bg, #fef9ec)', color: 'var(--sh-warning-text, #92400e)', border: '1px solid var(--sh-warning-border, #fde68a)' }}>Admin</span>
                  : <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: 'var(--sh-pill-bg)', color: 'var(--sh-pill-text)', border: '1px solid var(--sh-brand-soft)' }}>Student</span>
                }
              </div>
              <div style={{ fontSize: 13, color: 'var(--sh-muted)', marginBottom: 16 }}>
                Joined {fmtDate(profile.createdAt)}
              </div>

              <ProfileStatsRow
                profile={profile}
                followers={followers}
                onLoadFollowList={loadFollowList}
              />
            </div>

            <ProfileActionButtons
              isOwnProfile={isOwnProfile}
              currentUser={currentUser}
              following={following}
              toggling={toggling}
              onFollowToggle={handleFollowToggle}
            />
          </div>
        </div>

        {/* ── Two-column content: sheets | courses ─────────────────────── */}
        <div ref={columnsRef} className="profile-columns">
          <RecentSheetsSection sheets={profile.recentSheets} />
          <SharedNotesSection notes={profile.sharedNotes} />
          <StarredSheetsSection sheets={profile.starredSheets} isOwnProfile={isOwnProfile} />
          <EnrolledCoursesSection enrollments={profile.enrollments} />
        </div>
      </div>

      <SafeJoyride {...tutorial.joyrideProps} />

      <FollowModal
        followModal={followModal}
        followList={followList}
        followListLoading={followListLoading}
        onClose={() => setFollowModal(null)}
      />

      {showAvatarCrop && (
        <AvatarCropModal
          onClose={() => setShowAvatarCrop(false)}
          onUploaded={(avatarUrl) => {
            setProfile((p) => ({ ...p, avatarUrl }))
            setSessionUser((u) => u ? { ...u, avatarUrl } : u)
          }}
        />
      )}
    </div>
  )
}
