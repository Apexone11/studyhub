/* ═══════════════════════════════════════════════════════════════════════════
 * UserProfilePage.jsx — Unified profile: public showcase + student cockpit
 *
 * Routes:  /users/:username?tab=overview|study|sheets|achievements
 *
 * Own profile tabs:   Overview | Study | Sheets | Achievements
 * Other profile tabs: Overview | Sheets | Achievements
 *
 * The Overview tab for own profile is the "Student Cockpit" — a two-column
 * layout merging former DashboardPage widgets with profile identity.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import ReportModal from '../../components/ReportModal'
import SafeJoyride from '../../components/SafeJoyride'
import { SkeletonProfile } from '../../components/Skeleton'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'
import { useTutorial } from '../../lib/useTutorial'
import { PROFILE_STEPS, TUTORIAL_VERSIONS } from '../../lib/tutorialSteps'
import { fadeInUp, staggerEntrance } from '../../lib/animations'
import { useRecentlyViewed } from '../../lib/useRecentlyViewed'
import { useAllStudyStatuses } from '../../lib/useStudyStatus'
import AvatarCropModal from '../../components/AvatarCropModal'
import ActivityHeatmap from '../../components/ActivityHeatmap'
import { showToast } from '../../lib/toast'
import { usePageTitle } from '../../lib/usePageTitle'
import { readJsonSafely } from '../../lib/http'
import VerificationBadge from '../../components/verification/VerificationBadge'

import {
  authHeaders, fmtDate, pageWrapStyle, containerStyle, cardStyle, sectionHeadingStyle,
  OWN_TABS, OTHER_TABS, DEFAULT_TAB, isValidTab,
} from './profileConstants'
import {
  ProfileAvatar,
  ProfileStatsRow,
  BadgesSection,
  PinnedSheetsSection,
  RecentSheetsSection,
  SharedNotesSection,
  StarredSheetsSection,
  EnrolledCoursesSection,
  FollowModal,
} from './ProfileWidgets'

/* Re-use dashboard widgets directly */
import {
  ResumeStudying,
  StudyQueue,
  QuickActions,
  StudyActivity,
  ActivationChecklist,
  RecentSheets as DashboardRecentSheets,
} from '../dashboard/DashboardWidgets'

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function UserProfilePage() {
  const { username } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user: currentUser, isAuthenticated, setSessionUser } = useSession()

  usePageTitle(username ? `${username}'s Profile` : 'Profile')

  const isOwnProfile = currentUser?.username === username

  /* ── Tab state (URL-driven) ────────────────────────────────────────── */
  const rawTab = searchParams.get('tab') || DEFAULT_TAB
  const activeTab = isValidTab(rawTab, isOwnProfile) ? rawTab : DEFAULT_TAB
  const tabs = isOwnProfile ? OWN_TABS : OTHER_TABS

  function setTab(key) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', key)
      return next
    }, { replace: true })
  }

  // If other-user visits with own-only tab, redirect to default
  useEffect(() => {
    if (!isOwnProfile && rawTab === 'study') {
      setTab(DEFAULT_TAB)
    }
  }, [isOwnProfile, rawTab]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Profile state ─────────────────────────────────────────────────── */
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [following, setFollowing] = useState(false)
  const [followers, setFollowers] = useState(0)
  const [toggling, setToggling] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [followModal, setFollowModal] = useState(null)
  const [followList, setFollowList] = useState([])
  const [followListLoading, setFollowListLoading] = useState(false)
  const [activityData, setActivityData] = useState([])
  const [badges, setBadges] = useState([])
  const [showAvatarCrop, setShowAvatarCrop] = useState(false)
  const [coverImgError, setCoverImgError] = useState(false)

  /* ── Dashboard state (own profile only) ────────────────────────────── */
  const [dashboardSummary, setDashboardSummary] = useState(null)
  const { recentlyViewed } = useRecentlyViewed()
  const { counts: studyQueueCounts, toReview: studyToReview, studying: studyStudying } = useAllStudyStatuses()

  const studyActivity = useMemo(() => {
    if (!recentlyViewed || recentlyViewed.length === 0) return null
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const thisWeek = recentlyViewed.filter((e) => new Date(e.viewedAt).getTime() > weekAgo)
    return { weeklyCount: thisWeek.length, lastStudied: recentlyViewed[0]?.viewedAt || null }
  }, [recentlyViewed])

  const dashboardRecentSheets = useMemo(() => dashboardSummary?.recentSheets || [], [dashboardSummary])

  /* ── Refs & animation ──────────────────────────────────────────────── */
  const tutorial = useTutorial('profile', PROFILE_STEPS, { version: TUTORIAL_VERSIONS.profile })
  const heroRef = useRef(null)
  const contentRef = useRef(null)
  const animatedRef = useRef(false)

  useEffect(() => {
    if (loading || !profile || animatedRef.current) return
    animatedRef.current = true
    if (heroRef.current) fadeInUp(heroRef.current, { duration: 400, y: 16 })
    if (contentRef.current) staggerEntrance(contentRef.current.children, { staggerMs: 80, duration: 450, y: 14 })
  }, [loading, profile])

  /* ── Load follow list ──────────────────────────────────────────────── */
  async function loadFollowList(type) {
    setFollowModal(type)
    setFollowListLoading(true)
    try {
      const res = await fetch(`${API}/api/users/${username}/${type}`, {
        headers: authHeaders(), credentials: 'include',
      })
      if (res.ok) setFollowList(await res.json())
    } catch { /* ignore */ }
    finally { setFollowListLoading(false) }
  }

  /* ── Load profile data ─────────────────────────────────────────────── */
  useEffect(() => {
    setLoading(true)
    setError(null)
    setCoverImgError(false)
    animatedRef.current = false
    fetch(`${API}/api/users/${username}`, { headers: authHeaders(), credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body.error || (r.status === 404 ? 'User not found.' : 'Could not load this profile. Please try again.'))
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

  /* ── Load activity + badges ────────────────────────────────────────── */
  useEffect(() => {
    if (!profile) return
    fetch(`${API}/api/users/${username}/activity?weeks=12`, { headers: authHeaders(), credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (Array.isArray(data)) setActivityData(data) })
      .catch(() => {})

    fetch(`${API}/api/users/${username}/badges`, { headers: authHeaders(), credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (Array.isArray(data)) setBadges(data) })
      .catch(() => {})
  }, [profile, username])

  /* ── Load dashboard summary (own profile only) ─────────────────────── */
  useEffect(() => {
    if (!isOwnProfile || !profile) return
    fetch(`${API}/api/dashboard/summary`, { headers: authHeaders(), credentials: 'include' })
      .then((r) => readJsonSafely(r, {}))
      .then((data) => setDashboardSummary(data))
      .catch(() => {})
  }, [isOwnProfile, profile])

  /* ── Follow toggle ─────────────────────────────────────────────────── */
  async function handleFollowToggle() {
    if (!isAuthenticated) { navigate('/login'); return }
    setToggling(true)
    try {
      const method = following ? 'DELETE' : 'POST'
      const res = await fetch(`${API}/api/users/${username}/follow`, {
        method, headers: authHeaders(), credentials: 'include',
      })
      const data = await res.json()
      if (res.ok) {
        setFollowing(data.following)
        setFollowers(data.followerCount)
        showToast(data.following ? `Following ${username}` : `Unfollowed ${username}`, 'success')
      } else {
        showToast(data.error || 'Could not update follow status.', 'error')
      }
    } catch { showToast('Check your connection and try again.', 'error') }
    finally { setToggling(false) }
  }

  /* ── Helpers ────────────────────────────────────────────────────────── */
  const initials = username ? username.slice(0, 2).toUpperCase() : '??'

  /* ── Loading ────────────────────────────────────────────────────────── */
  if (loading) return (
    <div style={pageWrapStyle}>
      <Navbar crumbs={[{ label: username, to: `/users/${username}` }]} hideTabs />
      <div style={containerStyle}><SkeletonProfile /></div>
    </div>
  )

  /* ── Error ──────────────────────────────────────────────────────────── */
  if (error) return (
    <div style={pageWrapStyle}>
      <Navbar crumbs={[{ label: 'Profile', to: '#' }]} hideTabs />
      <div style={containerStyle}>
        <div style={{ background: 'var(--sh-surface)', borderRadius: 18, border: '1px solid var(--sh-border)', padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 36, color: 'var(--sh-muted)', marginBottom: 14 }}>{/private|classmates/i.test(error) ? '🔒' : '👤'}</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--sh-heading)', marginBottom: 8 }}>
            {/private|classmates/i.test(error) ? 'Profile not available' : 'User not found'}
          </div>
          <div style={{ fontSize: 14, color: 'var(--sh-muted)', marginBottom: 20 }}>{error}</div>
          <Link to="/sheets" style={{ display: 'inline-flex', padding: '10px 22px', borderRadius: 10, background: 'var(--sh-brand)', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            Browse Sheets
          </Link>
        </div>
      </div>
    </div>
  )

  /* ═══════════════════════════════════════════════════════════════════════
   * MAIN PROFILE VIEW
   * ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div style={pageWrapStyle}>
      <Navbar crumbs={[{ label: profile.username, to: `/users/${username}` }]} hideTabs />

      <div style={containerStyle}>
        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <div ref={heroRef} style={{ borderRadius: 18, overflow: 'hidden', marginBottom: 20, border: '1px solid var(--sh-border)', boxShadow: 'var(--shadow-sm, 0 2px 10px rgba(15,23,42,0.05))' }}>
          {/* Cover image */}
          <div className="profile-hero" style={{
            background: (profile.coverImageUrl && !coverImgError)
              ? 'var(--sh-slate-900)'
              : 'linear-gradient(135deg, #1e3a5f, #2563eb)',
          }}>
            {profile.coverImageUrl && !coverImgError && (
              <img
                src={profile.coverImageUrl.startsWith('http') ? profile.coverImageUrl : `${API}${profile.coverImageUrl}`}
                alt=""
                onError={() => setCoverImgError(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            )}
            {/* Gradient overlay — always present for readability */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to top, rgba(15,23,42,0.85) 0%, rgba(15,23,42,0.4) 40%, rgba(15,23,42,0.1) 70%, transparent 100%)',
              pointerEvents: 'none',
            }} />

            {/* Hero content positioned at bottom */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: 'clamp(16px, 2vw, 28px) clamp(20px, 3vw, 32px)',
              display: 'flex', alignItems: 'flex-end', gap: 'clamp(14px, 2vw, 22px)',
              flexWrap: 'wrap',
            }}>
              {/* Avatar */}
              <div style={{ border: '3px solid var(--sh-surface)', borderRadius: '50%', lineHeight: 0, flexShrink: 0 }}>
                <ProfileAvatar
                  profile={profile}
                  initials={initials}
                  isOwnProfile={isOwnProfile}
                  onAvatarClick={() => setShowAvatarCrop(true)}
                />
              </div>

              {/* Identity */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <h1 style={{ margin: 0, fontSize: 'clamp(20px, 2.5vw, 26px)', fontWeight: 800, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {profile.username}
                    <VerificationBadge user={profile} size={18} />
                  </h1>
                  {profile.role === 'admin'
                    ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: 'rgba(245,158,11,0.25)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.4)' }}>Admin</span>
                    : <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.2)' }}>{profile.accountType === 'teacher' ? 'Teacher' : profile.accountType === 'other' ? 'Member' : 'Student'}</span>
                  }
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 10 }}>
                  Joined {fmtDate(profile.createdAt)}
                </div>

                {/* Follower / following stats */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, color: '#fff' }}>
                    <strong>{profile.sheetCount || 0}</strong>{' '}
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>sheets</span>
                  </span>
                  <button
                    onClick={() => loadFollowList('followers')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 14, color: '#fff' }}
                  >
                    <strong>{followers}</strong>{' '}
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>followers</span>
                  </button>
                  <button
                    onClick={() => loadFollowList('following')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 14, color: '#fff' }}
                  >
                    <strong>{profile.followingCount || 0}</strong>{' '}
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>following</span>
                  </button>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end', flexWrap: 'wrap' }}>
                {isOwnProfile ? (
                  <Link to="/settings" style={{
                    display: 'inline-flex', alignItems: 'center', padding: '8px 16px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.15)', color: '#fff', fontWeight: 700, fontSize: 13,
                    textDecoration: 'none', border: '1px solid rgba(255,255,255,0.25)',
                    backdropFilter: 'blur(6px)',
                  }}>
                    Edit Profile
                  </Link>
                ) : currentUser ? (
                  <button
                    onClick={handleFollowToggle}
                    disabled={toggling}
                    style={{
                      display: 'inline-flex', alignItems: 'center', padding: '8px 18px', borderRadius: 10,
                      fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
                      border: following ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(255,255,255,0.25)',
                      background: following ? 'rgba(16,185,129,0.2)' : 'var(--sh-brand)',
                      color: following ? '#6ee7b7' : '#fff',
                      cursor: toggling ? 'wait' : 'pointer',
                      backdropFilter: 'blur(6px)',
                    }}
                  >
                    {toggling ? '...' : following ? 'Following' : 'Follow'}
                  </button>
                ) : null}
                {currentUser && !isOwnProfile && (
                  <button
                    onClick={() => setReportOpen(true)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
                      fontWeight: 600, fontSize: 12, fontFamily: 'inherit',
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.7)',
                      cursor: 'pointer',
                      backdropFilter: 'blur(6px)',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                    Report
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Own profile: Hero CTA row ────────────────────────────────── */}
          {isOwnProfile && (
            <div style={{
              padding: '14px clamp(20px, 3vw, 32px)',
              background: 'var(--sh-surface)',
              borderTop: '1px solid var(--sh-border)',
            }}>
              <div className="profile-hero-ctas">
                <Link to="/sheets" className="sh-btn sh-btn--primary sh-btn--sm" style={{ gap: 6 }}>
                  Resume Studying
                </Link>
                <Link to="/sheets?starred=1" className="sh-btn sh-btn--secondary sh-btn--sm" style={{ gap: 6 }}>
                  Study Queue
                </Link>
                <Link to="/sheets/upload" className="sh-btn sh-btn--secondary sh-btn--sm" style={{ gap: 6 }}>
                  Upload Sheet
                </Link>
                <Link to="/settings" className="sh-btn sh-btn--secondary sh-btn--sm" style={{ gap: 6 }}>
                  Settings
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* ── TABS ──────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <div className="profile-tabs" role="tablist" aria-label="Profile sections">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`profile-tab-btn${activeTab === tab.key ? ' profile-tab-btn--active' : ''}`}
                onClick={() => setTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── TAB CONTENT ───────────────────────────────────────────────── */}
        <div ref={contentRef} role="tabpanel" aria-label={activeTab}>
          {activeTab === 'overview' && (
            isOwnProfile
              ? <OwnOverviewTab
                  profile={profile}
                  dashboardSummary={dashboardSummary}
                  recentlyViewed={recentlyViewed}
                  studyQueueCounts={studyQueueCounts}
                  studyToReview={studyToReview}
                  studyStudying={studyStudying}
                  dashboardRecentSheets={dashboardRecentSheets}
                  activityData={activityData}
                  badges={badges}
                  followers={followers}
                  loadFollowList={loadFollowList}
                />
              : <OtherOverviewTab
                  profile={profile}
                  activityData={activityData}
                  badges={badges}
                />
          )}

          {activeTab === 'study' && isOwnProfile && (
            <StudyTab
              recentlyViewed={recentlyViewed}
              studyActivity={studyActivity}
              studyQueueCounts={studyQueueCounts}
              studyToReview={studyToReview}
              studyStudying={studyStudying}
              dashboardRecentSheets={dashboardRecentSheets}
            />
          )}

          {activeTab === 'sheets' && (
            <SheetsTab
              profile={profile}
              isOwnProfile={isOwnProfile}
            />
          )}

          {activeTab === 'achievements' && (
            <AchievementsTab
              activityData={activityData}
              badges={badges}
            />
          )}
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

      {profile && <ReportModal open={reportOpen} targetType="user" targetId={profile.id} onClose={() => setReportOpen(false)} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * TAB CONTENT COMPONENTS
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ── Own profile Overview: "Student Cockpit" ─────────────────────────────── */
function OwnOverviewTab({
  profile, dashboardSummary, recentlyViewed,
  studyQueueCounts, studyToReview, studyStudying,
  dashboardRecentSheets, activityData, badges, followers, loadFollowList,
}) {
  return (
    <div className="profile-cockpit">
      {/* Left column: action / study */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ResumeStudying entries={recentlyViewed} />
        <StudyQueue counts={studyQueueCounts} toReview={studyToReview} studying={studyStudying} />
        <DashboardRecentSheets recentSheets={dashboardRecentSheets} />
        <QuickActions />
      </div>

      {/* Right column: identity / progress */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PinnedSheetsSection sheets={profile.pinnedSheets} />
        {activityData.length > 0 && (
          <div style={cardStyle}>
            <ActivityHeatmap data={activityData} weeks={12} />
          </div>
        )}
        <BadgesSection badges={badges} />
        {/* Followers / Following summary */}
        <div style={cardStyle}>
          <h2 style={{ ...sectionHeadingStyle, marginBottom: 12 }}>Community</h2>
          <div style={{ display: 'flex', gap: 16 }}>
            <button
              onClick={() => loadFollowList('followers')}
              style={{ flex: 1, background: 'var(--sh-soft)', border: '1px solid var(--sh-border)', borderRadius: 12, padding: '14px 12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}
            >
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--sh-heading)' }}>{followers}</div>
              <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>Followers</div>
            </button>
            <button
              onClick={() => loadFollowList('following')}
              style={{ flex: 1, background: 'var(--sh-soft)', border: '1px solid var(--sh-border)', borderRadius: 12, padding: '14px 12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}
            >
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--sh-heading)' }}>{profile.followingCount || 0}</div>
              <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>Following</div>
            </button>
          </div>
        </div>
        {dashboardSummary?.activation && (
          <ActivationChecklist activation={dashboardSummary.activation} />
        )}
      </div>
    </div>
  )
}

/* ── Own profile Study tab ───────────────────────────────────────────────── */
function StudyTab({
  recentlyViewed, studyActivity,
  studyQueueCounts, studyToReview, studyStudying, dashboardRecentSheets,
}) {
  return (
    <div className="profile-columns">
      <StudyActivity activity={studyActivity} />
      <ResumeStudying entries={recentlyViewed} />
      <StudyQueue counts={studyQueueCounts} toReview={studyToReview} studying={studyStudying} />
      <DashboardRecentSheets recentSheets={dashboardRecentSheets} />
      <QuickActions />
    </div>
  )
}

/* ── Sheets tab (both modes) ─────────────────────────────────────────────── */
function SheetsTab({ profile, isOwnProfile }) {
  return (
    <div className="profile-columns">
      <RecentSheetsSection sheets={profile.recentSheets} />
      <StarredSheetsSection sheets={profile.starredSheets} isOwnProfile={isOwnProfile} />
      <SharedNotesSection notes={profile.sharedNotes} />
    </div>
  )
}

/* ── Achievements tab (both modes) ───────────────────────────────────────── */
function AchievementsTab({ activityData, badges }) {
  return (
    <div className="profile-columns">
      {activityData.length > 0 && (
        <div style={cardStyle}>
          <ActivityHeatmap data={activityData} weeks={12} />
        </div>
      )}
      <BadgesSection badges={badges} />
      {activityData.length === 0 && badges.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏆</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 6 }}>No achievements yet</div>
          <div style={{ fontSize: 13, color: 'var(--sh-muted)' }}>Start studying and contributing to unlock badges.</div>
        </div>
      )}
    </div>
  )
}

/* ── Other user Overview: "Showcase" ─────────────────────────────────────── */
function OtherOverviewTab({ profile, activityData, badges }) {
  return (
    <div className="profile-columns">
      <PinnedSheetsSection sheets={profile.pinnedSheets} />
      <BadgesSection badges={badges} />
      {activityData.length > 0 && (
        <div style={cardStyle}>
          <ActivityHeatmap data={activityData} weeks={12} />
        </div>
      )}
      <RecentSheetsSection sheets={profile.recentSheets} />
      <EnrolledCoursesSection enrollments={profile.enrollments} />
    </div>
  )
}
