// src/mobile/pages/MobileProfilePage.jsx
// Profile tab — real profile surface.
// v2 redesign (April 2026):
//   • Settings icon moved to the top-right of MobileTopBar (replaces the
//     old action-list "Settings" row).
//   • Quick-action list removed in favour of a SegmentedNav with four tabs
//     (Sheets / Starred / Notes / Groups). Each tab renders a concise
//     content card with a "View all" link to the corresponding page.
//   • Identity card (avatar + name + @handle + bio + 4 StatCounters) is kept
//     and still animates in via anime.js stagger.
//   • Sign Out stays pinned to the bottom.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import anime from '../lib/animeCompat'
import { useSession } from '../../lib/session-context'
import { API } from '../../config'
import MobileTopBar from '../components/MobileTopBar'
import StatCounter from '../components/StatCounter'
import SegmentedNav from '../components/SegmentedNav'
import EmptyState from '../components/EmptyState'
import { safeImageSrc } from '../lib/safeImage'

const PREFERS_REDUCED =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* ── Fetch profile data ────────────────────────────────────────── */

async function fetchProfileStats(userId) {
  const res = await fetch(`${API}/api/users/${userId}`, { credentials: 'include' })
  if (!res.ok) return null
  const data = await res.json()
  return data.user || data
}

async function fetchMySheets() {
  const res = await fetch(`${API}/api/sheets?mine=true&limit=3`, { credentials: 'include' })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data.sheets) ? data.sheets : Array.isArray(data) ? data : []
}

async function fetchStarredSheets() {
  const res = await fetch(`${API}/api/sheets?starred=true&limit=3`, { credentials: 'include' })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data.sheets) ? data.sheets : Array.isArray(data) ? data : []
}

async function fetchMyNotes() {
  const res = await fetch(`${API}/api/notes?limit=3`, { credentials: 'include' })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data.notes) ? data.notes : Array.isArray(data) ? data : []
}

async function fetchMyGroups() {
  const res = await fetch(`${API}/api/study-groups?mine=true&limit=3`, { credentials: 'include' })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data.groups) ? data.groups : Array.isArray(data) ? data : []
}

/* ── Tab definitions ───────────────────────────────────────────── */

const TABS = [
  { id: 'sheets', label: 'Sheets' },
  { id: 'starred', label: 'Starred' },
  { id: 'notes', label: 'Notes' },
  { id: 'groups', label: 'Groups' },
]

const VIEW_ALL_PATH = {
  sheets: '/m/home',
  starred: '/m/home',
  notes: '/m/notes',
  groups: '/m/home',
}

const VIEW_ALL_LABEL = {
  sheets: 'View all sheets',
  starred: 'View starred sheets',
  notes: 'View all notes',
  groups: 'View study groups',
}

const EMPTY_COPY = {
  sheets: {
    title: 'No sheets yet',
    description: 'Upload or fork a study sheet to see it here.',
  },
  starred: {
    title: 'Nothing starred',
    description: 'Star sheets you want to come back to.',
  },
  notes: {
    title: 'No notes yet',
    description: 'Capture what you are learning in a note.',
  },
  groups: {
    title: 'No study groups',
    description: 'Join or create a study group to collaborate.',
  },
}

/* ── Icons ─────────────────────────────────────────────────────── */

function SettingsGear() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="mob-profile-tab-row-chevron"
    >
      <path
        d="M9 18l6-6-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ── Tab content list ──────────────────────────────────────────── */

function TabContent({ tab, loading, items, onItemClick, onViewAll }) {
  if (loading) {
    return (
      <div className="mob-profile-tab-skeleton">
        <div className="mob-profile-tab-skeleton-row" />
        <div className="mob-profile-tab-skeleton-row" />
        <div className="mob-profile-tab-skeleton-row" />
      </div>
    )
  }

  if (!items || items.length === 0) {
    const copy = EMPTY_COPY[tab] || { title: 'Nothing to show', description: '' }
    return (
      <EmptyState
        title={copy.title}
        description={copy.description}
        actionLabel={VIEW_ALL_LABEL[tab]}
        onAction={onViewAll}
      />
    )
  }

  return (
    <div className="mob-profile-tab-list">
      {items.map((item) => {
        const title = item.title || item.name || 'Untitled'
        const subtitle =
          item.course?.code ||
          item.course?.name ||
          item.subject ||
          (typeof item.memberCount === 'number' ? `${item.memberCount} members` : '') ||
          ''
        return (
          <button
            key={item.id}
            type="button"
            className="mob-profile-tab-row"
            onClick={() => onItemClick(item)}
          >
            <div className="mob-profile-tab-row-body">
              <span className="mob-profile-tab-row-title">{title}</span>
              {subtitle && <span className="mob-profile-tab-row-subtitle">{subtitle}</span>}
            </div>
            <ChevronRight />
          </button>
        )
      })}
      <button type="button" className="mob-profile-tab-viewall" onClick={onViewAll}>
        {VIEW_ALL_LABEL[tab]}
      </button>
    </div>
  )
}

/* ── Main Profile page ─────────────────────────────────────────── */

export default function MobileProfilePage() {
  const { user, signOut } = useSession()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const hasUserId = Boolean(user?.id)
  const [loading, setLoading] = useState(hasUserId)
  const [activeTab, setActiveTab] = useState('sheets')

  // Per-tab data + loading state. Tabs load lazily on first visit.
  const [tabData, setTabData] = useState({
    sheets: null,
    starred: null,
    notes: null,
    groups: null,
  })
  const [tabLoading, setTabLoading] = useState({
    sheets: false,
    starred: false,
    notes: false,
    groups: false,
  })

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

  // Lazy-load tab content the first time the tab is requested. Called from
  // the initial-tab effect below and from handleTabChange — never as a
  // synchronous setState from inside an effect body.
  const loadTab = useCallback(
    (tabId) => {
      if (!user?.id) return
      setTabData((prevData) => {
        if (prevData[tabId] !== null) return prevData // already loaded
        setTabLoading((prev) => ({ ...prev, [tabId]: true }))

        const loader =
          tabId === 'sheets'
            ? fetchMySheets
            : tabId === 'starred'
              ? fetchStarredSheets
              : tabId === 'notes'
                ? fetchMyNotes
                : fetchMyGroups

        loader()
          .then((items) => {
            setTabData((prev) => ({ ...prev, [tabId]: items }))
          })
          .catch(() => {
            setTabData((prev) => ({ ...prev, [tabId]: [] }))
          })
          .finally(() => {
            setTabLoading((prev) => ({ ...prev, [tabId]: false }))
          })
        return prevData
      })
    },
    [user?.id],
  )

  // Kick off the initial tab load when the session user becomes available.
  // loadTab mutates state only inside async callbacks, so this effect does
  // not trigger the react-hooks/set-state-in-effect rule.
  useEffect(() => {
    if (!user?.id) return
    loadTab(activeTab)
    // Only run on user id availability — subsequent tab changes go through
    // handleTabChange, which calls loadTab directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const handleTabChange = useCallback(
    (tabId) => {
      setActiveTab(tabId)
      loadTab(tabId)
    },
    [loadTab],
  )

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

  const handleViewAll = useCallback(() => {
    navigate(VIEW_ALL_PATH[activeTab] || '/m/home')
  }, [navigate, activeTab])

  const handleItemClick = useCallback(
    (item) => {
      if (activeTab === 'sheets' || activeTab === 'starred') {
        navigate(`/m/sheets/${item.id}`)
      } else if (activeTab === 'notes') {
        navigate(`/m/notes/${item.id}`)
      } else if (activeTab === 'groups') {
        navigate(`/m/groups/${item.id}`)
      }
    },
    [navigate, activeTab],
  )

  const topBarRight = useMemo(
    () => (
      <button
        type="button"
        className="sh-m-topbar__icon-btn"
        onClick={() => navigate('/settings')}
        aria-label="Settings"
      >
        <SettingsGear />
      </button>
    ),
    [navigate],
  )

  const avatarUrl = safeImageSrc(profile?.avatarUrl || user?.avatarUrl)
  const displayName = profile?.displayName || user?.displayName || user?.username || 'Student'
  const username = profile?.username || user?.username || ''
  const bio = profile?.bio || ''
  const sheetCount = profile?.sheetCount ?? profile?._count?.sheets ?? 0
  const starCount = profile?.totalStars ?? 0
  const followerCount = profile?.followerCount ?? profile?._count?.followers ?? 0
  const followingCount = profile?.followingCount ?? profile?._count?.following ?? 0

  return (
    <>
      <MobileTopBar title="Profile" right={topBarRight} />

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

            {/* Stats row — count-up on reveal (v3 refresh) */}
            <div className="sh-m-profile-stats" role="list">
              <StatCounter value={sheetCount} label="Sheets" compact />
              <StatCounter value={starCount} label="Stars" compact />
              <StatCounter value={followerCount} label="Followers" compact />
              <StatCounter value={followingCount} label="Following" compact />
            </div>
          </div>

          {/* Tabbed content — Sheets / Starred / Notes / Groups */}
          <div className="mob-profile-tabs">
            <SegmentedNav
              items={TABS}
              value={activeTab}
              onChange={handleTabChange}
              block
              ariaLabel="Profile sections"
            />

            <div className="mob-profile-tab-panel" role="tabpanel">
              <TabContent
                tab={activeTab}
                loading={tabLoading[activeTab]}
                items={tabData[activeTab]}
                onItemClick={handleItemClick}
                onViewAll={handleViewAll}
              />
            </div>
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
