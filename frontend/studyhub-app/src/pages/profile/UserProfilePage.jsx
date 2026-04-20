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
import { IconShield, IconProfile, IconStar } from '../../components/Icons'
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
import { roleLabel } from '../../lib/roleLabel'
import { isSelfLearner } from '../../lib/roleCopy'
import MyLearningTab from './MyLearningTab'
import ProfileBadges from '../../components/ProfileBadges'
import VerificationBadge from '../../components/verification/VerificationBadge'
import ProBadge from '../../components/ProBadge'
import DonorBadge from '../../components/DonorBadge'

import {
  authHeaders,
  fmtDate,
  pageWrapStyle,
  containerStyle,
  cardStyle,
  sectionHeadingStyle,
  tabsForProfile,
  DEFAULT_TAB,
  isValidTab,
} from './profileConstants'
import {
  ProfileAvatar,
  ProfileStatsRow,
  BadgesSection,
  PinnedSheetsSection,
  RecentSheetsSection,
  SharedNotesSection,
  SharedShelvesSection,
  StarredSheetsSection,
  EnrolledCoursesSection,
  FollowModal,
} from './ProfileWidgets'

/* Re-use dashboard widgets directly */
import {
  ResumeStudying,
  StudyNudges,
  StudyQueue,
  QuickActions,
  StudyActivity,
  ActivationChecklist,
  RecentSheets as DashboardRecentSheets,
} from '../dashboard/DashboardWidgets'
import ProfileStatsWidget from './ProfileStatsWidget'
import FollowSuggestions from './FollowSuggestions'
import FeedCard from '../feed/FeedCard'
import FollowRequestsList from './FollowRequestsList'
import TopContributors from '../../components/TopContributors'
import UpcomingExamsCard from '../../features/exams/UpcomingExamsCard'
import { useDesignV2Flags } from '../../lib/designV2Flags'

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
  const viewerAccountType = currentUser?.accountType
  const activeTab = isValidTab(rawTab, isOwnProfile, viewerAccountType) ? rawTab : DEFAULT_TAB
  const tabs = tabsForProfile({ isOwn: isOwnProfile, accountType: viewerAccountType })

  function setTab(key) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', key)
        return next
      },
      { replace: true },
    )
  }

  // If other-user visits with own-only tab, redirect to default.
  useEffect(() => {
    if (!isOwnProfile && (rawTab === 'study' || rawTab === 'learning')) {
      setTab(DEFAULT_TAB)
    }
  }, [isOwnProfile, rawTab]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Profile state ─────────────────────────────────────────────────── */
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [following, setFollowing] = useState(false)
  const [followStatus, setFollowStatus] = useState(null) // 'active' | 'pending' | null
  const [followers, setFollowers] = useState(0)
  const [toggling, setToggling] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [isBlocked, setIsBlocked] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [blockToggling, setBlockToggling] = useState(false)
  const [muteToggling, setMuteToggling] = useState(false)
  const [followModal, setFollowModal] = useState(null)
  const [followList, setFollowList] = useState([])
  const [followListLoading, setFollowListLoading] = useState(false)
  const [activityData, setActivityData] = useState([])
  const [badges, setBadges] = useState([])
  const [showAvatarCrop, setShowAvatarCrop] = useState(false)
  const [coverImgError, setCoverImgError] = useState(false)

  /* ── Dashboard state (own profile only) ────────────────────────────── */
  const [dashboardSummary, setDashboardSummary] = useState(null)
  const [topContributors, setTopContributors] = useState([])
  const [topContributorsLoading, setTopContributorsLoading] = useState(false)
  const v2Flags = useDesignV2Flags()
  const phase1On = v2Flags.phase1Dashboard
  const upcomingExamsOn = v2Flags.upcomingExams
  const { recentlyViewed } = useRecentlyViewed()
  const {
    statuses: allStudyStatuses,
    counts: studyQueueCounts,
    toReview: studyToReview,
    studying: studyStudying,
    done: studyDone,
  } = useAllStudyStatuses()

  // Derive a sheetId -> status string map for profile sheet cards
  const profileStudyStatusMap = useMemo(() => {
    const map = {}
    for (const [id, entry] of Object.entries(allStudyStatuses || {})) {
      map[id] = entry.status || entry
    }
    return map
  }, [allStudyStatuses])

  const studyActivity = useMemo(() => {
    if (!recentlyViewed || recentlyViewed.length === 0) return null
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const thisWeek = recentlyViewed.filter((e) => new Date(e.viewedAt).getTime() > weekAgo)
    return { weeklyCount: thisWeek.length, lastStudied: recentlyViewed[0]?.viewedAt || null }
  }, [recentlyViewed])

  const dashboardRecentSheets = useMemo(
    () => dashboardSummary?.recentSheets || [],
    [dashboardSummary],
  )

  /* ── Refs & animation ──────────────────────────────────────────────── */
  const tutorial = useTutorial('profile', PROFILE_STEPS, { version: TUTORIAL_VERSIONS.profile })
  const heroRef = useRef(null)
  const contentRef = useRef(null)
  const animatedRef = useRef(false)

  useEffect(() => {
    if (loading || !profile || animatedRef.current) return
    animatedRef.current = true
    if (heroRef.current) fadeInUp(heroRef.current, { duration: 400, y: 16 })
    if (contentRef.current)
      staggerEntrance(contentRef.current.children, { staggerMs: 80, duration: 450, y: 14 })
  }, [loading, profile])

  /* ── Load follow list ──────────────────────────────────────────────── */
  async function loadFollowList(type) {
    setFollowModal(type)
    setFollowListLoading(true)
    try {
      const res = await fetch(`${API}/api/users/${username}/${type}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      if (res.ok) setFollowList(await res.json())
    } catch {
      /* ignore */
    } finally {
      setFollowListLoading(false)
    }
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
          throw new Error(
            body.error ||
              (r.status === 404
                ? 'User not found.'
                : 'Could not load this profile. Please try again.'),
          )
        }
        return r.json()
      })
      .then((data) => {
        setProfile(data)
        setFollowing(data.isFollowing || data.followStatus === 'active' || false)
        setFollowStatus(data.followStatus || null)
        setFollowers(data.followerCount || 0)
        setIsBlocked(data.isBlocked || false)
        setIsMuted(data.isMuted || false)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [username])

  /* ── Load activity + badges ────────────────────────────────────────── */
  useEffect(() => {
    if (!profile) return
    fetch(`${API}/api/users/${username}/activity?weeks=12`, {
      headers: authHeaders(),
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setActivityData(data)
      })
      .catch(() => {})

    fetch(`${API}/api/users/${username}/badges`, { headers: authHeaders(), credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setBadges(data)
      })
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

  /* ── Phase 1: top contributors mini-widget (own profile only) ──────── */
  useEffect(() => {
    if (!isOwnProfile || !profile || !phase1On) return
    let cancelled = false
    setTopContributorsLoading(true)
    fetch(`${API}/api/sheets/leaderboard?type=contributors`, {
      headers: authHeaders(),
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : []
        // Map backend shape { username, avatarUrl, count } into the widget's prop shape.
        setTopContributors(
          list.map((c) => ({
            username: c.username,
            displayName: c.displayName || c.username,
            avatarUrl: c.avatarUrl || null,
            contributionCount: typeof c.count === 'number' ? c.count : c.contributionCount,
          })),
        )
      })
      .catch(() => {
        if (!cancelled) setTopContributors([])
      })
      .finally(() => {
        if (!cancelled) setTopContributorsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOwnProfile, profile, phase1On])

  /* ── Follow toggle ─────────────────────────────────────────────────── */
  async function handleFollowToggle() {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    // If pending, clicking again should cancel (unfollow)
    const isUnfollow = following || followStatus === 'pending'
    setToggling(true)
    try {
      const method = isUnfollow ? 'DELETE' : 'POST'
      const res = await fetch(`${API}/api/users/${username}/follow`, {
        method,
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok) {
        if (data.requested) {
          // Follow request sent to a private account
          setFollowing(false)
          setFollowStatus('pending')
          showToast(`Follow request sent to ${username}`, 'success')
        } else {
          setFollowing(data.following)
          setFollowStatus(data.following ? 'active' : null)
          if (data.followerCount != null) setFollowers(data.followerCount)
          showToast(data.following ? `Following ${username}` : `Unfollowed ${username}`, 'success')
        }
      } else {
        showToast(data.error || 'Could not update follow status.', 'error')
      }
    } catch {
      showToast('Check your connection and try again.', 'error')
    } finally {
      setToggling(false)
    }
  }

  /* ── Block toggle ───────────────────────────────────────────────────── */
  async function handleBlockToggle() {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    setBlockToggling(true)
    try {
      const method = isBlocked ? 'DELETE' : 'POST'
      const res = await fetch(`${API}/api/users/${username}/block`, {
        method,
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok) {
        setIsBlocked(data.blocked)
        if (data.blocked) {
          setFollowing(false)
          setFollowStatus(null)
          showToast(`Blocked ${username}`, 'success')
        } else {
          showToast(`Unblocked ${username}`, 'success')
        }
      } else {
        showToast(data.error || 'Could not update block status.', 'error')
      }
    } catch {
      showToast('Check your connection and try again.', 'error')
    } finally {
      setBlockToggling(false)
    }
  }

  /* ── Mute toggle ───────────────────────────────────────────────────── */
  async function handleMuteToggle() {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    setMuteToggling(true)
    try {
      const method = isMuted ? 'DELETE' : 'POST'
      const res = await fetch(`${API}/api/users/${username}/mute`, {
        method,
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok) {
        setIsMuted(data.muted)
        showToast(data.muted ? `Muted ${username}` : `Unmuted ${username}`, 'success')
      } else {
        showToast(data.error || 'Could not update mute status.', 'error')
      }
    } catch {
      showToast('Check your connection and try again.', 'error')
    } finally {
      setMuteToggling(false)
    }
  }

  /* ── Helpers ────────────────────────────────────────────────────────── */
  const initials = username ? username.slice(0, 2).toUpperCase() : '??'

  /* ── Loading ────────────────────────────────────────────────────────── */
  if (loading)
    return (
      <div style={pageWrapStyle}>
        <Navbar crumbs={[{ label: username, to: `/users/${username}` }]} hideTabs />
        <div style={containerStyle}>
          <SkeletonProfile />
        </div>
      </div>
    )

  /* ── Error ──────────────────────────────────────────────────────────── */
  if (error)
    return (
      <div style={pageWrapStyle}>
        <Navbar crumbs={[{ label: 'Profile', to: '#' }]} hideTabs />
        <div style={containerStyle}>
          <div
            style={{
              background: 'var(--sh-surface)',
              borderRadius: 18,
              border: '1px solid var(--sh-border)',
              padding: 48,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 36, color: 'var(--sh-muted)', marginBottom: 14 }}>
              {/private|classmates/i.test(error) ? (
                <IconShield size={36} />
              ) : (
                <IconProfile size={36} />
              )}
            </div>
            <div
              style={{ fontWeight: 700, fontSize: 18, color: 'var(--sh-heading)', marginBottom: 8 }}
            >
              {/private|classmates/i.test(error) ? 'Profile not available' : 'User not found'}
            </div>
            <div style={{ fontSize: 14, color: 'var(--sh-muted)', marginBottom: 20 }}>{error}</div>
            <Link
              to="/sheets"
              style={{
                display: 'inline-flex',
                padding: '10px 22px',
                borderRadius: 10,
                background: 'var(--sh-brand)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 14,
                textDecoration: 'none',
              }}
            >
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
        <div
          ref={heroRef}
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            marginBottom: 20,
            border: '1px solid var(--sh-border)',
            boxShadow: 'var(--shadow-sm, 0 2px 10px rgba(15,23,42,0.05))',
          }}
        >
          {/* Cover image */}
          <div
            className="profile-hero"
            style={{
              background:
                profile.coverImageUrl && !coverImgError
                  ? 'var(--sh-slate-900)'
                  : 'linear-gradient(135deg, var(--sh-slate-800), var(--sh-brand))',
            }}
          >
            {profile.coverImageUrl && !coverImgError && (
              <img
                src={
                  profile.coverImageUrl.startsWith('http')
                    ? profile.coverImageUrl
                    : `${API}${profile.coverImageUrl}`
                }
                alt=""
                loading="lazy"
                onError={() => setCoverImgError(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            )}
            {/* Gradient overlay — always present for readability */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(to top, rgba(15,23,42,0.85) 0%, rgba(15,23,42,0.4) 40%, rgba(15,23,42,0.1) 70%, transparent 100%)',
                pointerEvents: 'none',
              }}
            />

            {/* Hero content positioned at bottom */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: 'clamp(16px, 2vw, 28px) clamp(20px, 3vw, 32px)',
                display: 'flex',
                alignItems: 'flex-end',
                gap: 'clamp(14px, 2vw, 22px)',
                flexWrap: 'wrap',
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  border: '3px solid var(--sh-surface)',
                  borderRadius: '50%',
                  lineHeight: 0,
                  flexShrink: 0,
                }}
              >
                <ProfileAvatar
                  profile={profile}
                  initials={initials}
                  isOwnProfile={isOwnProfile}
                  onAvatarClick={() => setShowAvatarCrop(true)}
                />
              </div>

              {/* Identity */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    marginBottom: 4,
                  }}
                >
                  <h1
                    style={{
                      margin: 0,
                      fontSize: 'clamp(20px, 2.5vw, 26px)',
                      fontWeight: 800,
                      color: 'var(--sh-nav-text)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {profile.username}
                    {profile.isPrivate && (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ opacity: 0.7 }}
                        aria-label="Private account"
                      >
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    )}
                    <VerificationBadge user={profile} size={18} />
                  </h1>
                  {profile.role === 'admin' ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 10px',
                        borderRadius: 99,
                        background: 'var(--sh-warning-light-bg)',
                        color: 'var(--sh-warning-text)',
                        border: '1px solid var(--sh-warning-border)',
                      }}
                    >
                      Admin
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 10px',
                        borderRadius: 99,
                        background: 'rgba(255,255,255,0.15)',
                        color: 'rgba(255,255,255,0.8)',
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}
                    >
                      {roleLabel(profile.accountType)}
                    </span>
                  )}
                  <ProBadge plan={profile.plan} size="sm" />
                  <DonorBadge isDonor={profile.isDonor} donorLevel={profile.donorLevel} size="sm" />
                  <ProfileBadges profile={profile} viewerAccountType={viewerAccountType} />
                </div>
                {profile.displayName && profile.displayName !== profile.username && (
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: 'rgba(255,255,255,0.86)',
                      marginBottom: 6,
                    }}
                  >
                    {profile.displayName}
                  </div>
                )}
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 10 }}>
                  Joined {fmtDate(profile.createdAt)}
                </div>
                {profile.bio && (
                  <div
                    data-testid="user-bio"
                    className="bio"
                    style={{
                      maxWidth: 720,
                      fontSize: 14,
                      lineHeight: 1.7,
                      color: 'rgba(255,255,255,0.86)',
                      marginBottom: 12,
                    }}
                  >
                    {profile.bio}
                  </div>
                )}
                {(profile.location || Number.isInteger(profile.age)) && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {profile.location && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: 99,
                          border: '1px solid rgba(255,255,255,0.2)',
                          background: 'rgba(255,255,255,0.12)',
                          color: 'rgba(255,255,255,0.86)',
                        }}
                      >
                        {profile.location}
                      </span>
                    )}
                    {Number.isInteger(profile.age) && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: 99,
                          border: '1px solid rgba(255,255,255,0.2)',
                          background: 'rgba(255,255,255,0.12)',
                          color: 'rgba(255,255,255,0.86)',
                        }}
                      >
                        Age {profile.age}
                      </span>
                    )}
                  </div>
                )}
                {Array.isArray(profile.profileLinks) && profile.profileLinks.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                    {profile.profileLinks.map((link) => (
                      <a
                        key={`${link.label}-${link.url}`}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '6px 12px',
                          borderRadius: 999,
                          border: '1px solid rgba(255,255,255,0.2)',
                          background: 'rgba(255,255,255,0.1)',
                          color: 'var(--sh-nav-text)',
                          fontSize: 12,
                          fontWeight: 700,
                          textDecoration: 'none',
                          backdropFilter: 'blur(6px)',
                        }}
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                )}

                {/* Follower / following stats */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, color: 'var(--sh-nav-text)' }}>
                    <strong>{profile.sheetCount || 0}</strong>{' '}
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>sheets</span>
                  </span>
                  <button
                    onClick={() => loadFollowList('followers')}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      fontFamily: 'inherit',
                      fontSize: 14,
                      color: 'var(--sh-nav-text)',
                    }}
                  >
                    <strong>{followers}</strong>{' '}
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>followers</span>
                  </button>
                  <button
                    onClick={() => loadFollowList('following')}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      fontFamily: 'inherit',
                      fontSize: 14,
                      color: 'var(--sh-nav-text)',
                    }}
                  >
                    <strong>{profile.followingCount || 0}</strong>{' '}
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>following</span>
                  </button>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end', flexWrap: 'wrap' }}>
                {isOwnProfile ? (
                  <Link
                    to="/settings"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '8px 16px',
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.15)',
                      color: 'var(--sh-nav-text)',
                      fontWeight: 700,
                      fontSize: 13,
                      textDecoration: 'none',
                      border: '1px solid rgba(255,255,255,0.25)',
                      backdropFilter: 'blur(6px)',
                    }}
                  >
                    Edit Profile
                  </Link>
                ) : currentUser ? (
                  <>
                    {/* Follow button — hidden when user is blocked */}
                    {!isBlocked && (
                      <button
                        onClick={handleFollowToggle}
                        disabled={toggling}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '8px 18px',
                          borderRadius: 10,
                          fontWeight: 700,
                          fontSize: 13,
                          fontFamily: 'inherit',
                          border:
                            followStatus === 'active'
                              ? '1px solid rgba(16,185,129,0.5)'
                              : followStatus === 'pending'
                                ? '1px solid var(--sh-border)'
                                : '1px solid rgba(255,255,255,0.25)',
                          background:
                            followStatus === 'active'
                              ? 'rgba(16,185,129,0.2)'
                              : followStatus === 'pending'
                                ? 'rgba(255,255,255,0.1)'
                                : 'var(--sh-brand)',
                          color:
                            followStatus === 'active'
                              ? 'var(--sh-success)'
                              : followStatus === 'pending'
                                ? 'rgba(255,255,255,0.6)'
                                : 'var(--sh-nav-text)',
                          cursor: toggling ? 'wait' : 'pointer',
                          backdropFilter: 'blur(6px)',
                        }}
                      >
                        {toggling
                          ? '...'
                          : followStatus === 'active'
                            ? 'Following'
                            : followStatus === 'pending'
                              ? 'Requested'
                              : 'Follow'}
                      </button>
                    )}

                    {/* Message button — hidden when user is blocked */}
                    {!isBlocked && (
                      <button
                        onClick={() => navigate(`/messages?dm=${profile.id}`)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 14px',
                          borderRadius: 10,
                          fontWeight: 600,
                          fontSize: 12,
                          fontFamily: 'inherit',
                          border: '1px solid rgba(255,255,255,0.25)',
                          background: 'rgba(255,255,255,0.12)',
                          color: 'var(--sh-nav-text)',
                          cursor: 'pointer',
                          backdropFilter: 'blur(6px)',
                        }}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        Message
                      </button>
                    )}

                    {/* Mute button */}
                    <button
                      onClick={handleMuteToggle}
                      disabled={muteToggling}
                      title={isMuted ? 'Unmute this user' : 'Mute this user'}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 14px',
                        borderRadius: 10,
                        fontWeight: 600,
                        fontSize: 12,
                        fontFamily: 'inherit',
                        border: isMuted
                          ? '1px solid var(--sh-warning-border)'
                          : '1px solid var(--sh-border)',
                        background: isMuted ? 'var(--sh-warning-bg)' : 'var(--sh-soft)',
                        color: isMuted ? 'var(--sh-warning-text)' : 'var(--sh-subtext)',
                        cursor: muteToggling ? 'wait' : 'pointer',
                        backdropFilter: 'blur(6px)',
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {isMuted ? (
                          <>
                            <path d="M11 5L6 9H2v6h4l5 4V5z" />
                            <line x1="23" y1="9" x2="17" y2="15" />
                            <line x1="17" y1="9" x2="23" y2="15" />
                          </>
                        ) : (
                          <>
                            <path d="M11 5L6 9H2v6h4l5 4V5z" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                          </>
                        )}
                      </svg>
                      {muteToggling ? '...' : isMuted ? 'Muted' : 'Mute'}
                    </button>

                    {/* Block button */}
                    <button
                      onClick={handleBlockToggle}
                      disabled={blockToggling}
                      title={isBlocked ? 'Unblock this user' : 'Block this user'}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 14px',
                        borderRadius: 10,
                        fontWeight: 600,
                        fontSize: 12,
                        fontFamily: 'inherit',
                        border: isBlocked
                          ? '1px solid var(--sh-danger-border)'
                          : '1px solid var(--sh-border)',
                        background: isBlocked ? 'var(--sh-danger-bg)' : 'var(--sh-soft)',
                        color: isBlocked ? 'var(--sh-danger-text)' : 'var(--sh-subtext)',
                        cursor: blockToggling ? 'wait' : 'pointer',
                        backdropFilter: 'blur(6px)',
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                      </svg>
                      {blockToggling ? '...' : isBlocked ? 'Blocked' : 'Block'}
                    </button>

                    {/* Report button */}
                    <button
                      onClick={() => setReportOpen(true)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 14px',
                        borderRadius: 10,
                        fontWeight: 600,
                        fontSize: 12,
                        fontFamily: 'inherit',
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: 'rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.7)',
                        cursor: 'pointer',
                        backdropFilter: 'blur(6px)',
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                        <line x1="4" y1="22" x2="4" y2="15" />
                      </svg>
                      Report
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* ── Own profile: Hero CTA row ────────────────────────────────── */}
          {isOwnProfile && (
            <div
              style={{
                padding: '14px clamp(20px, 3vw, 32px)',
                background: 'var(--sh-surface)',
                borderTop: '1px solid var(--sh-border)',
              }}
            >
              <div className="profile-hero-ctas">
                <Link to="/sheets" className="sh-btn sh-btn--primary sh-btn--sm" style={{ gap: 6 }}>
                  Resume Studying
                </Link>
                <Link
                  to="/sheets?starred=1"
                  className="sh-btn sh-btn--secondary sh-btn--sm"
                  style={{ gap: 6 }}
                >
                  Study Queue
                </Link>
                <Link
                  to="/sheets/upload"
                  className="sh-btn sh-btn--secondary sh-btn--sm"
                  style={{ gap: 6 }}
                >
                  Upload Sheet
                </Link>
                <Link
                  to="/settings"
                  className="sh-btn sh-btn--secondary sh-btn--sm"
                  style={{ gap: 6 }}
                >
                  Settings
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* ── Follow Requests (own profile) ─────────────────────────────── */}
        {isOwnProfile && <FollowRequestsList />}

        {/* ── Private profile gate ─────────────────────────────────────── */}
        {profile.isPrivateProfile && !isOwnProfile ? (
          <div
            style={{
              ...cardStyle,
              textAlign: 'center',
              padding: '48px 24px',
            }}
          >
            <div style={{ marginBottom: 16, color: 'var(--sh-muted)' }}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div
              style={{ fontWeight: 700, fontSize: 18, color: 'var(--sh-heading)', marginBottom: 8 }}
            >
              This account is private
            </div>
            <div
              style={{
                fontSize: 14,
                color: 'var(--sh-muted)',
                maxWidth: 400,
                margin: '0 auto',
                lineHeight: 1.6,
              }}
            >
              {profile.bio || 'Follow this account to see their posts, sheets, and activity.'}
            </div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--sh-muted)',
                maxWidth: 420,
                margin: '12px auto 0',
                lineHeight: 1.6,
              }}
            >
              Send a follow request to unlock their sheets, posts, and study activity.
            </div>
          </div>
        ) : (
          <>
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
              {activeTab === 'overview' &&
                (isOwnProfile ? (
                  <OwnOverviewTab
                    profile={profile}
                    dashboardSummary={dashboardSummary}
                    recentlyViewed={recentlyViewed}
                    studyQueueCounts={studyQueueCounts}
                    studyToReview={studyToReview}
                    studyStudying={studyStudying}
                    studyDone={studyDone}
                    profileStudyStatusMap={profileStudyStatusMap}
                    dashboardRecentSheets={dashboardRecentSheets}
                    activityData={activityData}
                    badges={badges}
                    followers={followers}
                    loadFollowList={loadFollowList}
                    viewerAccountType={viewerAccountType}
                    phase1On={phase1On}
                    upcomingExamsOn={upcomingExamsOn}
                    topContributors={topContributors}
                    topContributorsLoading={topContributorsLoading}
                  />
                ) : (
                  <OtherOverviewTab profile={profile} activityData={activityData} badges={badges} />
                ))}

              {activeTab === 'learning' && isOwnProfile && (
                <MyLearningTab profile={profile} recentlyViewed={recentlyViewed} />
              )}

              {activeTab === 'study' && isOwnProfile && !isSelfLearner(viewerAccountType) && (
                <StudyTab
                  recentlyViewed={recentlyViewed}
                  studyActivity={studyActivity}
                  studyQueueCounts={studyQueueCounts}
                  studyToReview={studyToReview}
                  studyStudying={studyStudying}
                  studyDone={studyDone}
                  dashboardRecentSheets={dashboardRecentSheets}
                />
              )}

              {activeTab === 'sheets' && (
                <SheetsTab
                  profile={profile}
                  isOwnProfile={isOwnProfile}
                  studyStatusMap={profileStudyStatusMap}
                />
              )}

              {activeTab === 'posts' && <PostsTab profileId={profile?.id} />}

              {activeTab === 'achievements' && (
                <AchievementsTab activityData={activityData} badges={badges} />
              )}
            </div>
          </>
        )}
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
            setSessionUser((u) => (u ? { ...u, avatarUrl } : u))
          }}
        />
      )}

      {profile && (
        <ReportModal
          open={reportOpen}
          targetType="user"
          targetId={profile.id}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * TAB CONTENT COMPONENTS
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ── Own profile Overview: "Student Cockpit" ─────────────────────────────── */
function OwnOverviewTab({
  profile,
  dashboardSummary,
  recentlyViewed,
  studyQueueCounts,
  studyToReview,
  studyStudying,
  studyDone,
  profileStudyStatusMap,
  dashboardRecentSheets,
  activityData,
  badges,
  followers,
  loadFollowList,
  viewerAccountType,
  phase1On,
  upcomingExamsOn,
  topContributors,
  topContributorsLoading,
}) {
  return (
    <div className="profile-cockpit">
      {/* Left column: action / study */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ResumeStudying entries={recentlyViewed} />
        {upcomingExamsOn && !isSelfLearner(viewerAccountType) ? <UpcomingExamsCard /> : null}
        <StudyNudges toReview={studyToReview} studying={studyStudying} done={studyDone} />
        <StudyQueue counts={studyQueueCounts} toReview={studyToReview} studying={studyStudying} />
        <DashboardRecentSheets recentSheets={dashboardRecentSheets} />
        <QuickActions />
      </div>

      {/* Right column: identity / progress */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ProfileStatsWidget username={profile.username} />
        <PinnedSheetsSection sheets={profile.pinnedSheets} studyStatusMap={profileStudyStatusMap} />
        <SharedShelvesSection shelves={profile.sharedShelves} isOwnProfile />
        {activityData.length > 0 && (
          <div style={cardStyle}>
            <ActivityHeatmap data={activityData} weeks={12} />
          </div>
        )}
        <BadgesSection badges={badges} />
        {phase1On ? (
          <TopContributors
            contributors={topContributors}
            accountType={viewerAccountType}
            loading={topContributorsLoading}
          />
        ) : null}
        <FollowSuggestions />
        {/* Followers / Following summary */}
        <div style={cardStyle}>
          <h2 style={{ ...sectionHeadingStyle, marginBottom: 12 }}>Community</h2>
          <div style={{ display: 'flex', gap: 16 }}>
            <button
              onClick={() => loadFollowList('followers')}
              style={{
                flex: 1,
                background: 'var(--sh-soft)',
                border: '1px solid var(--sh-border)',
                borderRadius: 12,
                padding: '14px 12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--sh-heading)' }}>
                {followers}
              </div>
              <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>Followers</div>
            </button>
            <button
              onClick={() => loadFollowList('following')}
              style={{
                flex: 1,
                background: 'var(--sh-soft)',
                border: '1px solid var(--sh-border)',
                borderRadius: 12,
                padding: '14px 12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--sh-heading)' }}>
                {profile.followingCount || 0}
              </div>
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
  recentlyViewed,
  studyActivity,
  studyQueueCounts,
  studyToReview,
  studyStudying,
  studyDone,
  dashboardRecentSheets,
}) {
  return (
    <div className="profile-columns">
      <StudyActivity activity={studyActivity} />
      <ResumeStudying entries={recentlyViewed} />
      <StudyNudges toReview={studyToReview} studying={studyStudying} done={studyDone} />
      <StudyQueue counts={studyQueueCounts} toReview={studyToReview} studying={studyStudying} />
      <DashboardRecentSheets recentSheets={dashboardRecentSheets} />
      <QuickActions />
    </div>
  )
}

/* ── Sheets tab (both modes) ─────────────────────────────────────────────── */
function SheetsTab({ profile, isOwnProfile, studyStatusMap }) {
  return (
    <div className="profile-columns">
      <RecentSheetsSection sheets={profile.recentSheets} studyStatusMap={studyStatusMap} />
      <StarredSheetsSection
        sheets={profile.starredSheets}
        isOwnProfile={isOwnProfile}
        studyStatusMap={studyStatusMap}
      />
      <SharedNotesSection notes={profile.sharedNotes} />
    </div>
  )
}

/* ── Posts tab (both modes) ──────────────────────────────────────────────── */
function PostsTab({ profileId }) {
  const [posts, setPosts] = useState([])
  const [postsLoading, setPostsLoading] = useState(true)
  const { user: currentUser } = useSession()

  useEffect(() => {
    if (!profileId) return
    let cancelled = false
    fetch(`${API}/api/feed?userId=${profileId}`, { headers: authHeaders(), credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => {
        if (!cancelled) setPosts(data.items || data.posts || [])
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPostsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [profileId])

  if (postsLoading) {
    return (
      <div className="profile-columns">
        {[1, 2, 3].map((n) => (
          <div key={n} style={{ ...cardStyle, padding: '20px 24px' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
              <div className="sh-skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
              <div style={{ flex: 1 }}>
                <div
                  className="sh-skeleton"
                  style={{ width: '50%', height: 13, borderRadius: 6, marginBottom: 6 }}
                />
                <div
                  className="sh-skeleton"
                  style={{ width: '30%', height: 10, borderRadius: 6 }}
                />
              </div>
            </div>
            <div
              className="sh-skeleton"
              style={{ width: '80%', height: 14, borderRadius: 6, marginBottom: 8 }}
            />
            <div
              className="sh-skeleton"
              style={{ width: '100%', height: 12, borderRadius: 6, marginBottom: 6 }}
            />
            <div className="sh-skeleton" style={{ width: '60%', height: 12, borderRadius: 6 }} />
          </div>
        ))}
      </div>
    )
  }

  if (!posts.length) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 6 }}>
          No posts yet
        </div>
        <div style={{ fontSize: 13, color: 'var(--sh-muted)' }}>
          This user has not posted anything to the feed.
        </div>
      </div>
    )
  }

  return (
    <div className="profile-columns" style={{ gap: 12 }}>
      {posts.map((item) => (
        <FeedCard
          key={item.id}
          item={item}
          currentUser={currentUser}
          onReact={() => {}}
          onStar={() => {}}
          onDeletePost={() => {}}
          canDeletePost={false}
          isPostMenuOpen={false}
          onTogglePostMenu={() => {}}
          isDeletingPost={false}
        />
      ))}
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
          <div style={{ fontSize: 36, marginBottom: 12, color: 'var(--sh-muted)' }}>
            <IconStar size={36} />
          </div>
          <div
            style={{ fontSize: 15, fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 6 }}
          >
            No achievements yet
          </div>
          <div style={{ fontSize: 13, color: 'var(--sh-muted)' }}>
            Start studying and contributing to unlock badges.
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Other user Overview: "Showcase" ─────────────────────────────────────── */
function OtherOverviewTab({ profile, activityData, badges }) {
  return (
    <div className="profile-columns">
      <ProfileStatsWidget username={profile.username} />
      <PinnedSheetsSection sheets={profile.pinnedSheets} />
      <SharedShelvesSection shelves={profile.sharedShelves} isOwnProfile={false} />
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
