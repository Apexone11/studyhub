// src/components/AppSidebar.jsx
// Shared left navigation sidebar — navigation-first design
// Used by: FeedPage, TestsPage, NotesPage, AnnouncementsPage, SubmitPage, SheetsPage

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { IconPlus, IconSettings } from '../Icons'
import { useSession } from '../../lib/session-context'
import UserAvatar from '../UserAvatar'
import {
  FOCUSABLE_DRAWER_SELECTORS,
  NAV_LINKS,
  courseColor,
} from './sidebarConstants'

export default function AppSidebar({ mode = 'fixed' }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const triggerButtonRef = useRef(null)
  const drawerDialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const previouslyFocusedRef = useRef(null)

  const { user } = useSession()

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

  const enrollments = user.enrollments || []
  const courseCodes = enrollments.map(e => e.course?.code).filter(Boolean)
  const joinDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null

  const shell = (
    <>
      {/* Profile summary — compact, no heavy card */}
      <div className="sh-sidebar-section" style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '4px 0', marginBottom: 8,
      }}>
        <UserAvatar
          username={user.username}
          avatarUrl={user.avatarUrl}
          role={user.role}
          size={44}
          border="2px solid var(--sh-border)"
          showStatus
          online
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--type-sm)', color: 'var(--sh-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.username}</div>
          <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-muted)', marginTop: 1 }}>
            {user.role === 'admin' ? 'Admin' : user.accountType === 'teacher' ? 'Teacher' : user.accountType === 'other' ? 'Member' : 'Student'}
            {joinDate ? ` · Joined ${joinDate}` : ''}
          </div>
        </div>
      </div>

      {/* Nav links — clean list, no enclosing card */}
      <nav aria-label="Sidebar navigation" className="sh-sidebar-section">
        {NAV_LINKS.map((link) => {
          const to = link.to === '__MY_PROFILE__' ? `/users/${user.username}` : link.to
          const isActive = to === pathname
            || (link.to === '/sheets' && pathname.startsWith('/sheets'))
            || (link.to === '__MY_PROFILE__' && pathname === `/users/${user.username}`)
          const Icon = link.icon
          return (
            <Link
              key={to}
              to={to}
              className={`sh-sidebar-nav-link${isActive ? ' sh-sidebar-nav-link--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={15} />
              {link.label}
            </Link>
          )
        })}
      </nav>

      {/* My Courses — lighter section with label */}
      <div className="sh-sidebar-section">
        <div className="sh-label" style={{ marginBottom: 8, paddingLeft: 2 }}>
          MY COURSES
        </div>
        {courseCodes.length === 0
          ? <Link to="/my-courses" style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-brand)', padding: '4px 2px', textDecoration: 'none' }}>Set up your courses &rarr;</Link>
          : courseCodes.map(code => (
              <div key={code} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 2px',
                borderBottom: '1px solid var(--sh-border)',
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: courseColor(code), flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--type-sm)', fontWeight: 600, color: 'var(--sh-text)' }}>{code}</span>
              </div>
            ))
        }
        <button
          onClick={() => navigate('/my-courses')}
          className="sh-btn sh-btn--secondary sh-btn--sm"
          style={{ marginTop: 10, width: '100%', justifyContent: 'center', gap: 5 }}
          aria-label="Add course"
        >
          <IconPlus size={12} />Add Course
        </button>
      </div>

      {/* Admin panel shortcut */}
      {user.role === 'admin' && (
        <Link
          to="/admin"
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

                const focusableElements = Array.from(dialog.querySelectorAll(FOCUSABLE_DRAWER_SELECTORS)).filter((element) => {
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 'var(--type-sm)', fontWeight: 800, color: 'var(--sh-heading)' }}>Navigation</div>
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

  return (
    <aside style={{ position: 'sticky', top: 74, alignSelf: 'start' }}>
      {shell}
    </aside>
  )
}
