// src/components/navbarConstants.js
// Extracted from Navbar.jsx — route config, style objects, and helper functions.

// ─── NAV CONFIG ───────────────────────────────────────────────────
// Maps route patterns → { crumbs, tabs, backTo }
// Pages can override these via props.
export const ROUTE_CONFIG = {
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
  '/my-courses':    { crumbs: [{ label: 'My Courses',      to: '/my-courses' }],     backTo: '/feed' },
  '/admin':         { crumbs: [{ label: 'Admin',           to: '/admin' }],          backTo: '/feed' },
  '/dashboard':     { crumbs: [{ label: 'My Profile',      to: '/dashboard' }],      backTo: '/feed' },
  '/users':         { crumbs: [{ label: 'Profile',          to: null }],              backTo: '/feed' },
}

export function formatRelativeTime(iso, nowMs) {
  const diff = nowMs - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function getConfig(pathname) {
  // exact match first
  if (ROUTE_CONFIG[pathname]) return ROUTE_CONFIG[pathname]
  // prefix match (e.g. /sheets/42)
  for (const key of Object.keys(ROUTE_CONFIG)) {
    if (pathname.startsWith(key + '/')) return ROUTE_CONFIG[key]
  }
  return {}
}

// ─── STYLES ───────────────────────────────────────────────────────
export const S = {
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

export function handleIconHover(e, enter) {
  e.currentTarget.style.background = enter ? 'var(--sh-nav-search-bg)' : 'transparent'
  e.currentTarget.style.color      = enter ? 'var(--sh-nav-accent)' : 'var(--sh-nav-muted)'
}
