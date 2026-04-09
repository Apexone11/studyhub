// src/components/Navbar.jsx
// PATCH v2 — consistent nav on every page
// Changes from v1:
//  - Auto-detects current page from useLocation for breadcrumb
//  - Optional inline tab bar (Sheets page uses Browse/My/Starred)
//  - Optional right-side actions slot
//  - Uses custom Icons from Icons.jsx instead of Font Awesome
//  - Shared responsive sizing for landing + app nav states
//
// Refactored: constants/styles in navbarConstants.js,
// user menu in NavbarUserMenu.jsx, notifications in NavbarNotifications.jsx.

import { useState, useEffect, Fragment, lazy, Suspense } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LogoMark,
  IconSearch,
} from '../Icons'
const SearchModal = lazy(() => import('../search/SearchModal'))
const ChatPanel = lazy(() => import('../ChatPanel'))
import KeyboardShortcuts from '../KeyboardShortcuts'
import { pageWidths } from '../../lib/ui'
import { useSession } from '../../lib/session-context'
import EmailVerificationBanner from '../EmailVerificationBanner'
import NavbarUserMenu from './NavbarUserMenu'
import NavbarNotifications from './NavbarNotifications'
/* ChatPanel lazy-loaded above */
import { IconMessages } from '../Icons'
import { S, getConfig, handleIconHover } from './navbarConstants'
import { API } from '../../config'
import { authHeaders } from '../../pages/shared/pageUtils'
import { useChatPanel } from '../../lib/chatPanelContext.js'

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
  const config    = getConfig(location.pathname)

  const { crumbs: configCrumbs, tabs: configTabs, backTo } = config
  const crumbs    = crumbsProp ?? configCrumbs ?? []
  const tabs      = (!hideTabs && (tabsProp ?? configTabs)) || null
  const isLanding = variant === 'landing'
  const shellWidth = isLanding ? pageWidths.landing : pageWidths.app

  // user info from localStorage (set on login)
  const { user } = useSession()

  // search modal state
  const [searchOpen, setSearchOpen] = useState(false)
  // chat panel state — mirrored into ChatPanelContext so components outside
  // the navbar subtree (e.g. AiBubble) can react to it.
  const { setOpen: setChatPanelOpen } = useChatPanel()
  const [chatOpen, setChatOpenLocal] = useState(false)
  const setChatOpen = (next) => {
    const value = typeof next === 'function' ? next(chatOpen) : next
    setChatOpenLocal(value)
    setChatPanelOpen(value)
  }
  // unread messages count for badge
  const [unreadMessages, setUnreadMessages] = useState(0)

  // Fetch unread count on mount + poll every 30s
  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function fetchCount() {
      try {
        const res = await fetch(`${API}/api/messages/unread-total`, {
          credentials: 'include',
          headers: authHeaders(),
        })
        if (res.ok && !cancelled) {
          const data = await res.json()
          setUnreadMessages(data.total || 0)
        }
      } catch { /* silent */ }
    }
    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [user])

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
        {searchOpen && <Suspense fallback={null}><SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} /></Suspense>}
        {chatOpen && <Suspense fallback={null}><ChatPanel open={chatOpen} onClose={() => {
          setChatOpen(false)
          // Re-fetch unread count after closing chat (user may have read messages)
          if (user) {
            fetch(`${API}/api/messages/unread-total`, {
              credentials: 'include', headers: authHeaders(),
            }).then(r => r.ok ? r.json() : null).then(d => {
              if (d) setUnreadMessages(d.total || 0)
            }).catch(() => {})
          }
        }} /></Suspense>}
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

        {/* chat panel toggle */}
        {user && (
          <button
            onClick={() => setChatOpen(true)}
            aria-label={unreadMessages > 0 ? `Open messages (${unreadMessages} unread)` : 'Open messages'}
            style={{ ...S.iconBtn, position: 'relative' }}
            onMouseEnter={e => handleIconHover(e, true)}
            onMouseLeave={e => handleIconHover(e, false)}
          >
            <IconMessages size={18} />
            {unreadMessages > 0 && (
              <span style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 16,
                height: 16,
                borderRadius: 99,
                background: 'var(--sh-danger)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
                lineHeight: 1,
                border: '2px solid var(--sh-nav-bg, #0f172a)',
                pointerEvents: 'none',
              }}>
                {unreadMessages > 9 ? '9+' : unreadMessages}
              </span>
            )}
          </button>
        )}

        {/* notification bell */}
        <NavbarNotifications />

        {/* user avatar + dropdown menu */}
        {user && <NavbarUserMenu user={user} />}

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
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--sh-brand-hover, #2563eb)' }}
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
