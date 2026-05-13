// src/components/sidebar/MobileBottomNav.jsx
// iOS/Android-style sticky bottom navigation rendered ONLY on phone-class
// viewports for authenticated users (and never on /ai which already uses
// a full-screen chat surface).
//
// Mirrors TikTok / Instagram / Slack / Discord: a fixed bottom rail with
// the 5 primary destinations. The hamburger drawer on AppSidebar still
// exists for less-frequent destinations (Settings, Profile, Library, …)
// and renders as a corner "More" icon on phone viewports.

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSession } from '../../lib/session-context'
import { useResponsiveAppLayout } from '../../lib/ui'
import { IconFeed, IconSheets, IconNotes, IconMessages, IconSpark } from '../Icons'
import { API } from '../../config'
import { authHeaders } from '../../pages/shared/pageUtils'
import { prefetchForRoute } from '../../lib/prefetch'

// 5 primary destinations — locked to match the founder spec. Order from
// left to right mirrors typical thumb-reach priority (most-tapped on the
// edges).
const PRIMARY_DESTINATIONS = [
  { key: 'feed', icon: IconFeed, label: 'Feed', to: '/feed' },
  { key: 'sheets', icon: IconSheets, label: 'Sheets', to: '/sheets' },
  { key: 'notes', icon: IconNotes, label: 'Notes', to: '/notes' },
  { key: 'messages', icon: IconMessages, label: 'Messages', to: '/messages' },
  { key: 'ai', icon: IconSpark, label: 'AI', to: '/ai' },
]

// Bottom nav is suppressed on these paths. /ai already owns the whole
// viewport for chat; auth flows have no nav. The native shell handles
// its own nav at /m/*.
const HIDDEN_PATH_PREFIXES = ['/ai', '/login', '/register', '/signup', '/m/', '/onboarding']

const NAV_HEIGHT = 56

function isActivePath(pathname, to) {
  if (pathname === to) return true
  // Sheets sub-routes ( /sheets/:id, /sheets/upload, /sheets/:id/lab, ... )
  if (to === '/sheets' && pathname.startsWith('/sheets')) return true
  // Notes detail page
  if (to === '/notes' && pathname.startsWith('/notes')) return true
  // Messages keeps deep links highlighted
  if (to === '/messages' && pathname.startsWith('/messages')) return true
  return false
}

function shouldHide(pathname) {
  return HIDDEN_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))
}

export default function MobileBottomNav() {
  const { user } = useSession()
  const { pathname } = useLocation()
  const layout = useResponsiveAppLayout()
  const [unreadMessages, setUnreadMessages] = useState(0)

  // Body padding sync. We don't always render — when we DO render, push
  // a CSS variable so any descendant grid using `padding-bottom:
  // var(--sh-bottom-nav-height, 0)` clears the nav.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    if (!user || !layout.isPhone || shouldHide(pathname)) {
      document.documentElement.style.removeProperty('--sh-bottom-nav-height')
      return undefined
    }
    document.documentElement.style.setProperty('--sh-bottom-nav-height', `${NAV_HEIGHT}px`)
    return () => {
      document.documentElement.style.removeProperty('--sh-bottom-nav-height')
    }
  }, [user, layout.isPhone, pathname])

  // Unread messages badge — mirrors the Navbar fetch. Polls every 30s
  // while the nav is mounted. Silently no-ops on auth/network failure.
  useEffect(() => {
    if (!user || !layout.isPhone) return undefined
    let cancelled = false
    async function fetchCount() {
      try {
        const res = await fetch(`${API}/api/messages/unread-total`, {
          credentials: 'include',
          headers: authHeaders(),
        })
        if (res.ok && !cancelled) {
          const data = await res.json()
          setUnreadMessages(Number(data?.total) || 0)
        }
      } catch {
        /* silent — same pattern as Navbar */
      }
    }
    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [user, layout.isPhone])

  // Render gate. Authenticated phone users only, and never on /ai or
  // auth/onboarding/native paths.
  if (!user) return null
  if (!layout.isPhone) return null
  if (shouldHide(pathname)) return null

  return (
    <nav
      aria-label="Primary navigation"
      data-testid="mobile-bottom-nav"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        height: NAV_HEIGHT,
        // iOS notch / Android gesture inset — keep the touch targets
        // above the home indicator without shrinking them.
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        display: 'flex',
        alignItems: 'stretch',
        background: 'var(--sh-surface)',
        borderTop: '1px solid var(--sh-border)',
        // Subtle elevation so the nav doesn't feel flat against scrolled
        // content. Kept light because the border already separates it.
        boxShadow: '0 -1px 0 rgba(0, 0, 0, 0.02)',
      }}
    >
      {PRIMARY_DESTINATIONS.map((dest) => {
        const Icon = dest.icon
        const active = isActivePath(pathname, dest.to)
        const showBadge = dest.key === 'messages' && unreadMessages > 0
        const badgeLabel = unreadMessages > 9 ? '9+' : String(unreadMessages)

        return (
          <Link
            key={dest.key}
            to={dest.to}
            aria-current={active ? 'page' : undefined}
            aria-label={showBadge ? `${dest.label} (${unreadMessages} unread)` : dest.label}
            onMouseEnter={() => prefetchForRoute(dest.to)}
            style={{
              flex: 1,
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              padding: '6px 4px',
              textDecoration: 'none',
              color: active ? 'var(--sh-brand)' : 'var(--sh-muted)',
              background: 'transparent',
              fontSize: 10,
              fontWeight: active ? 700 : 600,
              letterSpacing: '0.01em',
              position: 'relative',
              // prefers-reduced-motion respected — no opacity/transform
              // transitions on tap. Active-state color flip is enough
              // affordance.
            }}
          >
            <span
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
              }}
            >
              <Icon size={22} />
              {showBadge ? (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -8,
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                    borderRadius: 999,
                    background: 'var(--sh-danger, #dc2626)',
                    color: '#ffffff',
                    fontSize: 10,
                    fontWeight: 700,
                    lineHeight: '16px',
                    textAlign: 'center',
                    border: '1.5px solid var(--sh-surface)',
                  }}
                >
                  {badgeLabel}
                </span>
              ) : null}
            </span>
            <span>{dest.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
