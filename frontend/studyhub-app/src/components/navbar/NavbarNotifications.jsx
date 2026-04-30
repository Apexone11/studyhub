// src/components/NavbarNotifications.jsx
// Extracted from Navbar.jsx — notification bell + dropdown component.

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconBell } from '../Icons'
import { useSession } from '../../lib/session-context'
import { useLivePolling } from '../../lib/useLivePolling'
import { useSocket } from '../../lib/useSocket'
import { SOCKET_EVENTS } from '../../lib/socketEvents'
import { getNotificationIcon, getNotificationTone } from '../../lib/notificationIcons'
import { API } from '../../config'
import { S, handleIconHover, formatRelativeTime } from './navbarConstants'

export default function NavbarNotifications() {
  const navigate = useNavigate()
  const { user } = useSession()

  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showBell, setShowBell] = useState(false)
  const bellRef = useRef(null)

  async function refreshNotifications({ signal, startTransition } = {}) {
    if (!user) return

    const response = await fetch(`${API}/api/notifications?limit=15`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal,
    })
    if (!response.ok) return

    const data = await response.json()
    const nowMs = Date.now()

    // Guard against direct invocations that don't pass startTransition.
    // useLivePolling always provides it, but this also runs the function
    // safely under tests / future direct callers.
    const apply = (fn) => (typeof startTransition === 'function' ? startTransition(fn) : fn())
    apply(() => {
      setNotifications(
        (data.notifications || []).map((notif) => ({
          ...notif,
          timeAgoLabel: formatRelativeTime(notif.createdAt, nowMs),
        })),
      )
      setUnreadCount(data.unreadCount || 0)
    })
  }

  useLivePolling(refreshNotifications, {
    enabled: Boolean(user),
    intervalMs: 30000,
  })

  /* Real-time push: listen for `notification:new` on the user's personal socket
   * room. Polling stays as a 30s fallback so missed events still surface. The
   * subscription is silently a no-op if the socket isn't connected yet. */
  const { socket } = useSocket()
  useEffect(() => {
    if (!socket || !user) return
    const eventName = SOCKET_EVENTS.NOTIFICATION_NEW
    const onNew = (incoming) => {
      if (!incoming || typeof incoming !== 'object') return
      setNotifications((prev) => {
        if (prev.some((n) => n.id === incoming.id)) return prev
        const enriched = {
          ...incoming,
          timeAgoLabel: formatRelativeTime(incoming.createdAt || new Date(), Date.now()),
        }
        return [enriched, ...prev].slice(0, 30)
      })
      if (!incoming.read) setUnreadCount((c) => c + 1)
    }
    socket.on(eventName, onNew)
    return () => {
      socket.off(eventName, onNew)
    }
  }, [socket, user])

  // close dropdown on outside click or Escape key
  useEffect(() => {
    if (!showBell) return
    function onClickOutside(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) setShowBell(false)
    }
    function onEscapeKey(e) {
      if (e.key === 'Escape') setShowBell(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscapeKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEscapeKey)
    }
  }, [showBell])

  async function markAllRead() {
    if (!user) return
    await fetch(`${API}/api/notifications/read-all`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    }).catch(() => {})
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  async function clearRead() {
    if (!user) return
    await fetch(`${API}/api/notifications/read`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    }).catch(() => {})
    setNotifications((prev) => prev.filter((n) => !n.read))
  }

  async function deleteOne(e, notifId) {
    e.stopPropagation()
    if (!user) return
    fetch(`${API}/api/notifications/${notifId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    }).catch(() => {})
    setNotifications((prev) => {
      const removed = prev.find((n) => n.id === notifId)
      if (removed && !removed.read) setUnreadCount((c) => Math.max(0, c - 1))
      return prev.filter((n) => n.id !== notifId)
    })
  }

  async function markOneRead(notif) {
    if (!notif.read && user) {
      fetch(`${API}/api/notifications/${notif.id}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      }).catch(() => {})
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)))
      setUnreadCount((c) => Math.max(0, c - 1))
    }
    setShowBell(false)
    /* Validate before navigate — linkPath comes from the socket payload and
     * must be a same-origin app path. A malformed value (absolute URL or
     * scheme) is silently ignored rather than handed to navigate(). */
    if (typeof notif.linkPath === 'string' && notif.linkPath.startsWith('/')) {
      navigate(notif.linkPath)
    } else if (notif.sheetId && Number.isInteger(notif.sheetId)) {
      navigate(`/sheets/${notif.sheetId}`)
    } else if (notif.actor?.username && /^[A-Za-z0-9_.-]+$/.test(notif.actor.username)) {
      navigate(`/users/${notif.actor.username}`)
    }
  }

  if (!user) return null

  const readCount = notifications.filter((n) => n.read).length

  return (
    <div ref={bellRef} style={{ position: 'relative' }}>
      <button
        style={S.iconBtn}
        title="Notifications"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        aria-expanded={showBell}
        aria-haspopup="true"
        onClick={() => setShowBell((v) => !v)}
        onMouseEnter={(e) => handleIconHover(e, true)}
        onMouseLeave={(e) => handleIconHover(e, false)}
      >
        <IconBell size={17} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              background: 'var(--sh-nav-badge-bg)',
              color: 'var(--sh-nav-text)',
              fontSize: 10,
              fontWeight: 800,
              borderRadius: 99,
              minWidth: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
              lineHeight: 1,
            }}
            aria-live="polite"
            aria-label={`${unreadCount} unread notifications`}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showBell && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 'clamp(280px, 90vw, 320px)',
            background: 'var(--sh-dropdown-bg)',
            borderRadius: 12,
            border: '1px solid var(--sh-dropdown-border)',
            boxShadow: 'var(--sh-dropdown-shadow)',
            zIndex: 200,
            overflow: 'hidden',
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          }}
        >
          {/* header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--sh-dropdown-divider)',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--sh-text)' }}>
              Notifications
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{
                    fontSize: 11,
                    color: 'var(--sh-link)',
                    fontWeight: 600,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    padding: 0,
                  }}
                >
                  Mark all read
                </button>
              )}
              {readCount > 0 && (
                <button
                  onClick={clearRead}
                  style={{
                    fontSize: 11,
                    color: 'var(--sh-muted)',
                    fontWeight: 600,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    padding: 0,
                  }}
                >
                  Clear read
                </button>
              )}
            </div>
          </div>

          {/* list */}
          <div style={{ maxHeight: 340, overflowY: 'auto' }} role="list">
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: '28px 16px',
                  textAlign: 'center',
                  color: 'var(--sh-muted)',
                  fontSize: 13,
                }}
              >
                <i
                  className="fas fa-bell-slash"
                  style={{
                    fontSize: 22,
                    display: 'block',
                    marginBottom: 8,
                    color: 'var(--sh-notif-empty-icon)',
                  }}
                ></i>
                No notifications yet
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${notif.read ? '' : 'Unread: '}${notif.actor?.username || 'Someone'} ${notif.message}`}
                  onClick={() => markOneRead(notif)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      markOneRead(notif)
                    }
                  }}
                  style={{
                    padding: '12px 16px',
                    paddingRight: 36,
                    borderBottom: '1px solid var(--sh-dropdown-divider)',
                    cursor: 'pointer',
                    background: notif.read
                      ? 'var(--sh-notif-read-bg)'
                      : 'var(--sh-notif-unread-bg)',
                    borderLeft: notif.read
                      ? '3px solid transparent'
                      : `3px solid ${notif.priority === 'high' ? 'var(--sh-danger)' : 'var(--sh-link)'}`,
                    transition: 'background .12s',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = notif.read
                      ? 'var(--sh-notif-read-hover)'
                      : 'var(--sh-notif-unread-hover)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = notif.read
                      ? 'var(--sh-notif-read-bg)'
                      : 'var(--sh-notif-unread-bg)')
                  }
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      marginBottom: 4,
                    }}
                  >
                    {(() => {
                      const tone = getNotificationTone(notif.type, notif.priority)
                      return (
                        <span
                          aria-hidden="true"
                          style={{
                            flex: '0 0 auto',
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: tone.bg,
                            color: tone.fg,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 13,
                            marginTop: 1,
                          }}
                        >
                          <i className={getNotificationIcon(notif.type)}></i>
                        </span>
                      )
                    })()}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--sh-text)',
                          lineHeight: 1.4,
                        }}
                      >
                        <strong>{notif.actor?.username || 'Someone'}</strong> {notif.message}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--sh-muted)', marginTop: 2 }}>
                        {notif.timeAgoLabel || 'just now'}
                      </div>
                    </div>
                  </div>
                  {/* X delete button */}
                  <button
                    onClick={(e) => deleteOne(e, notif.id)}
                    title="Delete notification"
                    aria-label="Delete notification"
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--sh-muted)',
                      fontSize: 14,
                      fontWeight: 700,
                      lineHeight: 1,
                      padding: '2px 4px',
                      borderRadius: 4,
                      opacity: 0.5,
                      transition: 'opacity .12s',
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
              ))
            )}
          </div>

          {/* footer link to full notifications page */}
          <button
            onClick={() => {
              setShowBell(false)
              navigate('/notifications')
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'center',
              padding: '10px 16px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--sh-link)',
              background: 'var(--sh-soft)',
              border: 'none',
              borderTop: '1px solid var(--sh-dropdown-divider)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  )
}
