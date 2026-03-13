// src/components/Navbar.jsx
// PATCH v2 — consistent nav on every page
// Changes from v1:
//  - Auto-detects current page from useLocation for breadcrumb
//  - Optional inline tab bar (Sheets page uses Browse/My/Starred)
//  - Optional right-side actions slot
//  - Uses custom Icons from Icons.jsx instead of Font Awesome
//  - Compact 52px height, same #0f172a background, sticky top

import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LogoMark,
  IconSearch,
  IconBell,
  IconChevronDown,
} from './Icons'

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
    height: 52,
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    gap: 10,
    maxWidth: 1200,
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
    padding: '0 20px',
    maxWidth: 1200,
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
  // legacy props accepted but unused — new Navbar reads from localStorage directly
  user: _user,
  onLogout: _onLogout,
}) {
  const location  = useLocation()
  const navigate  = useNavigate()
  const config    = getConfig(location.pathname)

  const crumbs    = crumbsProp ?? config.crumbs ?? []
  const tabs      = (!hideTabs && (tabsProp ?? config.tabs)) || null
  const backTo    = config.backTo

  // user info from localStorage (set on login)
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
  })()
  const initials = user?.username?.slice(0, 2).toUpperCase() || '??'

  function handleIconHover(e, enter) {
    e.currentTarget.style.background = enter ? '#1e293b' : 'transparent'
    e.currentTarget.style.color      = enter ? '#94a3b8' : '#64748b'
  }

  return (
    <nav style={S.nav}>
      {/* — top row — */}
      <div style={S.topRow}>

        {/* logo */}
        <Link to={user ? '/feed' : '/'} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <LogoMark size={28} />
          <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
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

        {/* search box */}
        {!hideSearch && (
          <div style={S.searchBox} onClick={() => {}}>
            <IconSearch size={13} style={{ color: '#475569', flexShrink: 0 }} />
            <span style={S.searchText}>Search sheets, courses…</span>
          </div>
        )}

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
          <button
            style={S.iconBtn}
            title="Notifications"
            onMouseEnter={e => handleIconHover(e, true)}
            onMouseLeave={e => handleIconHover(e, false)}
          >
            <IconBell size={17} />
          </button>
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

        {/* login link if no user */}
        {!user && (
          <Link to="/login" style={{
            fontSize: 12, fontWeight: 600, color: '#3b82f6', textDecoration: 'none',
          }}>Log in</Link>
        )}

      </div>

      {/* — tabs row (only if tabs configured) — */}
      {tabs && (
        <div style={{ borderTop: '1px solid #1e293b' }}>
          <div style={S.tabsRow}>
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
