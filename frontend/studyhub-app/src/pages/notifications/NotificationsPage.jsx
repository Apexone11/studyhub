/* ═══════════════════════════════════════════════════════════════════════════
 * NotificationsPage.jsx — Full-page notifications inbox (route: /notifications)
 *
 * Acts as the "View all" surface for the navbar bell dropdown. Adds:
 *   - Type-grouped filter chips (Social, Content, Groups, System)
 *   - Bulk actions (mark all read, clear all read)
 *   - Larger rows with type-coloured icons (light/dark token-driven)
 *   - Live socket push (no polling lag) + 30s polling fallback
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import UserAvatar from '../../components/UserAvatar'
import { Skeleton } from '../../components/Skeleton'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'
import { useLivePolling } from '../../lib/useLivePolling'
import { useSocket } from '../../lib/useSocket'
import { showToast } from '../../lib/toast'
import { SOCKET_EVENTS } from '../../lib/socketEvents'
import {
  getNotificationIcon,
  getNotificationTone,
  NOTIFICATION_TYPE_GROUPS,
  NOTIFICATION_GROUP_LABELS,
} from '../../lib/notificationIcons'
import { usePageTitle } from '../../lib/usePageTitle'
import { PageShell } from '../shared/pageScaffold'
import { authHeaders, timeAgo } from '../shared/pageUtils'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'social', label: NOTIFICATION_GROUP_LABELS.social },
  { id: 'content', label: NOTIFICATION_GROUP_LABELS.content },
  { id: 'groups', label: NOTIFICATION_GROUP_LABELS.groups },
  { id: 'sheets', label: NOTIFICATION_GROUP_LABELS.sheets },
  { id: 'ai', label: NOTIFICATION_GROUP_LABELS.ai },
  { id: 'system', label: NOTIFICATION_GROUP_LABELS.system },
]

export default function NotificationsPage() {
  usePageTitle('Notifications')
  const navigate = useNavigate()
  const { user } = useSession()
  const { socket } = useSocket()

  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [sessionExpired, setSessionExpired] = useState(false)
  const [loadError, setLoadError] = useState(false)

   
  useEffect(() => {
    if (user) {
      setSessionExpired(false)
      setLoadError(false)
    }
  }, [user])
   

  async function refresh({ signal, startTransition } = {}) {
    if (!user) return
    try {
      const res = await fetch(`${API}/api/notifications?limit=100`, {
        ...authHeaders(),
        credentials: 'include',
        signal,
      })
      // 401 means the session lapsed server-side — stop polling so we don't
      // hammer the API in a logout/reauth gap. The session context will pick
      // up the auth state on the next /api/auth/me check.
      if (res.status === 401) {
        setSessionExpired(true)
        setLoading(false)
        return
      }
      // Distinguish a server error from "genuinely empty inbox": if the
      // request fails with a 5xx, surface it instead of letting the empty
      // state pretend everything is fine.
      if (!res.ok) {
        setLoadError(true)
        setLoading(false)
        return
      }
      const data = await res.json()
      const apply = (fn) => (startTransition ? startTransition(fn) : fn())
      apply(() => {
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
        setLoading(false)
        setLoadError(false)
      })
    } catch {
      // Network failure or thrown error — surface the same staleness UI as
      // a 5xx response so users aren't misled by an empty state.
      setLoadError(true)
      setLoading(false)
    }
  }

  useLivePolling(refresh, { enabled: Boolean(user) && !sessionExpired, intervalMs: 30000 })

  /* Real-time push */
  useEffect(() => {
    if (!socket || !user) return
    const onNew = (incoming) => {
      if (!incoming || typeof incoming !== 'object') return
      setNotifications((prev) => {
        if (prev.some((n) => n.id === incoming.id)) return prev
        return [incoming, ...prev]
      })
      if (!incoming.read) setUnreadCount((c) => c + 1)
    }
    socket.on(SOCKET_EVENTS.NOTIFICATION_NEW, onNew)
    return () => socket.off(SOCKET_EVENTS.NOTIFICATION_NEW, onNew)
  }, [socket, user])

  const filtered = useMemo(() => {
    if (filter === 'all') return notifications
    if (filter === 'unread') return notifications.filter((n) => !n.read)
    const allowedTypes = NOTIFICATION_TYPE_GROUPS[filter] || []
    return notifications.filter((n) => allowedTypes.includes(n.type))
  }, [filter, notifications])

  // CLAUDE.md A4: never optimistically toggle state without awaiting the
  // server. The previous version of these handlers fired the PATCH/DELETE
  // and immediately set state, ignoring failures. A failed PATCH would
  // leave the UI green while the server still had unread rows; the next
  // polling cycle re-flipped them and the user thought the app was stuck.
  // Now: optimistic update for UX speed, ROLLBACK + toast on failure.
  async function markAllRead() {
    if (unreadCount === 0) return
    const snapshot = notifications
    const prevUnread = unreadCount
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
    try {
      const res = await fetch(`${API}/api/notifications/read-all`, {
        method: 'PATCH',
        ...authHeaders(),
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      setNotifications(snapshot)
      setUnreadCount(prevUnread)
      showToast('Could not mark all as read. Try again.', 'error')
    }
  }

  async function clearRead() {
    const snapshot = notifications
    setNotifications((prev) => prev.filter((n) => !n.read))
    try {
      const res = await fetch(`${API}/api/notifications/read`, {
        method: 'DELETE',
        ...authHeaders(),
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      setNotifications(snapshot)
      showToast('Could not clear read notifications.', 'error')
    }
  }

  async function markOneRead(notif) {
    if (!notif.read && user) {
      const snapshot = notifications
      const prevUnread = unreadCount
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)))
      setUnreadCount((c) => Math.max(0, c - 1))
      try {
        const res = await fetch(`${API}/api/notifications/${notif.id}/read`, {
          method: 'PATCH',
          ...authHeaders(),
          credentials: 'include',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } catch {
        setNotifications(snapshot)
        setUnreadCount(prevUnread)
        // Silent on this one — the user already navigated, a toast on a
        // background mark-read failure would be more confusing than helpful.
      }
    }
    if (typeof notif.linkPath === 'string' && notif.linkPath.startsWith('/')) {
      navigate(notif.linkPath)
    } else if (notif.sheetId && Number.isInteger(notif.sheetId)) {
      navigate(`/sheets/${notif.sheetId}`)
    } else if (notif.actor?.username && /^[A-Za-z0-9_.-]+$/.test(notif.actor.username)) {
      navigate(`/users/${notif.actor.username}`)
    }
  }

  async function deleteOne(e, notifId) {
    e.stopPropagation()
    const snapshot = notifications
    const prevUnread = unreadCount
    setNotifications((prev) => {
      const removed = prev.find((n) => n.id === notifId)
      if (removed && !removed.read) setUnreadCount((c) => Math.max(0, c - 1))
      return prev.filter((n) => n.id !== notifId)
    })
    try {
      const res = await fetch(`${API}/api/notifications/${notifId}`, {
        method: 'DELETE',
        ...authHeaders(),
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      setNotifications(snapshot)
      setUnreadCount(prevUnread)
      showToast('Could not delete notification.', 'error')
    }
  }

  if (!user) return null

  const readCount = notifications.filter((n) => n.read).length

  return (
    <PageShell nav={<Navbar />} sidebar={<AppSidebar />}>
      <div
        style={{
          background: 'var(--sh-surface)',
          border: '1px solid var(--sh-border)',
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--sh-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--sh-heading)',
                letterSpacing: '-0.01em',
              }}
            >
              Notifications
            </h1>
            <div style={{ marginTop: 4, fontSize: 13, color: 'var(--sh-muted)' }}>
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              {' · '}
              {notifications.length} total
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: 'var(--sh-soft)',
                  border: '1px solid var(--sh-border)',
                  color: 'var(--sh-text)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Mark all read
              </button>
            )}
            {readCount > 0 && (
              <button
                onClick={clearRead}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: 'transparent',
                  border: '1px solid var(--sh-border)',
                  color: 'var(--sh-muted)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Clear read
              </button>
            )}
          </div>
        </div>

        {/* Filter chips */}
        <div
          style={{
            padding: '12px 24px',
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--sh-border)',
            background: 'var(--sh-soft)',
          }}
          role="tablist"
          aria-label="Notification filters"
        >
          {FILTERS.map((f) => {
            const active = filter === f.id
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: active ? 'var(--sh-brand)' : 'var(--sh-surface)',
                  color: active ? 'var(--sh-on-brand, #ffffff)' : 'var(--sh-text)',
                  border: `1px solid ${active ? 'var(--sh-brand)' : 'var(--sh-border)'}`,
                  fontFamily: 'inherit',
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Staleness banner — show whenever a refresh fails, even if we
         * already have notifications cached from an earlier successful
         * load. Without this, a user with a non-empty inbox sees stale
         * data with zero indication that the most recent refresh failed. */}
        {loadError && notifications.length > 0 && (
          <div
            role="alert"
            style={{
              padding: '10px 24px',
              fontSize: 13,
              fontWeight: 600,
              background: 'var(--sh-warning-bg)',
              color: 'var(--sh-warning-text)',
              borderBottom: '1px solid var(--sh-border)',
              textAlign: 'center',
            }}
          >
            Showing cached notifications — the latest refresh failed. Pull to refresh or try again
            in a moment.
          </div>
        )}

        {/* List */}
        <div role="list">
          {loading ? (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Skeleton height={64} />
              <Skeleton height={64} />
              <Skeleton height={64} />
            </div>
          ) : loadError && filtered.length === 0 ? (
            <div
              role="alert"
              style={{
                padding: '40px 24px',
                textAlign: 'center',
                background: 'var(--sh-danger-bg)',
                color: 'var(--sh-danger-text)',
                border: '1px solid var(--sh-danger-border, var(--sh-border))',
                margin: 16,
                borderRadius: 12,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
                Could not load notifications
              </div>
              <div style={{ fontSize: 13 }}>
                The server returned an error. Try refreshing in a moment.
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: '64px 24px',
                textAlign: 'center',
                color: 'var(--sh-muted)',
              }}
            >
              <i
                className="fas fa-bell-slash"
                style={{
                  fontSize: 36,
                  display: 'block',
                  marginBottom: 12,
                  color: 'var(--sh-notif-empty-icon, var(--sh-muted))',
                }}
              ></i>
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--sh-text)' }}>
                {filter === 'unread' ? 'No unread notifications' : 'Nothing here yet'}
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                {filter === 'unread'
                  ? 'You are all caught up.'
                  : 'When activity reaches you, it will show up here.'}
              </div>
            </div>
          ) : (
            filtered.map((notif) => {
              const tone = getNotificationTone(notif.type, notif.priority)
              const labelText = `${notif.read ? '' : 'Unread: '}${notif.actor?.username || 'Someone'} ${notif.message}`
              return (
                <div
                  key={notif.id}
                  role="listitem button"
                  tabIndex={0}
                  aria-label={labelText}
                  onClick={() => markOneRead(notif)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      markOneRead(notif)
                    }
                  }}
                  style={{
                    padding: '16px 24px',
                    paddingRight: 56,
                    borderBottom: '1px solid var(--sh-border)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                    cursor: 'pointer',
                    background: notif.read ? 'transparent' : 'var(--sh-notif-unread-bg)',
                    position: 'relative',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = notif.read
                      ? 'var(--sh-soft)'
                      : 'var(--sh-notif-unread-hover)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = notif.read
                      ? 'transparent'
                      : 'var(--sh-notif-unread-bg)')
                  }
                >
                  {/* Type icon */}
                  <span
                    aria-hidden="true"
                    style={{
                      flex: '0 0 auto',
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: tone.bg,
                      color: tone.fg,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                    }}
                  >
                    <i className={getNotificationIcon(notif.type)}></i>
                  </span>

                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {notif.actor && (
                        <UserAvatar
                          username={notif.actor.username}
                          avatarUrl={notif.actor.avatarUrl}
                          size={20}
                        />
                      )}
                      <div
                        style={{
                          fontSize: 14,
                          color: 'var(--sh-text)',
                          lineHeight: 1.45,
                        }}
                      >
                        <strong>{notif.actor?.username || 'Someone'}</strong> {notif.message}
                      </div>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--sh-muted)' }}>
                      {timeAgo(notif.createdAt)}
                      {notif.priority === 'high' && (
                        <>
                          {' · '}
                          <span style={{ color: 'var(--sh-danger)', fontWeight: 600 }}>
                            High priority
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={(e) => deleteOne(e, notif.id)}
                    title="Delete notification"
                    aria-label="Delete notification"
                    style={{
                      position: 'absolute',
                      top: 14,
                      right: 16,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--sh-muted)',
                      fontSize: 18,
                      fontWeight: 700,
                      lineHeight: 1,
                      padding: '4px 8px',
                      borderRadius: 6,
                      opacity: 0.5,
                      transition: 'opacity .12s, color .12s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '1'
                      e.currentTarget.style.color = 'var(--sh-danger)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '0.5'
                      e.currentTarget.style.color = 'var(--sh-muted)'
                    }}
                  >
                    ×
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </PageShell>
  )
}
