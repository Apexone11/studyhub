// src/components/NavbarNotifications.jsx
// Extracted from Navbar.jsx — notification bell + dropdown component.

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconBell } from './Icons'
import { useSession } from '../lib/session-context'
import { useLivePolling } from '../lib/useLivePolling'
import { API } from '../config'
import { S, handleIconHover, formatRelativeTime } from './navbarConstants'

export default function NavbarNotifications() {
  const navigate = useNavigate()
  const { user } = useSession()

  const [notifications, setNotifications] = useState([])
  const [unreadCount,   setUnreadCount]   = useState(0)
  const [showBell,      setShowBell]      = useState(false)
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

    startTransition(() => {
      setNotifications((data.notifications || []).map((notif) => ({
        ...notif,
        timeAgoLabel: formatRelativeTime(notif.createdAt, nowMs),
      })))
      setUnreadCount(data.unreadCount || 0)
    })
  }

  useLivePolling(refreshNotifications, {
    enabled: Boolean(user),
    intervalMs: 30000,
  })

  // close dropdown on outside click
  useEffect(() => {
    if (!showBell) return
    function onClickOutside(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) setShowBell(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showBell])

  async function markAllRead() {
    if (!user) return
    await fetch(`${API}/api/notifications/read-all`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    }).catch(() => {})
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  async function markOneRead(notif) {
    if (!notif.read && user) {
      fetch(`${API}/api/notifications/${notif.id}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      }).catch(() => {})
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n))
      setUnreadCount(c => Math.max(0, c - 1))
    }
    setShowBell(false)
    if (notif.linkPath) navigate(notif.linkPath)
    else if (notif.sheetId) navigate(`/sheets/${notif.sheetId}`)
    else if (notif.actor?.username) navigate(`/users/${notif.actor.username}`)
  }

  if (!user) return null

  return (
    <div ref={bellRef} style={{ position: 'relative' }}>
      <button
        style={S.iconBtn}
        title="Notifications"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        aria-expanded={showBell}
        aria-haspopup="true"
        onClick={() => setShowBell(v => !v)}
        onMouseEnter={e => handleIconHover(e, true)}
        onMouseLeave={e => handleIconHover(e, false)}
      >
        <IconBell size={17} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            background: 'var(--sh-nav-badge-bg)', color: 'var(--sh-nav-text)',
            fontSize: 10, fontWeight: 800,
            borderRadius: 99, minWidth: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', lineHeight: 1,
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showBell && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 'clamp(280px, 90vw, 320px)', background: 'var(--sh-dropdown-bg)', borderRadius: 12,
          border: '1px solid var(--sh-dropdown-border)',
          boxShadow: 'var(--sh-dropdown-shadow)',
          zIndex: 200, overflow: 'hidden',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}>
          {/* header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid var(--sh-dropdown-divider)',
          }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--sh-text)' }}>Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{
                fontSize: 12, color: 'var(--sh-link)', fontWeight: 600,
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
                Mark all read
              </button>
            )}
          </div>

          {/* list */}
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {notifications.length === 0
              ? (
                <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--sh-muted)', fontSize: 13 }}>
                  <i className="fas fa-bell-slash" style={{ fontSize: 22, display: 'block', marginBottom: 8, color: 'var(--sh-notif-empty-icon)' }}></i>
                  No notifications yet
                </div>
              )
              : notifications.map(notif => (
                <div
                  key={notif.id}
                  onClick={() => markOneRead(notif)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--sh-dropdown-divider)',
                    cursor: 'pointer',
                    background: notif.read ? 'var(--sh-notif-read-bg)' : 'var(--sh-notif-unread-bg)',
                    borderLeft: notif.read ? '3px solid transparent' : '3px solid var(--sh-link)',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = notif.read ? 'var(--sh-notif-read-hover)' : 'var(--sh-notif-unread-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = notif.read ? 'var(--sh-notif-read-bg)' : 'var(--sh-notif-unread-bg)'}
                >
                  <div style={{ fontSize: 13, color: 'var(--sh-text)', lineHeight: 1.4, marginBottom: 4 }}>
                    <strong>{notif.actor?.username || 'Someone'}</strong> {notif.message}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>{notif.timeAgoLabel || 'just now'}</div>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}
