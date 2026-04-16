// src/mobile/pages/MobileMessagesPage.jsx
// Messages tab — conversation list with real-time unread badges.
// Tapping a conversation navigates to the web thread view (for now).

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import anime from '../lib/animeCompat'
import { useSession } from '../../lib/session-context'
import { API } from '../../config'
import MobileTopBar from '../components/MobileTopBar'
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

function formatTime(isoStr) {
  if (!isoStr) return ''
  const date = new Date(isoStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/* ── Avatar component ──────────────────────────────────────────── */

function ConversationAvatar({ conversation, currentUserId }) {
  // For DMs, show the other participant's avatar
  const otherUser =
    conversation.type === 'dm'
      ? conversation.participants?.find((p) => p.id !== currentUserId)
      : null

  const avatarUrl = otherUser?.avatarUrl || conversation.avatarUrl
  const name = otherUser?.username || conversation.name || '?'
  const initial = name.charAt(0).toUpperCase()

  if (avatarUrl) {
    return (
      <div className="mob-msg-avatar">
        <img src={avatarUrl} alt="" className="mob-msg-avatar-img" />
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
  const preview = lastMsg
    ? (lastMsg.sender?.id === currentUserId ? 'You: ' : '') + (lastMsg.content?.slice(0, 60) || '')
    : 'No messages yet'

  const time = lastMsg ? formatTime(lastMsg.createdAt) : ''
  const unread = conversation.unreadCount || 0

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
          <span className="mob-msg-row-preview">{preview}</span>
          {unread > 0 && <span className="mob-msg-row-badge">{unread > 99 ? '99+' : unread}</span>}
        </div>
      </div>
    </button>
  )
}

/* ── Empty state ───────────────────────────────────────────────── */

function EmptyMessages() {
  return (
    <div className="mob-feed-empty">
      <div className="mob-feed-empty-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="mob-feed-empty-title">No conversations yet</h3>
      <p className="mob-feed-empty-text">
        Start a conversation from someone's profile or study group.
      </p>
    </div>
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

export default function MobileMessagesPage() {
  const { user } = useSession()
  const navigate = useNavigate()

  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
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

  return (
    <>
      <MobileTopBar title="Messages" />
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
          <div className="mob-feed-empty">
            <p className="mob-feed-empty-text">Could not load messages.</p>
          </div>
        ) : conversations.length === 0 ? (
          <EmptyMessages />
        ) : (
          <div ref={listRef} className="mob-msg-list">
            {conversations.map((conv) => (
              <ConversationRow
                key={conv.id}
                conversation={conv}
                currentUserId={user?.id}
                onTap={handleTapConversation}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
