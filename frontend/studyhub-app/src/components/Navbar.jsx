// src/components/Navbar.jsx
// PATCH v2 — consistent nav on every page
// Changes from v1:
//  - Auto-detects current page from useLocation for breadcrumb
//  - Optional inline tab bar (Sheets page uses Browse/My/Starred)
//  - Optional right-side actions slot
//  - Uses custom Icons from Icons.jsx instead of Font Awesome
//  - Shared responsive sizing for landing + app nav states

import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LogoMark,
  IconSearch,
  IconBell,
  IconChevronDown,
} from './Icons'
import { pageWidths } from '../lib/ui'
import { API } from '../config'

// ─── NAV CONFIG ───────────────────────────────────────────────────
// Maps route patterns → { crumbs, tabs, backTo }
// Pages can override these via props.
const ROUTE_CONFIG = {
  '/feed':          { crumbs: [] },
  '/sheets':        {
    crumbs: [{ label: 'Study Sheets', to: '/sheets' }],
    tabs: [
      { label: 'Browse',    to: '/sheets' },
      { label: 'My Sheets', to: '/sheets?mine=1' },
      { label: 'Starred',   to: '/sheets?starred=1' },
    ],
    backTo: '/feed',
  },
  '/sheets/upload': {
    crumbs: [
      { label: 'Study Sheets', to: '/sheets' },
      { label: 'New Sheet',    to: null },
    ],
    backTo: '/sheets',
  },
  '/tests':         { crumbs: [{ label: 'Practice Tests',  to: '/tests' }],         backTo: '/feed' },
  '/notes':         { crumbs: [{ label: 'My Notes',        to: '/notes' }],         backTo: '/feed' },
  '/announcements': { crumbs: [{ label: 'Announcements',   to: '/announcements' }], backTo: '/feed' },
  '/submit':        { crumbs: [{ label: 'Submit Request',  to: '/submit' }],         backTo: '/feed' },
  '/admin':         { crumbs: [{ label: 'Admin',           to: '/admin' }],          backTo: '/feed' },
  '/dashboard':     { crumbs: [{ label: 'Profile',         to: '/dashboard' }],      backTo: '/feed' },
}

function getConfig(pathname) {
  // exact match first
  if (ROUTE_CONFIG[pathname]) return ROUTE_CONFIG[pathname]
  // prefix match (e.g. /sheets/42)
  for (const key of Object.keys(ROUTE_CONFIG)) {
    if (pathname.startsWith(key + '/')) return ROUTE_CONFIG[key]
  }
  return {}
}

// ─── STYLES ───────────────────────────────────────────────────────
const S = {
  nav: {
    background: '#0f172a',
    borderBottom: '1px solid #1e293b',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  },
  topRow: {
    height: 56,
    display: 'flex',
    alignItems: 'center',
    padding: '0 24px',
    gap: 10,
    maxWidth: 1400,
    margin: '0 auto',
  },
  sep: {
    color: '#1e3a5f',
    fontSize: 18,
    userSelect: 'none',
  },
  crumbLink: {
    fontSize: 13,
    color: '#64748b',
    textDecoration: 'none',
    transition: 'color .15s',
  },
  crumbActive: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: 600,
  },
  searchBox: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 8,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    padding: '0 10px',
    gap: 7,
    width: 200,
    cursor: 'text',
  },
  searchText: {
    fontSize: 12,
    color: '#475569',
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    padding: 5,
    borderRadius: 7,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#64748b',
    transition: 'background .15s, color .15s',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: '#0f172a',
    border: '1.5px solid #3b82f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  },
  username: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: 600,
  },
  tabsRow: {
    borderTop: '1px solid #1e293b',
    padding: '0 24px',
    maxWidth: 1400,
    margin: '0 auto',
    display: 'flex',
    gap: 2,
  },
  tab: {
    fontSize: 12,
    fontWeight: 600,
    padding: '7px 12px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: '#64748b',
    borderBottom: '2px solid transparent',
    transition: 'color .15s, border-color .15s',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    textDecoration: 'none',
    display: 'inline-block',
  },
  tabActive: {
    color: '#3b82f6',
    borderBottom: '2px solid #3b82f6',
  },
}

// ─── COMPONENT ────────────────────────────────────────────────────
/**
 * Props:
 *  crumbs        — override auto-detected breadcrumb [{label, to}]
 *  extraCrumb    — append one more crumb (e.g. sheet title) — string or null
 *  tabs          — override tab list [{label, to}]  (null = no tab bar)
 *  actions       — React node — injected right side (Upload button, Publish, etc.)
 *  hideTabs      — force-hide the tab bar even if config has tabs
 *  hideSearch    — hide search box (e.g. SheetViewer uses nav action buttons instead)
 *  autoSave      — show "Auto-saving…" indicator (Upload page)
 */
export default function Navbar({
  crumbs: crumbsProp,
  extraCrumb,
  tabs: tabsProp,
  actions,
  hideTabs = false,
  hideSearch = false,
  autoSave = false,
  variant = 'app',
}) {
  const location  = useLocation()
  const navigate  = useNavigate()
  const config    = getConfig(location.pathname)

  const crumbs    = crumbsProp ?? config.crumbs ?? []
  const tabs      = (!hideTabs && (tabsProp ?? config.tabs)) || null
  const backTo    = config.backTo
  const isLanding = variant === 'landing'
  const shellWidth = isLanding ? pageWidths.landing : pageWidths.app

  // user info from localStorage (set on login)
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
  })()
  const initials = user?.username?.slice(0, 2).toUpperCase() || '??'

  // notification bell state
  const [notifications, setNotifications] = useState([])
  const [unreadCount,   setUnreadCount]   = useState(0)
  const [showBell,      setShowBell]      = useState(false)
  const bellRef = useRef(null)

  useEffect(() => {
    if (!user) return
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(`${API}/api/notifications?limit=15`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    const token = localStorage.getItem('token')
    if (!token) return
    await fetch(`${API}/api/notifications/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {})
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  async function markOneRead(notif) {
    const token = localStorage.getItem('token')
    if (!notif.read && token) {
      fetch(`${API}/api/notifications/${notif.id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n))
      setUnreadCount(c => Math.max(0, c - 1))
    }
    setShowBell(false)
    if (notif.sheetId) navigate(`/sheets/${notif.sheetId}`)
    else if (notif.actorId) navigate(`/users/${notif.actor?.username || ''}`)
  }

  function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }
  const rowStyle = {
    ...S.topRow,
    height: isLanding ? 'clamp(68px, 7vw, 90px)' : 'clamp(60px, 5vw, 74px)',
    padding: '0 clamp(16px, 2.5vw, 40px)',
    maxWidth: shellWidth,
    gap: isLanding ? 16 : 10,
  }
  const searchBoxStyle = {
    ...S.searchBox,
    width: isLanding ? 'clamp(240px, 30vw, 620px)' : 'clamp(180px, 22vw, 520px)',
    height: isLanding ? 'clamp(40px, 4vw, 52px)' : 'clamp(34px, 3vw, 44px)',
    borderRadius: isLanding ? 16 : 10,
    padding: isLanding ? '0 14px' : '0 10px',
    marginLeft: isLanding ? 'auto' : undefined,
    marginRight: isLanding ? 'auto' : undefined,
  }
  const wordmarkStyle = {
    fontSize: isLanding ? 'clamp(16px, 1vw + 12px, 22px)' : 15,
    fontWeight: 800,
    color: '#fff',
    letterSpacing: '-0.02em',
  }
  const searchTextStyle = {
    ...S.searchText,
    fontSize: isLanding ? 'clamp(12px, 0.8vw + 8px, 15px)' : 12,
  }
  const publicGhostBtn = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: isLanding ? 'clamp(40px, 4vw, 52px)' : 36,
    padding: isLanding ? '0 clamp(16px, 1.8vw, 28px)' : '0 12px',
    borderRadius: isLanding ? 16 : 10,
    border: '1px solid rgba(255,255,255,0.16)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff',
    fontSize: isLanding ? 'clamp(13px, 0.8vw + 8px, 17px)' : 12,
    fontWeight: 600,
    textDecoration: 'none',
    transition: 'background .15s, border-color .15s',
  }
  const publicPrimaryBtn = {
    ...publicGhostBtn,
    border: '1px solid transparent',
    background: '#3b82f6',
    fontWeight: 700,
  }

  function handleIconHover(e, enter) {
    e.currentTarget.style.background = enter ? '#1e293b' : 'transparent'
    e.currentTarget.style.color      = enter ? '#94a3b8' : '#64748b'
  }

  return (
    <nav style={S.nav}>
      {/* — top row — */}
      <div style={rowStyle}>

        {/* logo */}
        <Link to={user ? '/feed' : '/'} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <LogoMark size={isLanding ? 34 : 28} />
          <span style={wordmarkStyle}>
            Study<span style={{ color: '#3b82f6' }}>Hub</span>
          </span>
        </Link>

        {/* breadcrumbs */}
        {crumbs.map((crumb, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={S.sep}>/</span>
            {crumb.to
              ? <Link to={crumb.to} style={S.crumbLink}
                  onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
                  onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
                >{crumb.label}</Link>
              : <span style={S.crumbActive}>{crumb.label}</span>
            }
          </span>
        ))}

        {/* dynamic extra crumb (e.g. sheet title on /sheets/:id) */}
        {extraCrumb && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={S.sep}>/</span>
            <span style={{ ...S.crumbActive, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {extraCrumb}
            </span>
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* auto-save indicator */}
        {autoSave && (
          <span style={{ fontSize: 11, color: '#64748b', marginRight: 4 }}>
            ✦ Auto-saving…
          </span>
        )}

        {/* search box — hide on auth pages where it's irrelevant */}
        {!hideSearch && location.pathname !== '/login' && location.pathname !== '/register'
          && location.pathname !== '/forgot-password' && location.pathname !== '/reset-password' && (
          <div className={isLanding ? 'sh-landing-search' : undefined} style={searchBoxStyle} onClick={() => {}}>
            <IconSearch size={13} style={{ color: '#475569', flexShrink: 0 }} />
            <span style={searchTextStyle}>Search sheets, courses...</span>
          </div>
        )}

        {!user && isLanding && <div style={{ flex: 1 }} />}

        {/* actions slot (Upload button, Publish, etc.) */}
        {actions}

        {/* back link (when no actions) */}
        {!actions && backTo && (
          <Link to={backTo} style={{
            fontSize: 12, color: '#64748b', textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'color .15s',
          }}
            onMouseEnter={e => e.currentTarget.style.color = '#94a3b8'}
            onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
          >
            ← {backTo === '/feed' ? 'Feed' : backTo === '/sheets' ? 'Sheets' : 'Back'}
          </Link>
        )}

        {/* notification bell */}
        {user && (
          <div ref={bellRef} style={{ position: 'relative' }}>
            <button
              style={S.iconBtn}
              title="Notifications"
              onClick={() => setShowBell(v => !v)}
              onMouseEnter={e => handleIconHover(e, true)}
              onMouseLeave={e => handleIconHover(e, false)}
            >
              <IconBell size={17} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: 2, right: 2,
                  background: '#ef4444', color: '#fff',
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
                width: 320, background: '#fff', borderRadius: 12,
                border: '1px solid #e2e8f0',
                boxShadow: '0 8px 32px rgba(15,23,42,0.18)',
                zIndex: 200, overflow: 'hidden',
                fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
              }}>
                {/* header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderBottom: '1px solid #f1f5f9',
                }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} style={{
                      fontSize: 12, color: '#3b82f6', fontWeight: 600,
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
                      <div style={{ padding: '28px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                        <i className="fas fa-bell-slash" style={{ fontSize: 22, display: 'block', marginBottom: 8, color: '#cbd5e1' }}></i>
                        No notifications yet
                      </div>
                    )
                    : notifications.map(notif => (
                      <div
                        key={notif.id}
                        onClick={() => markOneRead(notif)}
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid #f8fafc',
                          cursor: 'pointer',
                          background: notif.read ? '#fff' : '#f0f7ff',
                          borderLeft: notif.read ? '3px solid transparent' : '3px solid #3b82f6',
                          transition: 'background .12s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = notif.read ? '#f8fafc' : '#e8f0fe'}
                        onMouseLeave={e => e.currentTarget.style.background = notif.read ? '#fff' : '#f0f7ff'}
                      >
                        <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.4, marginBottom: 4 }}>
                          <strong>{notif.actor?.username || 'Someone'}</strong> {notif.message}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{timeAgo(notif.createdAt)}</div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        )}

        {/* user avatar + name */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            onClick={() => navigate('/dashboard')}
          >
            <div style={S.avatar}>{initials}</div>
            <span style={S.username}>{user.username}</span>
            <IconChevronDown size={13} style={{ color: '#475569' }} />
          </div>
        )}

        {/* larger landing auth actions */}
        {!user && isLanding && (
          <div className="sh-landing-actions">
            <Link
              to="/login"
              style={publicGhostBtn}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'
              }}
            >
              Log in
            </Link>
            <Link
              to="/register"
              style={publicPrimaryBtn}
              onMouseEnter={e => { e.currentTarget.style.background = '#2563eb' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#3b82f6' }}
            >
              Get Started
            </Link>
          </div>
        )}

        {/* contextual auth links on public pages */}
        {!user && !isLanding && (
          location.pathname === '/login' ? (
            <Link to="/register" style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6', textDecoration: 'none' }}>
              Create account →
            </Link>
          ) : location.pathname === '/register' ? (
            <Link to="/login" style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6', textDecoration: 'none' }}>
              Sign in →
            </Link>
          ) : location.pathname === '/forgot-password' || location.pathname === '/reset-password' ? (
            <Link to="/login" style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6', textDecoration: 'none' }}>
              Back to login
            </Link>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Link to="/login" style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textDecoration: 'none' }}>Log in</Link>
              <Link to="/register" style={{ fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'none', background: '#3b82f6', padding: '5px 12px', borderRadius: 7 }}>Get Started</Link>
            </div>
          )
        )}

      </div>

      {/* — tabs row (only if tabs configured) — */}
      {tabs && (
        <div style={{ borderTop: '1px solid #1e293b' }}>
          <div style={{ ...S.tabsRow, maxWidth: pageWidths.app, padding: '0 clamp(16px, 2.5vw, 40px)' }}>
            {tabs.map(tab => {
              const isActive = location.pathname + location.search === tab.to
                || (tab.to === '/sheets' && location.pathname === '/sheets' && !location.search)
              return (
                <Link
                  key={tab.label}
                  to={tab.to}
                  style={{
                    ...S.tab,
                    ...(isActive ? S.tabActive : {}),
                  }}
                >
                  {tab.label}
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </nav>
  )
}
