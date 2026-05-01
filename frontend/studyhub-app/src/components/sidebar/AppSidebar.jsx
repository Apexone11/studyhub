// src/components/AppSidebar.jsx
// Shared left navigation sidebar — navigation-first design
// Used by: FeedPage, TestsPage, NotesPage, AnnouncementsPage, SubmitPage, SheetsPage

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { IconPlus, IconSettings, IconSheets, IconUsers } from '../Icons'
import { useSession } from '../../lib/session-context'
import { prefetchForRoute } from '../../lib/prefetch'
import UserAvatar from '../UserAvatar'
import {
  FOCUSABLE_DRAWER_SELECTORS,
  NAV_LINKS,
  courseColor,
  visibleSidebarSections,
} from './sidebarConstants'
import { roleLabel } from '../../lib/roleLabel'
import { useDesignV2Flags } from '../../lib/designV2Flags'
import SidebarTopics from './SidebarTopics'

// Hide-the-sidebar preference is persisted across pages so toggling
// once doesn't reset on every navigation. localStorage instead of
// sessionStorage so the preference survives a fresh window — most users
// who want it hidden want it hidden everywhere.
const SIDEBAR_HIDDEN_KEY = 'studyhub.sidebar.hidden'

function readSidebarHidden() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SIDEBAR_HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

function writeSidebarHidden(value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SIDEBAR_HIDDEN_KEY, value ? '1' : '0')
  } catch {
    /* private mode / quota — ignore */
  }
}

export default function AppSidebar({ mode = 'fixed' }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sidebarHidden, setSidebarHidden] = useState(readSidebarHidden)
  const triggerButtonRef = useRef(null)
  const drawerDialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const previouslyFocusedRef = useRef(null)

  const toggleSidebarHidden = () => {
    setSidebarHidden((prev) => {
      const next = !prev
      writeSidebarHidden(next)
      return next
    })
  }

  const { user } = useSession()

  // Phase 1 of v2 design refresh. Sectioned sidebar nav + user card at bottom.
  // Flag-gated via design_v2_phase1_dashboard. DEFAULTS return true so we render
  // the v2 shell during the loading window too — the fail-open path.
  const v2Flags = useDesignV2Flags()
  const phase1On = v2Flags.phase1Dashboard

  useEffect(() => {
    if (!drawerOpen) {
      const focusTarget = triggerButtonRef.current || previouslyFocusedRef.current
      if (focusTarget && typeof focusTarget.focus === 'function') {
        focusTarget.focus()
      }
      return
    }

    previouslyFocusedRef.current = triggerButtonRef.current || document.activeElement
    const focusTarget = closeButtonRef.current || drawerDialogRef.current
    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus()
    }
  }, [drawerOpen])

  if (!user) return null

  const handleNavClick = () => {
    if (drawerOpen) {
      setDrawerOpen(false)
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const enrollments = user.enrollments || []
  const courseEntries = enrollments
    .filter((e) => e.course?.code && e.course?.id)
    .map((e) => ({ code: e.course.code, id: e.course.id }))
  const joinDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null

  const shell = (
    <>
      {/* Hide-sidebar control. Beta tester ask — they wanted a quick
          way to clear the left rail for a wider reading view without
          collapsing the layout entirely. The button toggles the
          persisted localStorage flag; when hidden, a "Show sidebar"
          pill in the top-left corner brings it back on click. */}
      {mode === 'fixed' && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: 4,
          }}
        >
          <button
            type="button"
            onClick={toggleSidebarHidden}
            aria-label="Hide sidebar"
            title="Hide sidebar"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--sh-muted)',
              background: 'transparent',
              border: '1px solid var(--sh-border)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            <span aria-hidden="true">‹‹</span>
            Hide
          </button>
        </div>
      )}

      {/* Profile summary — compact, no heavy card */}
      <div
        className="sh-sidebar-section"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '4px 0',
          marginBottom: 8,
        }}
      >
        <UserAvatar
          username={user.username}
          avatarUrl={user.avatarUrl}
          role={user.role}
          plan={user.plan}
          isDonor={user.isDonor}
          donorLevel={user.donorLevel}
          size={44}
          border="2px solid var(--sh-border)"
          showStatus
          online
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 'var(--type-sm)',
              color: 'var(--sh-heading)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user.username}
          </div>
          <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-muted)', marginTop: 1 }}>
            {user.role === 'admin' ? 'Admin' : roleLabel(user.accountType)}
            {joinDate ? ` · Joined ${joinDate}` : ''}
          </div>
        </div>
      </div>

      {/* Nav links — clean list, no enclosing card.
          Phase 1: behind design_v2_phase1_dashboard we render sectioned
          groups (MAIN / PERSONAL / ACCOUNT). Legacy flat rendering stays
          available so we can flip the flag off without regressions.
          See docs/internal/design-refresh-v2-master-plan.md Phase 1. */}
      {phase1On ? (
        <nav aria-label="Sidebar navigation" className="sh-sidebar-section">
          {visibleSidebarSections(user).map((section) => (
            <div key={section.key} style={{ marginBottom: 14 }}>
              <div className="sh-label" style={{ marginBottom: 6, paddingLeft: 2 }}>
                {section.label}
              </div>
              {section.links.map((link) => {
                const to = link.to === '__MY_PROFILE__' ? `/users/${user.username}` : link.to
                const isActive =
                  to === pathname ||
                  (link.to === '/sheets' && pathname.startsWith('/sheets')) ||
                  (link.to === '__MY_PROFILE__' && pathname === `/users/${user.username}`)
                const Icon = link.icon
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`sh-sidebar-nav-link${isActive ? ' sh-sidebar-nav-link--active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={handleNavClick}
                    onMouseEnter={() =>
                      prefetchForRoute(link.to === '__MY_PROFILE__' ? '/users/:username' : link.to)
                    }
                  >
                    <Icon size={15} />
                    {link.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
      ) : (
        <nav aria-label="Sidebar navigation" className="sh-sidebar-section">
          {NAV_LINKS.filter((link) => {
            // Hide "My Courses" nav link for "other" account type
            if (link.to === '/my-courses' && user.accountType === 'other') return false
            return true
          }).map((link) => {
            const to = link.to === '__MY_PROFILE__' ? `/users/${user.username}` : link.to
            const isActive =
              to === pathname ||
              (link.to === '/sheets' && pathname.startsWith('/sheets')) ||
              (link.to === '__MY_PROFILE__' && pathname === `/users/${user.username}`)
            const Icon = link.icon
            return (
              <Link
                key={to}
                to={to}
                className={`sh-sidebar-nav-link${isActive ? ' sh-sidebar-nav-link--active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={handleNavClick}
                onMouseEnter={() =>
                  prefetchForRoute(link.to === '__MY_PROFILE__' ? '/users/:username' : link.to)
                }
              >
                <Icon size={15} />
                {link.label}
              </Link>
            )
          })}
        </nav>
      )}

      {/* Teacher section — for teacher accounts */}
      {user.accountType === 'teacher' && (
        <div className="sh-sidebar-section">
          <div className="sh-label" style={{ marginBottom: 8, paddingLeft: 2 }}>
            MY TEACHING
          </div>
          {/*
            v2 design refresh Week 2 — teacher links now point at standalone
            workspaces instead of ?mine=true filters on the generic pages.
            /teach/materials is live in W2. /groups/mine lands in W3; until
            then we keep the legacy ?mine=true target so the link still works.
          */}
          <Link to="/teach/materials" className="sh-sidebar-nav-link" onClick={handleNavClick}>
            <IconSheets size={15} />
            My Materials
          </Link>
          <Link
            to="/study-groups?mine=true"
            className="sh-sidebar-nav-link"
            onClick={handleNavClick}
          >
            <IconUsers size={15} />
            My Study Groups
          </Link>
        </div>
      )}

      {/* Topics I follow — Self-learners only (flag-gated) */}
      {user.accountType === 'other' && <SidebarTopics onNavClick={handleNavClick} />}
      {/* SidebarTopics self-checks the flag internally via useRolesV2Flags. */}

      {/* My Courses — lighter section with label (hidden for "other" account type) */}
      {user.accountType !== 'other' && (
        <div className="sh-sidebar-section">
          <div className="sh-label" style={{ marginBottom: 8, paddingLeft: 2 }}>
            {user.accountType === 'teacher' ? 'MY COURSES (TEACHING)' : 'MY COURSES'}
          </div>
          {courseEntries.length === 0 ? (
            <Link
              to="/my-courses"
              onClick={handleNavClick}
              style={{
                fontSize: 'var(--type-xs)',
                color: 'var(--sh-brand)',
                padding: '4px 2px',
                textDecoration: 'none',
              }}
            >
              Set up your courses &rarr;
            </Link>
          ) : (
            courseEntries.map((entry) => (
              <Link
                key={entry.id}
                to={`/sheets?courseId=${entry.id}`}
                onClick={handleNavClick}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 2px',
                  borderBottom: '1px solid var(--sh-border)',
                  textDecoration: 'none',
                  borderRadius: 6,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--sh-soft)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: courseColor(entry.code),
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{ fontSize: 'var(--type-sm)', fontWeight: 600, color: 'var(--sh-text)' }}
                >
                  {entry.code}
                </span>
              </Link>
            ))
          )}
          <button
            onClick={() => {
              handleNavClick()
              navigate('/my-courses')
            }}
            className="sh-btn sh-btn--secondary sh-btn--sm"
            style={{ marginTop: 10, width: '100%', justifyContent: 'center', gap: 5 }}
            aria-label="Add course"
          >
            <IconPlus size={12} />
            {user.accountType === 'teacher' ? 'Add Course' : 'Add Course'}
          </button>
        </div>
      )}

      {/* Admin panel shortcut */}
      {user.role === 'admin' && (
        <Link
          to="/admin"
          onClick={handleNavClick}
          className="sh-sidebar-nav-link"
          style={{
            background: 'var(--sh-warning-bg)',
            color: 'var(--sh-warning-text)',
            fontWeight: 700,
            border: '1px solid var(--sh-warning-border)',
            marginTop: 4,
          }}
        >
          <IconSettings size={14} />
          Admin Panel
        </Link>
      )}
    </>
  )

  if (mode === 'drawer') {
    return (
      <aside style={{ position: 'sticky', top: 74, alignSelf: 'start', zIndex: 25 }}>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          ref={triggerButtonRef}
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          aria-controls="app-sidebar-drawer"
          className="sh-btn sh-btn--secondary sh-btn--sm"
        >
          Open navigation
        </button>
        {drawerOpen ? (
          <div
            role="presentation"
            onClick={() => setDrawerOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.4)',
              zIndex: 50,
              display: 'flex',
              justifyContent: 'flex-start',
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Sidebar navigation"
              id="app-sidebar-drawer"
              ref={drawerDialogRef}
              tabIndex={-1}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  setDrawerOpen(false)
                  return
                }

                if (event.key !== 'Tab') {
                  return
                }

                const dialog = drawerDialogRef.current
                if (!dialog) {
                  return
                }

                const focusableElements = Array.from(
                  dialog.querySelectorAll(FOCUSABLE_DRAWER_SELECTORS),
                ).filter((element) => {
                  if (!(element instanceof HTMLElement)) return false
                  if (element.tabIndex === -1 || element.hasAttribute('disabled')) return false

                  const style = window.getComputedStyle(element)
                  return style.visibility !== 'hidden' && style.display !== 'none'
                })

                if (focusableElements.length === 0) {
                  event.preventDefault()
                  dialog.focus()
                  return
                }

                const firstElement = focusableElements[0]
                const lastElement = focusableElements[focusableElements.length - 1]
                const { activeElement } = document
                const shiftPressed = event.shiftKey

                if (!dialog.contains(activeElement)) {
                  event.preventDefault()
                  ;(shiftPressed ? lastElement : firstElement).focus()
                  return
                }

                if (!shiftPressed && activeElement === lastElement) {
                  event.preventDefault()
                  firstElement.focus()
                  return
                }

                if (shiftPressed && (activeElement === firstElement || activeElement === dialog)) {
                  event.preventDefault()
                  lastElement.focus()
                }
              }}
              onClick={(event) => event.stopPropagation()}
              style={{
                width: 'min(86vw, 300px)',
                height: '100%',
                overflowY: 'auto',
                background: 'var(--sh-bg)',
                padding: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 'var(--type-sm)',
                    fontWeight: 800,
                    color: 'var(--sh-heading)',
                  }}
                >
                  Navigation
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  ref={closeButtonRef}
                  className="sh-btn sh-btn--secondary sh-btn--sm"
                  aria-label="Close navigation"
                >
                  Close
                </button>
              </div>
              {shell}
            </div>
          </div>
        ) : null}
      </aside>
    )
  }

  // When hidden, render a slim "Show sidebar" pill instead of the
  // full rail. The pill keeps the parent grid column populated so the
  // main content layout doesn't shift — it just becomes a thin click
  // target. This lets the user reclaim the rail width without us
  // having to coordinate a layout reflow with every page.
  if (sidebarHidden) {
    return (
      <aside
        className="sh-sidebar-sticky"
        style={{ width: 36, paddingRight: 0 }}
        aria-label="Sidebar (hidden)"
      >
        <button
          type="button"
          onClick={toggleSidebarHidden}
          aria-label="Show sidebar"
          title="Show sidebar"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            padding: 0,
            fontSize: 14,
            color: 'var(--sh-muted)',
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          <span aria-hidden="true">››</span>
        </button>
      </aside>
    )
  }

  return <aside className="sh-sidebar-sticky">{shell}</aside>
}
