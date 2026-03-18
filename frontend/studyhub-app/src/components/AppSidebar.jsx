// src/components/AppSidebar.jsx
// Shared left navigation sidebar — same as FeedPage sidebar
// Used by: TestsPage, NotesPage, AnnouncementsPage, SubmitPage, SheetsPage

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  IconFeed, IconSheets, IconTests, IconNotes,
  IconAnnouncements, IconProfile, IconPlus, IconSettings,
} from './Icons'
import { API } from '../config'
import { useSession } from '../lib/session-context'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

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
  return COURSE_COLORS[prefix] || '#3b82f6'
}

function Avatar({ name, size = 48, role }) {
  const initials = (name || '?').slice(0, 2).toUpperCase()
  const bg = role === 'admin' ? '#1d4ed8' : '#0f172a'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, flexShrink: 0,
      border: '2px solid #e2e8f0',
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
      {/* Profile card */}
      <div style={{
        background: '#fff', borderRadius: 16,
        border: '1px solid #e8ecf0',
        boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
        padding: '20px 16px', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            {user.avatarUrl
              ? <img
                  src={user.avatarUrl.startsWith('http') ? user.avatarUrl : `${API}${user.avatarUrl}`}
                  alt={user.username}
                  style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0' }}
                />
              : <Avatar name={user.username} size={56} role={user.role} />
            }
            <div style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 14, height: 14, borderRadius: '50%',
              background: '#10b981', border: '2px solid #fff',
            }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{user.username}</div>
            {user.role === 'admin'
              ? <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>
                  <i className="fas fa-crown" style={{ marginRight: 4 }}></i>Admin
                </div>
              : <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Student</div>
            }
            {joinDate && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>Joined {joinDate}</div>}
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav style={{
        background: '#fff', borderRadius: 16,
        border: '1px solid #e8ecf0',
        boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
        padding: '8px 8px', marginBottom: 12,
      }}>
        {NAV_LINKS.map((link) => {
          const isActive = pathname === link.to || (link.to === '/sheets' && pathname.startsWith('/sheets'))
          const Icon = link.icon
          return (
            <Link
              key={link.to}
              to={link.to}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10,
                textDecoration: 'none',
                background: isActive ? '#eff6ff' : 'transparent',
                color: isActive ? '#1d4ed8' : '#475569',
                fontWeight: isActive ? 700 : 500,
                fontSize: 14, marginBottom: 2,
                transition: 'all 0.15s',
                borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f8fafc' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              <Icon size={15} />
              {link.label}
            </Link>
          )
        })}
      </nav>

      {/* My Courses */}
      <div style={{
        background: '#fff', borderRadius: 16,
        border: '1px solid #e8ecf0',
        boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
        padding: '14px 16px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', marginBottom: 10 }}>
          MY COURSES
        </div>
        {courseCodes.length === 0
          ? <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: '4px 0' }}>No courses yet</div>
          : courseCodes.map(code => (
              <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: courseColor(code), flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{code}</span>
              </div>
            ))
        }
        <button
          onClick={() => navigate('/settings?tab=courses')}
          style={{
            marginTop: 10, width: '100%', padding: '7px',
            background: '#f8fafc', border: '1px dashed #cbd5e1',
            borderRadius: 8, color: '#64748b', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: FONT,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          <IconPlus size={12} />Add Course
        </button>
      </div>

      {/* Admin panel shortcut */}
      {user.role === 'admin' && (
        <div style={{ marginTop: 12 }}>
          <Link
            to="/admin"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px', borderRadius: 10,
              textDecoration: 'none', background: '#fefce8',
              color: '#92400e', fontWeight: 700, fontSize: 13,
              border: '1px solid #fde68a',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fef9c3' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fefce8' }}
          >
            <IconSettings size={14} />
            Admin Panel
          </Link>
        </div>
      )}
    </>
  )

  if (mode === 'drawer') {
    return (
      <aside style={{ position: 'sticky', top: 74, alignSelf: 'start', fontFamily: FONT, zIndex: 25 }}>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          ref={triggerButtonRef}
          aria-expanded={drawerOpen}
          aria-controls="app-sidebar-drawer"
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: 12,
            background: '#fff',
            color: '#0f172a',
            fontWeight: 700,
            padding: '10px 14px',
            fontSize: 13,
            fontFamily: FONT,
          }}
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
              background: 'rgba(15, 23, 42, 0.45)',
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
                }
              }}
              onClick={(event) => event.stopPropagation()}
              style={{
                width: 'min(86vw, 320px)',
                height: '100%',
                overflowY: 'auto',
                background: '#f1f5f9',
                padding: 14,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Navigation</div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  ref={closeButtonRef}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: 10,
                    background: '#fff',
                    color: '#475569',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '6px 10px',
                    fontFamily: FONT,
                  }}
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
    <aside style={{ position: 'sticky', top: 74, alignSelf: 'start', fontFamily: FONT }}>
      {shell}
    </aside>
  )
}
