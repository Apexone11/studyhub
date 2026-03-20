// src/components/AppSidebar.jsx
// Shared left navigation sidebar — navigation-first design
// Used by: FeedPage, TestsPage, NotesPage, AnnouncementsPage, SubmitPage, SheetsPage

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  IconFeed, IconSheets, IconTests, IconNotes,
  IconAnnouncements, IconProfile, IconPlus, IconSettings,
} from './Icons'
import { API } from '../config'
import { useSession } from '../lib/session-context'

const FOCUSABLE_DRAWER_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const NAV_LINKS = [
  { icon: IconFeed,          label: 'Feed',           to: '/feed' },
  { icon: IconSheets,        label: 'Study Sheets',   to: '/sheets' },
  { icon: IconTests,         label: 'Practice Tests', to: '/tests' },
  { icon: IconNotes,         label: 'My Notes',       to: '/notes' },
  { icon: IconAnnouncements, label: 'Announcements',  to: '/announcements' },
  { icon: IconProfile,       label: 'Profile',        to: '/dashboard' },
]

const COURSE_COLORS = {
  CMSC: '#8b5cf6', MATH: '#10b981', ENGL: '#f59e0b',
  PHYS: '#0ea5e9', BIOL: '#ec4899', HIST: '#6366f1',
  ECON: '#14b8a6', CHEM: '#f97316',
}
function courseColor(code = '') {
  const prefix = code.replace(/\d.*/, '').toUpperCase()
  return COURSE_COLORS[prefix] || 'var(--sh-brand)'
}

function Avatar({ name, size = 48, role }) {
  const initials = (name || '?').slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: role === 'admin' ? 'var(--sh-brand)' : 'var(--sh-heading)',
      color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, flexShrink: 0,
      border: '2px solid var(--sh-border)',
    }}>
      {initials}
    </div>
  )
}

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
        <div style={{ position: 'relative' }}>
          {user.avatarUrl
            ? <img
                src={user.avatarUrl.startsWith('http') ? user.avatarUrl : `${API}${user.avatarUrl}`}
                alt={user.username}
                style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--sh-border)' }}
              />
            : <Avatar name={user.username} size={44} role={user.role} />
          }
          <div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 12, height: 12, borderRadius: '50%',
            background: '#10b981', border: '2px solid var(--sh-surface)',
          }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--type-sm)', color: 'var(--sh-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.username}</div>
          <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-muted)', marginTop: 1 }}>
            {user.role === 'admin' ? '👑 Admin' : 'Student'}
            {joinDate ? ` · Joined ${joinDate}` : ''}
          </div>
        </div>
      </div>

      {/* Nav links — clean list, no enclosing card */}
      <nav aria-label="Sidebar navigation" className="sh-sidebar-section">
        {NAV_LINKS.map((link) => {
          const isActive = pathname === link.to || (link.to === '/sheets' && pathname.startsWith('/sheets'))
          const Icon = link.icon
          return (
            <Link
              key={link.to}
              to={link.to}
              className={`sh-sidebar-nav-link${isActive ? ' sh-sidebar-nav-link--active' : ''}`}
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
          ? <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-muted)', fontStyle: 'italic', padding: '4px 2px' }}>No courses yet</div>
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
          onClick={() => navigate('/settings?tab=courses')}
          className="sh-btn sh-btn--secondary sh-btn--sm"
          style={{ marginTop: 10, width: '100%', justifyContent: 'center', gap: 5 }}
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
