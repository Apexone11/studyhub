// src/mobile/pages/MobileHomePage.jsx
// Home feed tab — triage band (recent activity) + discovery feed (infinite scroll).
// Distinct mobile-first design: bold cards, contextual icons, smooth entrance.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as _animeModule from 'animejs'
const anime = _animeModule.default || _animeModule
import { useSession } from '../../lib/session-context'
import { API } from '../../config'
import MobileTopBar from '../components/MobileTopBar'

const PREFERS_REDUCED =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* ── Fetch helpers ─────────────────────────────────────────────── */

async function fetchBand(band, cursor, limit = 20) {
  const params = new URLSearchParams({ band, limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  const res = await fetch(`${API}/api/feed/mobile?${params}`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Feed ${band} failed`)
  return res.json()
}

/* ── Type-specific icons ───────────────────────────────────────── */

function FeedItemIcon({ type }) {
  const iconProps = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    'aria-hidden': true,
  }
  const stroke = {
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }
  switch (type) {
    case 'sheet':
      return (
        <svg {...iconProps}>
          <path d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" {...stroke} />
          <path d="M14 2v6h6" {...stroke} />
        </svg>
      )
    case 'note':
      return (
        <svg {...iconProps}>
          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" {...stroke} />
        </svg>
      )
    case 'post':
      return (
        <svg {...iconProps}>
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" {...stroke} />
        </svg>
      )
    case 'group_activity':
      return (
        <svg {...iconProps}>
          <circle cx="9" cy="8" r="3" {...stroke} />
          <path d="M2 20c0-2.5 2.5-4.5 7-4.5s7 2 7 4.5" {...stroke} />
        </svg>
      )
    case 'announcement':
      return (
        <svg {...iconProps}>
          <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9z" {...stroke} />
          <path d="M13.73 21a2 2 0 01-3.46 0" {...stroke} />
        </svg>
      )
    default:
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="10" {...stroke} />
        </svg>
      )
  }
}

/* ── Triage band card ──────────────────────────────────────────── */

function TriageCard({ item }) {
  const navigate = useNavigate()

  const handleTap = useCallback(() => {
    switch (item.type) {
      case 'sheet':
        navigate(`/sheets/${item.id}`)
        break
      case 'note':
        navigate(`/notes/${item.id}`)
        break
      case 'group_activity':
        navigate(`/study-groups/${item.payload?.groupId}`)
        break
      default:
        break
    }
  }, [item, navigate])

  const label =
    item.type === 'sheet'
      ? item.payload?.title
      : item.type === 'note'
        ? item.payload?.title
        : item.type === 'group_activity'
          ? item.payload?.groupName
          : item.type === 'announcement'
            ? 'New announcement'
            : item.payload?.body?.slice(0, 40) || 'Activity'

  const sub =
    item.type === 'sheet'
      ? item.payload?.courseTag || 'Study sheet'
      : item.type === 'note'
        ? item.payload?.tags?.[0] || 'Note'
        : item.type === 'group_activity'
          ? item.payload?.summary?.slice(0, 50)
          : item.type === 'announcement'
            ? item.payload?.courseName
            : null

  return (
    <button type="button" className="mob-feed-triage-card" onClick={handleTap}>
      <div className="mob-feed-triage-icon">
        <FeedItemIcon type={item.type} />
      </div>
      <div className="mob-feed-triage-text">
        <span className="mob-feed-triage-label">{label}</span>
        {sub && <span className="mob-feed-triage-sub">{sub}</span>}
      </div>
    </button>
  )
}

/* ── Discovery feed card ───────────────────────────────────────── */

function DiscoveryCard({ item }) {
  const navigate = useNavigate()

  const handleTap = useCallback(() => {
    switch (item.type) {
      case 'sheet':
        navigate(`/sheets/${item.id}`)
        break
      case 'note':
        navigate(`/notes/${item.id}`)
        break
      case 'post':
        break
      case 'group_activity':
        navigate(`/study-groups/${item.payload?.groupId}`)
        break
      default:
        break
    }
  }, [item, navigate])

  const title = item.payload?.title || item.payload?.groupName || 'Activity'
  const preview = item.payload?.preview || item.payload?.body || ''
  const authorName = item.author?.username || 'Anonymous'
  const courseTag = item.payload?.courseTag || item.payload?.courseName || null

  const statParts = []
  if (item.payload?.starCount > 0) statParts.push(`${item.payload.starCount} stars`)
  if (item.payload?.forkCount > 0) statParts.push(`${item.payload.forkCount} forks`)
  if (item.payload?.commentCount > 0) statParts.push(`${item.payload.commentCount} comments`)
  if (item.payload?.reactionCount > 0) statParts.push(`${item.payload.reactionCount} reactions`)

  const timeAgo = formatTimeAgo(item.createdAt)

  return (
    <button type="button" className="mob-feed-card" onClick={handleTap}>
      <div className="mob-feed-card-header">
        <div className="mob-feed-card-type-badge">
          <FeedItemIcon type={item.type} />
          <span>{item.type === 'group_activity' ? 'Group' : item.type}</span>
        </div>
        {courseTag && <span className="mob-feed-card-course">{courseTag}</span>}
      </div>

      <h3 className="mob-feed-card-title">{title}</h3>

      {preview && (
        <p className="mob-feed-card-preview">
          {preview.length > 120 ? preview.slice(0, 120) + '...' : preview}
        </p>
      )}

      <div className="mob-feed-card-footer">
        <span className="mob-feed-card-author">{authorName}</span>
        <span className="mob-feed-card-dot" />
        <span className="mob-feed-card-time">{timeAgo}</span>
        {statParts.length > 0 && (
          <>
            <span className="mob-feed-card-dot" />
            <span className="mob-feed-card-stats">{statParts.join(' / ')}</span>
          </>
        )}
      </div>
    </button>
  )
}

/* ── Time formatting ───────────────────────────────────────────── */

function formatTimeAgo(isoStr) {
  if (!isoStr) return ''
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(isoStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/* ── Empty state ───────────────────────────────────────────────── */

function EmptyFeed() {
  return (
    <div className="mob-feed-empty">
      <div className="mob-feed-empty-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 2L9.5 8.5 3 12l6.5 3.5L12 22l2.5-6.5L21 12l-6.5-3.5L12 2z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="mob-feed-empty-title">Your feed is empty</h3>
      <p className="mob-feed-empty-text">
        Follow classmates, join study groups, and enroll in courses to see content here.
      </p>
    </div>
  )
}

/* ── Main Home page ────────────────────────────────────────────── */

export default function MobileHomePage() {
  const { user } = useSession()
  const navigate = useNavigate()

  const [triageItems, setTriageItems] = useState([])
  const [discoveryItems, setDiscoveryItems] = useState([])
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)

  const triageSectionRef = useRef(null)
  const discoverySectionRef = useRef(null)
  const observerRef = useRef(null)
  const sentinelRef = useRef(null)

  // Initial load: triage + first discovery page
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [triage, discovery] = await Promise.all([
          fetchBand('triage', null, 5),
          fetchBand('discovery', null, 20),
        ])
        if (!active) return
        setTriageItems(triage.items || [])
        setDiscoveryItems(discovery.items || [])
        setCursor(discovery.nextCursor || null)
        setHasMore(Boolean(discovery.hasMore))
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  // Animate in once loaded
  useEffect(() => {
    if (loading || PREFERS_REDUCED) return
    const targets = [triageSectionRef.current, discoverySectionRef.current].filter(Boolean)
    if (targets.length === 0) return
    anime({
      targets,
      translateY: [16, 0],
      opacity: [0, 1],
      duration: 400,
      delay: anime.stagger(120),
      easing: 'easeOutCubic',
    })
  }, [loading])

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMore && cursor) {
          setLoadingMore(true)
          fetchBand('discovery', cursor, 20)
            .then((data) => {
              setDiscoveryItems((prev) => [...prev, ...(data.items || [])])
              setCursor(data.nextCursor || null)
              setHasMore(Boolean(data.hasMore))
            })
            .catch(() => {})
            .finally(() => setLoadingMore(false))
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(sentinelRef.current)
    observerRef.current = observer
    return () => observer.disconnect()
  }, [cursor, hasMore, loadingMore])

  // Greeting based on time
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const searchAction = (
    <button
      type="button"
      className="mob-topbar-back"
      onClick={() => navigate('/search')}
      aria-label="Search"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  )

  if (loading) {
    return (
      <>
        <MobileTopBar title="Home" right={searchAction} />
        <div className="mob-feed-skeleton">
          <div className="mob-feed-skeleton-greeting" />
          <div className="mob-feed-skeleton-triage">
            <div className="mob-feed-skeleton-card-sm" />
            <div className="mob-feed-skeleton-card-sm" />
            <div className="mob-feed-skeleton-card-sm" />
          </div>
          <div className="mob-feed-skeleton-card" />
          <div className="mob-feed-skeleton-card" />
          <div className="mob-feed-skeleton-card" />
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <MobileTopBar title="Home" right={searchAction} />
        <div className="mob-feed-empty">
          <p className="mob-feed-empty-text">Could not load your feed. Pull down to retry.</p>
        </div>
      </>
    )
  }

  const showTriage = triageItems.length > 0
  const showDiscovery = discoveryItems.length > 0

  return (
    <>
      <MobileTopBar title="Home" right={searchAction} />
      <div className="mob-feed">
        {/* Greeting */}
        <div className="mob-feed-greeting">
          <h2 className="mob-feed-greeting-text">
            {greeting}
            {user?.username ? `, ${user.username}` : ''}
          </h2>
        </div>

        {/* Triage band */}
        {showTriage && (
          <section
            ref={triageSectionRef}
            className="mob-feed-triage"
            style={PREFERS_REDUCED ? {} : { opacity: 0 }}
          >
            <h3 className="mob-feed-section-title">Recent Activity</h3>
            <div className="mob-feed-triage-scroll">
              {triageItems.map((item) => (
                <TriageCard key={`${item.type}-${item.id}`} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* Discovery feed */}
        {showDiscovery ? (
          <section
            ref={discoverySectionRef}
            className="mob-feed-discovery"
            style={PREFERS_REDUCED ? {} : { opacity: 0 }}
          >
            <h3 className="mob-feed-section-title">Discover</h3>
            {discoveryItems.map((item) => (
              <DiscoveryCard key={`${item.type}-${item.id}`} item={item} />
            ))}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="mob-feed-sentinel">
              {loadingMore && (
                <div className="mob-feed-loading-more">
                  <div className="mob-feed-spinner" />
                </div>
              )}
            </div>
          </section>
        ) : !showTriage ? (
          <EmptyFeed />
        ) : null}
      </div>
    </>
  )
}
