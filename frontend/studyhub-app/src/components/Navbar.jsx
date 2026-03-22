// src/components/Navbar.jsx
// PATCH v2 — consistent nav on every page
// Changes from v1:
//  - Auto-detects current page from useLocation for breadcrumb
//  - Optional inline tab bar (Sheets page uses Browse/My/Starred)
//  - Optional right-side actions slot
//  - Uses custom Icons from Icons.jsx instead of Font Awesome
//  - Shared responsive sizing for landing + app nav states

import { useState, useEffect, useRef, Fragment } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LogoMark,
  IconSearch,
  IconBell,
  IconChevronDown,
} from './Icons'
import SearchModal from './SearchModal'
import KeyboardShortcuts from './KeyboardShortcuts'
import { pageWidths } from '../lib/ui'
import { useSession } from '../lib/session-context'
import { useLivePolling } from '../lib/useLivePolling'
import { API } from '../config'
import EmailVerificationBanner from './EmailVerificationBanner'

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

function formatRelativeTime(iso, nowMs) {
  const diff = nowMs - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
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
    background: 'var(--sh-nav-bg)',
    borderBottom: '1px solid var(--sh-nav-border)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  },
  topRow: {
    height: 56,
    display: 'flex',
    alignItems: 'center',
    padding: '0 clamp(12px, 3vw, 24px)',
    gap: 10,
    maxWidth: 1400,
    margin: '0 auto',
  },
  sep: {
    color: 'var(--sh-nav-border)',
    fontSize: 18,
    userSelect: 'none',
  },
  crumbLink: {
    fontSize: 13,
    color: 'var(--sh-nav-muted)',
    textDecoration: 'none',
    transition: 'color .15s',
  },
  crumbActive: {
    fontSize: 13,
    color: 'var(--sh-nav-accent)',
    fontWeight: 600,
  },
  searchBox: {
    background: 'var(--sh-nav-search-bg)',
    border: '1px solid var(--sh-nav-search-border)',
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
    color: 'var(--sh-nav-search-text)',
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    padding: 8,
    borderRadius: 7,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--sh-nav-muted)',
    transition: 'background .15s, color .15s',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'var(--sh-nav-bg)',
    border: '1.5px solid var(--sh-nav-tab-active)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--sh-nav-text)',
    flexShrink: 0,
  },
  username: {
    fontSize: 12,
    color: 'var(--sh-nav-accent)',
    fontWeight: 600,
  },
  userMenu: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    minWidth: 180,
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
    padding: '6px 0',
    zIndex: 1100,
  },
  userMenuItem: {
    display: 'block',
    width: '100%',
    padding: '9px 16px',
    border: 'none',
    background: 'none',
    textAlign: 'left',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--sh-text)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  tabsRow: {
    borderTop: '1px solid var(--sh-nav-border)',
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
    color: 'var(--sh-nav-muted)',
    borderBottom: '2px solid transparent',
    transition: 'color .15s, border-color .15s',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    textDecoration: 'none',
    display: 'inline-block',
  },
  tabActive: {
    color: 'var(--sh-nav-tab-active)',
    borderBottom: '2px solid var(--sh-nav-tab-active)',
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

  const { crumbs: configCrumbs, tabs: configTabs, backTo } = config
  const crumbs    = crumbsProp ?? configCrumbs ?? []
  const tabs      = (!hideTabs && (tabsProp ?? configTabs)) || null
  const isLanding = variant === 'landing'
  const shellWidth = isLanding ? pageWidths.landing : pageWidths.app

  // user info from localStorage (set on login)
  const { user } = useSession()
  const initials = user?.username?.slice(0, 2).toUpperCase() || '??'

  // user menu dropdown state
  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuRef = useRef(null)
  const { signOut } = useSession()

  // search modal state
  const [searchOpen, setSearchOpen] = useState(false)

  // Global Ctrl+K / Cmd+K shortcut to open search
  useEffect(() => {
    function onGlobalKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onGlobalKey)
    return () => document.removeEventListener('keydown', onGlobalKey)
  }, [])

  // notification bell state
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

  // close user menu dropdown on outside click
  useEffect(() => {
    if (!showUserMenu) return
    function onClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showUserMenu])

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
    height: isLanding ? 'clamp(40px, 4vw, 52px)' : 'clamp(38px, 3vw, 44px)',
    borderRadius: isLanding ? 16 : 10,
    padding: isLanding ? '0 14px' : '0 10px',
    marginLeft: isLanding ? 'auto' : undefined,
    marginRight: isLanding ? 'auto' : undefined,
  }
  const wordmarkStyle = {
    fontSize: isLanding ? 'clamp(16px, 1vw + 12px, 22px)' : 15,
    fontWeight: 800,
    color: 'var(--sh-nav-text)',
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
    color: 'var(--sh-nav-text)',
    fontSize: isLanding ? 'clamp(13px, 0.8vw + 8px, 17px)' : 12,
    fontWeight: 600,
    textDecoration: 'none',
    transition: 'background .15s, border-color .15s',
  }
  const publicPrimaryBtn = {
    ...publicGhostBtn,
    border: '1px solid transparent',
    background: 'var(--sh-brand)',
    fontWeight: 700,
  }

  function handleIconHover(e, enter) {
    e.currentTarget.style.background = enter ? 'var(--sh-nav-search-bg)' : 'transparent'
    e.currentTarget.style.color      = enter ? 'var(--sh-nav-accent)' : 'var(--sh-nav-muted)'
  }

  return (
    <Fragment>
    <nav style={S.nav} aria-label="Main navigation">
      {/* — top row — */}
      <div style={rowStyle}>

        {/* logo */}
        <Link to={user ? '/feed' : '/'} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <LogoMark size={isLanding ? 34 : 28} />
          <span style={wordmarkStyle}>
            Study<span style={{ color: 'var(--sh-nav-tab-active)' }}>Hub</span>
          </span>
        </Link>

        {/* breadcrumbs */}
        {crumbs.map((crumb, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={S.sep}>/</span>
            {crumb.to
              ? <Link to={crumb.to} style={S.crumbLink}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--sh-nav-muted-hover)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--sh-nav-muted)'}
                >{crumb.label}</Link>
              : <span style={S.crumbActive}>{crumb.label}</span>
            }
          </span>
        ))}

        {/* dynamic extra crumb (e.g. sheet title on /sheets/:id) */}
        {extraCrumb && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={S.sep}>/</span>
            <span style={{ ...S.crumbActive, maxWidth: 'clamp(120px, 30vw, 220px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {extraCrumb}
            </span>
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* auto-save indicator */}
        {autoSave && (
          <span style={{ fontSize: 11, color: 'var(--sh-nav-muted)', marginRight: 4 }}>
            ✦ Auto-saving…
          </span>
        )}

        {/* search box — hide on auth pages where it's irrelevant */}
        {!hideSearch && location.pathname !== '/login' && location.pathname !== '/register'
          && location.pathname !== '/forgot-password' && location.pathname !== '/reset-password' && (
          <div
            className={isLanding ? 'sh-landing-search' : undefined}
            style={searchBoxStyle}
            onClick={() => setSearchOpen(true)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSearchOpen(true) } }}
            role="button"
            tabIndex={0}
            aria-label="Open search"
            data-search-trigger
          >
            <IconSearch size={13} style={{ color: 'var(--sh-nav-search-text)', flexShrink: 0 }} aria-hidden="true" />
            <span style={searchTextStyle}>Search sheets, courses...</span>
            <kbd className="sh-kbd-hint" aria-hidden="true">{navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl+'}K</kbd>
          </div>
        )}
        <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
        <KeyboardShortcuts />

        {!user && isLanding && <div style={{ flex: 1 }} />}

        {/* actions slot (Upload button, Publish, etc.) */}
        {actions}

        {/* back link (when no actions) */}
        {!actions && backTo && (
          <Link to={backTo} style={{
            fontSize: 12, color: 'var(--sh-nav-muted)', textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'color .15s',
          }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--sh-nav-accent)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--sh-nav-muted)'}
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
        )}

        {/* user avatar + dropdown menu */}
        {user && (
          <div ref={userMenuRef} style={{ position: 'relative' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              onClick={() => setShowUserMenu((v) => !v)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowUserMenu((v) => !v) } }}
              role="button"
              tabIndex={0}
              aria-label={`User menu: ${user.username}`}
              aria-expanded={showUserMenu}
              aria-haspopup="true"
            >
              {user.avatarUrl
                ? <img src={user.avatarUrl.startsWith('http') ? user.avatarUrl : `${API}${user.avatarUrl}`} alt="" style={{ ...S.avatar, objectFit: 'cover' }} />
                : <div style={S.avatar} aria-hidden="true">{initials}</div>
              }
              <span style={S.username}>{user.username}</span>
              <IconChevronDown size={13} style={{ color: 'var(--sh-nav-search-text)', transform: showUserMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} aria-hidden="true" />
            </div>

            {showUserMenu && (
              <div style={S.userMenu}>
                <button type="button" style={S.userMenuItem} onClick={() => { setShowUserMenu(false); navigate('/dashboard') }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--sh-soft)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  Dashboard
                </button>
                <button type="button" style={S.userMenuItem} onClick={() => { setShowUserMenu(false); navigate(`/profile/${user.username}`) }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--sh-soft)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  Profile
                </button>
                <button type="button" style={S.userMenuItem} onClick={() => { setShowUserMenu(false); navigate('/settings') }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--sh-soft)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  Settings
                </button>
                <div style={{ borderTop: '1px solid var(--sh-border)', margin: '4px 0' }} />
                <button type="button" style={{ ...S.userMenuItem, color: 'var(--sh-danger)' }}
                  onClick={async () => { setShowUserMenu(false); await signOut(); navigate('/login') }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--sh-soft)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  Log out
                </button>
              </div>
            )}
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
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--sh-brand)' }}
            >
              Get Started
            </Link>
          </div>
        )}

        {/* contextual auth links on public pages */}
        {!user && !isLanding && (
          location.pathname === '/login' ? (
            <Link to="/register" style={{ fontSize: 12, fontWeight: 600, color: 'var(--sh-nav-tab-active)', textDecoration: 'none' }}>
              Create account →
            </Link>
          ) : location.pathname === '/register' ? (
            <Link to="/login" style={{ fontSize: 12, fontWeight: 600, color: 'var(--sh-nav-tab-active)', textDecoration: 'none' }}>
              Sign in →
            </Link>
          ) : location.pathname === '/forgot-password' || location.pathname === '/reset-password' ? (
            <Link to="/login" style={{ fontSize: 12, fontWeight: 600, color: 'var(--sh-nav-tab-active)', textDecoration: 'none' }}>
              Back to login
            </Link>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Link to="/login" style={{ fontSize: 12, fontWeight: 600, color: 'var(--sh-nav-accent)', textDecoration: 'none' }}>Log in</Link>
              <Link to="/register" style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-nav-text)', textDecoration: 'none', background: 'var(--sh-brand)', padding: '5px 12px', borderRadius: 7 }}>Get Started</Link>
            </div>
          )
        )}

      </div>

      {/* — tabs row (only if tabs configured) — */}
      {tabs && (
        <div style={{ borderTop: '1px solid var(--sh-nav-border)' }}>
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
    {!isLanding && <EmailVerificationBanner />}
    </Fragment>
  )
}
