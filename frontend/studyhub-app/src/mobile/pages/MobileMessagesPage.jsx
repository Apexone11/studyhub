// src/mobile/pages/MobileMessagesPage.jsx
// Messages tab — conversation list with real-time unread badges,
// inline search, human timestamps, and read-state ticks.
// Tapping a conversation navigates to the web thread view (for now).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import anime from '../lib/animeCompat'
import { useSession } from '../../lib/session-context'
import { API } from '../../config'
import MobileTopBar from '../components/MobileTopBar'
import SegmentedNav from '../components/SegmentedNav'
import EmptyState from '../components/EmptyState'
import { safeImageSrc } from '../lib/safeImage'
import usePullToRefresh from '../hooks/usePullToRefresh'

const PREFERS_REDUCED =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* ── Fetch helpers ─────────────────────────────────────────────── */

async function fetchConversations() {
  const res = await fetch(`${API}/api/messages/conversations?limit=50`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to load conversations')
  return res.json()
}

/* ── Time formatting ───────────────────────────────────────────── */

function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatTime(isoStr) {
  if (!isoStr) return ''
  const date = new Date(isoStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  if (isSameCalendarDay(date, now)) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameCalendarDay(date, yesterday)) return 'Yesterday'
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'short' })
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/* ── Avatar component ──────────────────────────────────────────── */

function ConversationAvatar({ conversation, currentUserId }) {
  const otherUser =
    conversation.type === 'dm'
      ? conversation.participants?.find((p) => p.id !== currentUserId)
      : null

  const rawAvatarUrl = otherUser?.avatarUrl || conversation.avatarUrl
  const avatarUrl = safeImageSrc(rawAvatarUrl)
  const name = otherUser?.username || conversation.name || '?'
  const initial = name.charAt(0).toUpperCase()

  if (avatarUrl) {
    return (
      <div className="mob-msg-avatar">
        <img src={avatarUrl} alt="" className="mob-msg-avatar-img" referrerPolicy="no-referrer" />
      </div>
    )
  }

  return (
    <div className="mob-msg-avatar mob-msg-avatar--fallback">
      <span>{initial}</span>
    </div>
  )
}

/* ── Conversation row ──────────────────────────────────────────── */

function SentCheckIcon({ read }) {
  if (read) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M2 13l4 4 8-10M10 17l4 4 8-14"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 13l5 5L20 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ConversationRow({ conversation, currentUserId, onTap }) {
  const otherUser =
    conversation.type === 'dm'
      ? conversation.participants?.find((p) => p.id !== currentUserId)
      : null

  const displayName =
    conversation.type === 'dm'
      ? otherUser?.username || 'Unknown'
      : conversation.name || 'Group Chat'

  const lastMsg = conversation.lastMessage
  const lastFromMe = Boolean(lastMsg && lastMsg.sender?.id === currentUserId)
  const preview = lastMsg
    ? (lastFromMe ? 'You: ' : '') + (lastMsg.content?.slice(0, 60) || '')
    : 'No messages yet'

  const time = lastMsg ? formatTime(lastMsg.createdAt) : ''
  const unread = conversation.unreadCount || 0
  const showCheck = lastFromMe && unread === 0

  return (
    <button
      type="button"
      className={`mob-msg-row ${unread > 0 ? 'mob-msg-row--unread' : ''}`}
      onClick={() => onTap(conversation.id)}
    >
      <ConversationAvatar conversation={conversation} currentUserId={currentUserId} />
      <div className="mob-msg-row-content">
        <div className="mob-msg-row-top">
          <span className="mob-msg-row-name">{displayName}</span>
          <span className="mob-msg-row-time">{time}</span>
        </div>
        <div className="mob-msg-row-bottom">
          {showCheck && (
            <span className="mob-msg-row-check" aria-label="Read">
              <SentCheckIcon read />
            </span>
          )}
          <span className="mob-msg-row-preview">{preview}</span>
          {unread > 0 && <span className="mob-msg-row-badge">{unread > 99 ? '99+' : unread}</span>}
        </div>
      </div>
    </button>
  )
}

/* ── Empty state ───────────────────────────────────────────────── */

function ChatBubbleArt() {
  return (
    <svg width="160" height="160" viewBox="0 0 160 160" fill="none" aria-hidden="true">
      <path
        d="M40 58c0-8 6-14 14-14h52c8 0 14 6 14 14v32c0 8-6 14-14 14H72l-18 14v-14h-0c-8 0-14-6-14-14V58z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M62 68h36" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M62 80h24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="116" cy="40" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
      <path d="M116 36v6M116 44v0" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

function NoUnreadArt() {
  return (
    <svg width="160" height="160" viewBox="0 0 160 160" fill="none" aria-hidden="true">
      <circle cx="80" cy="80" r="40" stroke="currentColor" strokeWidth="3" fill="none" />
      <path
        d="M64 80l12 12 22-24"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ── Skeleton ──────────────────────────────────────────────────── */

function MessagesSkeleton() {
  return (
    <div className="mob-msg-skeleton">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="mob-msg-skeleton-row">
          <div className="mob-msg-skeleton-avatar" />
          <div className="mob-msg-skeleton-lines">
            <div className="mob-msg-skeleton-line mob-msg-skeleton-line--name" />
            <div className="mob-msg-skeleton-line mob-msg-skeleton-line--preview" />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Main Messages page ────────────────────────────────────────── */

const FILTER_ITEMS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'dms', label: 'DMs' },
  { id: 'groups', label: 'Groups' },
]

export default function MobileMessagesPage() {
  const { user } = useSession()
  const navigate = useNavigate()

  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const listRef = useRef(null)

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    try {
      const data = await fetchConversations()
      const list = Array.isArray(data) ? data : data.conversations || []
      setConversations(list)
      setError(null)
    } catch {
      // keep existing data
    }
  }, [])
  const {
    containerRef: pullRef,
    pulling,
    refreshing,
    pullDistance,
  } = usePullToRefresh(handleRefresh)

  useEffect(() => {
    let active = true
    fetchConversations()
      .then((data) => {
        if (active) {
          const list = Array.isArray(data) ? data : data.conversations || []
          setConversations(list)
        }
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
  }, [])

  // Animate list entrance
  useEffect(() => {
    if (loading || PREFERS_REDUCED || !listRef.current) return
    anime({
      targets: listRef.current.children,
      translateY: [12, 0],
      opacity: [0, 1],
      duration: 300,
      delay: anime.stagger(40, { start: 100 }),
      easing: 'easeOutCubic',
    })
  }, [loading])

  const handleTapConversation = useCallback(
    (id) => {
      navigate(`/m/messages/${id}`)
    },
    [navigate],
  )

  const visibleConversations = useMemo(() => {
    if (!conversations) return []
    let list = conversations
    if (filter === 'unread') list = list.filter((c) => (c.unreadCount || 0) > 0)
    else if (filter === 'dms') list = list.filter((c) => c.type === 'dm')
    else if (filter === 'groups') list = list.filter((c) => c.type !== 'dm')

    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) => {
      const other = c.type === 'dm' ? c.participants?.find((p) => p.id !== user?.id) : null
      const displayName = c.type === 'dm' ? other?.username || 'unknown' : c.name || 'group chat'
      const preview = c.lastMessage?.content || ''
      return displayName.toLowerCase().includes(q) || preview.toLowerCase().includes(q)
    })
  }, [conversations, filter, query, user?.id])

  const totalUnread = useMemo(
    () => (conversations || []).reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [conversations],
  )

  const topBarRight = (
    <button
      type="button"
      className="sh-m-topbar__icon-btn"
      onClick={() => navigate('/m/search')}
      aria-label="New message"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M13 6.5L17.5 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  )

  return (
    <>
      <MobileTopBar title="Messages" right={topBarRight} />
      <div ref={pullRef} style={{ overflowY: 'auto', flex: 1 }}>
        {(pulling || refreshing) && (
          <div className="mob-ptr" style={{ height: pullDistance }}>
            <div className={`mob-ptr-spinner ${refreshing ? 'mob-ptr-spinner--active' : ''}`}>
              <div className="mob-feed-spinner" />
            </div>
          </div>
        )}
        {loading ? (
          <MessagesSkeleton />
        ) : error ? (
          <EmptyState
            art={<ChatBubbleArt />}
            title="We could not load messages"
            description="Pull down to retry, or try again in a moment."
          />
        ) : conversations.length === 0 ? (
          <EmptyState
            art={<ChatBubbleArt />}
            title="No conversations yet"
            description="Start a conversation from someone's profile, a study group, or search for a classmate."
            actionLabel="Find people"
            onAction={() => navigate('/m/search')}
          />
        ) : (
          <>
            <div className="sh-m-msg-search">
              <svg
                className="sh-m-msg-search__icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="M20 20l-3.5-3.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations"
                aria-label="Search conversations"
                className="sh-m-msg-search__input"
              />
              {query && (
                <button
                  type="button"
                  className="sh-m-msg-search__clear"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              )}
            </div>
            <div className="sh-m-msg-toolbar">
              <SegmentedNav
                items={FILTER_ITEMS}
                value={filter}
                onChange={setFilter}
                block
                ariaLabel="Filter conversations"
              />
              {totalUnread > 0 && (
                <span className="sh-m-msg-unread-pill">
                  {totalUnread > 99 ? '99+' : totalUnread} unread
                </span>
              )}
            </div>
            {visibleConversations.length === 0 ? (
              <EmptyState
                art={<NoUnreadArt />}
                title={query ? 'No matches' : 'You are all caught up'}
                description={
                  query
                    ? `Nothing matches "${query}". Try a different name or keyword.`
                    : filter === 'unread'
                      ? 'No unread messages — nice work.'
                      : filter === 'dms'
                        ? 'No direct messages match this filter.'
                        : filter === 'groups'
                          ? 'No group conversations match this filter.'
                          : 'No conversations match this filter.'
                }
              />
            ) : (
              <div ref={listRef} className="mob-msg-list">
                {visibleConversations.map((conv) => (
                  <ConversationRow
                    key={conv.id}
                    conversation={conv}
                    currentUserId={user?.id}
                    onTap={handleTapConversation}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
