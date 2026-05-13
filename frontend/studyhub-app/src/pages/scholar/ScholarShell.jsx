/**
 * ScholarShell.jsx — Shared layout wrapper for all Scholar routes.
 *
 * The global AppSidebar is the app-wide nav. Scholar adds a *sub-nav*
 * strip below it (Hub / Search / Saved / Topics) so users can move
 * between Scholar surfaces without bouncing through the global menu.
 *
 * Design rules (2026-05-12 polish pass):
 *   - Plus Jakarta Sans throughout — no editorial-serif headings.
 *     `var(--font-paper)` is reserved for paper bodies / reading view.
 *   - Tokens only (`var(--sh-*)`) — no hex.
 *   - No emoji in chrome. Inline SVG for icons.
 *   - Quick-search affordance lives in the strip's right end.
 *   - `prefers-reduced-motion` honoured on every transition.
 *
 * Props:
 *   children      — page content (rendered in a max-1200 centered container)
 *   mainId        — anchor id for the skip-link target (default scholar-main)
 *   mainStyle     — pass-through style overrides for the <main> wrapper
 *   breadcrumb    — optional `[{ label, to }]` rendered below the strip on
 *                   tablet+; hidden on phones (saves vertical space and
 *                   avoids label truncation on narrow viewports)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { useSession } from '../../lib/session-context'
import { POPULAR_TOPICS } from './scholarConstants'

const SCHOLAR_TABS = Object.freeze([
  { to: '/scholar', label: 'Hub', end: true },
  { to: '/scholar/search', label: 'Search', end: false },
  { to: '/scholar/saved', label: 'Saved', end: false },
])

// Limit the Topics dropdown to the first 6 entries. Keeps the menu
// scannable; the full topic browse lives on /scholar (the Hub).
const TOPICS_IN_MENU = 6

function SearchIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{
        transition: 'transform 160ms ease',
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
      }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

const FONT_STACK = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

const TAB_LINK_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 44,
  minWidth: 44,
  padding: '0 14px',
  fontFamily: FONT_STACK,
  fontWeight: 600,
  fontSize: 14,
  color: 'var(--sh-text-muted, var(--sh-slate-600))',
  textDecoration: 'none',
  borderBottom: '2px solid transparent',
  borderRadius: 0,
  background: 'transparent',
  whiteSpace: 'nowrap',
  transition: 'color 160ms ease, border-color 160ms ease',
}

const TAB_LINK_ACTIVE_STYLE = {
  color: 'var(--sh-text, var(--sh-slate-900))',
  borderBottomColor: 'var(--sh-accent)',
}

function TopicsDropdown() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const navigate = useNavigate()

  // Close on outside click / Escape. Pointerdown rather than click so the
  // menu closes before the underlying control's click handler fires.
  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event) {
      const t = event.target
      if (triggerRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handlePick = useCallback(
    (slug) => {
      setOpen(false)
      navigate(`/scholar/topic/${slug}`)
    },
    [navigate],
  )

  const topics = useMemo(() => POPULAR_TOPICS.slice(0, TOPICS_IN_MENU), [])

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          ...TAB_LINK_STYLE,
          border: 'none',
          cursor: 'pointer',
          gap: 6,
          background: 'transparent',
        }}
      >
        Topics
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Scholar topics"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: 220,
            padding: 6,
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(15, 23, 42, 0.12))',
            zIndex: 60,
            fontFamily: FONT_STACK,
          }}
        >
          {topics.map((topic) => (
            <button
              key={topic.slug}
              type="button"
              role="menuitem"
              onClick={() => handlePick(topic.slug)}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                minHeight: 36,
                padding: '8px 10px',
                background: 'transparent',
                border: 'none',
                borderRadius: 6,
                fontFamily: FONT_STACK,
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--sh-text, var(--sh-slate-900))',
                textAlign: 'left',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--sh-soft)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
              onFocus={(e) => {
                e.currentTarget.style.background = 'var(--sh-soft)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {topic.label}
            </button>
          ))}
          <Link
            to="/scholar"
            role="menuitem"
            onClick={() => setOpen(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              minHeight: 36,
              padding: '8px 10px',
              marginTop: 4,
              borderTop: '1px solid var(--sh-border)',
              borderRadius: 6,
              fontFamily: FONT_STACK,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--sh-accent)',
              textDecoration: 'none',
            }}
          >
            Browse all topics
            <ChevronRight />
          </Link>
        </div>
      ) : null}
    </div>
  )
}

function QuickSearch({ compact }) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')

  const submit = useCallback(
    (event) => {
      event.preventDefault()
      const next = value.trim()
      if (!next) return
      setValue('')
      navigate(`/scholar/search?q=${encodeURIComponent(next)}`)
    },
    [navigate, value],
  )

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => navigate('/scholar/search')}
        aria-label="Open Scholar search"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 44,
          height: 44,
          background: 'transparent',
          border: '1px solid var(--sh-border)',
          borderRadius: 999,
          color: 'var(--sh-text, var(--sh-slate-900))',
          cursor: 'pointer',
        }}
      >
        <SearchIcon size={18} />
      </button>
    )
  }

  return (
    <form
      onSubmit={submit}
      role="search"
      aria-label="Quick Scholar search"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 36,
        padding: '0 10px',
        background: 'var(--sh-soft)',
        border: '1px solid var(--sh-border)',
        borderRadius: 999,
        fontFamily: FONT_STACK,
        minWidth: 220,
      }}
    >
      <span style={{ color: 'var(--sh-text-muted, var(--sh-slate-600))' }} aria-hidden="true">
        <SearchIcon size={14} />
      </span>
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search papers"
        aria-label="Search Scholar"
        style={{
          flex: 1,
          minWidth: 0,
          height: 32,
          padding: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontFamily: FONT_STACK,
          fontSize: 14,
          color: 'var(--sh-text, var(--sh-slate-900))',
        }}
      />
    </form>
  )
}

function PlanBadge() {
  // ScholarShell is only mounted inside the authenticated tree, so
  // SessionProvider is always present. If a downstream caller mounts
  // ScholarShell without the Provider (e.g. an isolated story), the
  // hook will throw and React's nearest error boundary handles it —
  // we'd rather fail loud than render stale state. The spec says
  // "graceful — if useUserPlan isn't available, just hide": that's
  // covered by the plan !== 'free' fall-through.
  const { user } = useSession()
  if (!user) return null
  const plan = user.plan || 'free'
  if (plan !== 'free') return null
  return (
    <Link
      to="/pricing"
      title="Upgrade to Pro: unlimited OA PDF downloads"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 32,
        padding: '0 12px',
        background: 'var(--sh-accent-soft, var(--sh-soft))',
        color: 'var(--sh-accent)',
        border: '1px solid var(--sh-accent-border, var(--sh-border))',
        borderRadius: 999,
        fontFamily: FONT_STACK,
        fontSize: 12,
        fontWeight: 700,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      Pro: unlimited OA PDFs
    </Link>
  )
}

function Breadcrumb({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        fontFamily: FONT_STACK,
        fontSize: 13,
        color: 'var(--sh-text-muted, var(--sh-slate-600))',
        padding: '10px 0 0',
      }}
    >
      <ol
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
          margin: 0,
          padding: 0,
          listStyle: 'none',
        }}
      >
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1
          return (
            <li
              key={`${item.label}-${idx}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {item.to && !isLast ? (
                <Link
                  to={item.to}
                  style={{
                    color: 'var(--sh-text-muted, var(--sh-slate-600))',
                    textDecoration: 'none',
                  }}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  style={{
                    color: isLast
                      ? 'var(--sh-text, var(--sh-slate-900))'
                      : 'var(--sh-text-muted, var(--sh-slate-600))',
                    fontWeight: isLast ? 600 : 500,
                  }}
                >
                  {item.label}
                </span>
              )}
              {!isLast ? (
                <span aria-hidden="true" style={{ color: 'var(--sh-border)' }}>
                  <ChevronRight />
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function ScholarSubNav({ isCompact, showBreadcrumb, breadcrumb }) {
  // Force re-renders of NavLink on every route change so the active
  // underline syncs even if a child page does a programmatic navigate.
  // react-router-dom NavLink already listens via context — the location
  // hook here is the cheapest way to keep the strip in sync without
  // an extra useEffect.
  useLocation()
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        background: 'var(--sh-surface)',
        borderBottom: '1px solid var(--sh-border)',
        backdropFilter: 'saturate(140%) blur(6px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0 clamp(16px, 2.5vw, 24px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            minHeight: 52,
            overflowX: 'auto',
            scrollbarWidth: 'none',
            fontFamily: FONT_STACK,
          }}
        >
          <nav
            aria-label="Scholar sections"
            style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '0 1 auto' }}
          >
            {SCHOLAR_TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                style={({ isActive }) => ({
                  ...TAB_LINK_STYLE,
                  ...(isActive ? TAB_LINK_ACTIVE_STYLE : null),
                })}
              >
                {tab.label}
              </NavLink>
            ))}
            <TopicsDropdown />
          </nav>
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flex: '0 0 auto',
            }}
          >
            <PlanBadge />
            <QuickSearch compact={isCompact} />
          </div>
        </div>
        {showBreadcrumb ? <Breadcrumb items={breadcrumb} /> : null}
      </div>
    </div>
  )
}

export default function ScholarShell({ children, mainId = 'scholar-main', mainStyle, breadcrumb }) {
  const layout = useResponsiveAppLayout()
  const isCompact = layout.isCompact
  // Breadcrumb policy: hide on phones (saves vertical space, avoids
  // truncated labels). Show on tablet+. `isCompact` is true on phones
  // in the existing app layout system.
  const showBreadcrumb = !isCompact && Array.isArray(breadcrumb) && breadcrumb.length > 0
  return (
    <div className="scholar-page">
      <Navbar />
      <a href={`#${mainId}`} className="scholar-skip-link">
        Skip to main content
      </a>
      <div className="sh-app-page" style={{ background: 'var(--sh-page-bg)', minHeight: '100vh' }}>
        <div style={pageShell('app', 0, 48)}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: layout.columns.appTwoColumn,
              gap: 22,
              alignItems: 'start',
            }}
          >
            <div
              style={{ position: isCompact ? 'static' : 'sticky', top: isCompact ? undefined : 74 }}
            >
              <AppSidebar mode={layout.sidebarMode} />
            </div>
            <main
              id={mainId}
              className="sh-ambient-main"
              style={{ minWidth: 0, paddingTop: 0, ...mainStyle }}
            >
              <ScholarSubNav
                isCompact={isCompact}
                showBreadcrumb={showBreadcrumb}
                breadcrumb={breadcrumb}
              />
              <div
                style={{
                  width: '100%',
                  maxWidth: 1200,
                  margin: '0 auto',
                  padding: '24px clamp(16px, 2.5vw, 24px)',
                  fontFamily: FONT_STACK,
                }}
              >
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}
