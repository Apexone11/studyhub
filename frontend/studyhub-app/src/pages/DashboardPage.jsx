import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  IconBell,
  IconCamera,
  IconChevronDown,
  IconFeed,
  IconFork,
  IconNotes,
  IconProfile,
  IconSearch,
  IconSettings,
  IconSheets,
  IconSignOut,
  IconStar,
  IconTests,
  IconUpload,
  LogoMark,
} from '../components/Icons'
import { pageColumns, pageShell } from '../lib/ui'
import { clearStoredSession, getStoredUser, hasStoredSession, logoutSession, setStoredUser } from '../lib/session'

import { API } from '../config'

const authHeaders = () => ({
  'Content-Type': 'application/json',
})

function Avatar({ name, size = 36, role }) {
  const initials = (name || '?').slice(0, 2).toUpperCase()
  const colors = { admin: '#1d4ed8', student: '#0f172a' }
  const bg = colors[role] || '#1e293b'
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.35,
        fontWeight: 700,
        flexShrink: 0,
        border: '2px solid #e2e8f0',
      }}
    >
      {initials}
    </div>
  )
}

const NAV_LINKS = [
  { icon: IconFeed, label: 'Feed', to: '/feed' },
  { icon: IconSheets, label: 'Study Sheets', to: '/sheets' },
  { icon: IconTests, label: 'Practice Tests', to: '/tests' },
  { icon: IconNotes, label: 'My Notes', to: '/notes' },
  { icon: IconProfile, label: 'Dashboard', to: '/dashboard' },
  { icon: IconSettings, label: 'Settings', to: '/settings' },
]

const QUICK_ACTIONS = [
  { icon: IconSheets, label: 'Study Sheets', to: '/sheets', color: '#3b82f6', bg: '#eff6ff' },
  { icon: IconTests, label: 'Practice Tests', to: '/tests', color: '#10b981', bg: '#f0fdf4' },
  { icon: IconUpload, label: 'Upload Sheet', to: '/sheets/upload', color: '#8b5cf6', bg: '#f5f3ff' },
  { icon: IconSettings, label: 'Settings', to: '/settings', color: '#64748b', bg: '#f8fafc' },
]

export default function DashboardPage() {
  const [user, setUser] = useState(() => getStoredUser())
  const [loading, setLoading] = useState(true)
  const [sheets, setSheets] = useState([])
  const [mySheetCount, setMySheetCount] = useState(0)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const avatarInputRef = useRef(null)
  const navigate = useNavigate()

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    const MAX_SIZE = 2 * 1024 * 1024

    if (!ALLOWED_TYPES.includes(file.type)) {
      setAvatarError('Avatar must be a JPEG, PNG, WebP, or GIF image.')
      return
    }
    if (file.size > MAX_SIZE) {
      setAvatarError('Avatar must be 2 MB or smaller.')
      return
    }

    setAvatarError('')
    setAvatarUploading(true)

    const formData = new FormData()
    formData.append('avatar', file)

    try {
      const res = await fetch(`${API}/api/upload/avatar`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) { setAvatarError(data.error || 'Upload failed.'); return }
      setUser(prev => ({ ...prev, avatarUrl: data.avatarUrl }))
      setStoredUser({ ...user, avatarUrl: data.avatarUrl })
    } catch {
      setAvatarError('Could not connect to server.')
    } finally {
      setAvatarUploading(false)
      e.target.value = ''
    }
  }

  useEffect(() => {
    if (!hasStoredSession()) {
      navigate('/login')
      return undefined
    }

    let isMounted = true

    async function loadDashboard() {
      try {
        const meResponse = await fetch(`${API}/api/auth/me`, { headers: authHeaders() })
        if (!meResponse.ok) {
          clearStoredSession()
          navigate('/login')
          return
        }
        const meData = await meResponse.json()
        if (!isMounted) return
        setUser(meData)
        setStoredUser(meData)

        const [sheetsResponse, mineResponse] = await Promise.all([
          fetch(`${API}/api/sheets?limit=10`, { headers: authHeaders() }),
          fetch(`${API}/api/sheets?mine=1&limit=1`, { headers: authHeaders() }),
        ])
        if (!isMounted) return
        if (sheetsResponse.ok) {
          const sheetsData = await sheetsResponse.json()
          setSheets(sheetsData.sheets || sheetsData || [])
        }
        if (mineResponse.ok) {
          const mineData = await mineResponse.json()
          setMySheetCount(mineData.total || 0)
        }
      } catch {
        // silently fail — user data from localStorage still shown
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadDashboard()
    return () => { isMounted = false }
  }, [navigate])

  async function handleLogout() {
    await logoutSession()
    navigate('/')
  }

  const courses = user?.enrollments || []
  const courseCount = courses.length

  const joinedDateLabel = useMemo(() => {
    if (!user?.createdAt) return 'Unknown'
    const d = new Date(user.createdAt)
    if (Number.isNaN(d.getTime())) return 'Unknown'
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }, [user?.createdAt])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#edf0f5',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        color: '#1e293b',
      }}
    >
      {/* ── Top nav ──────────────────────────────────────────── */}
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: '#0f172a',
          borderBottom: '1px solid #1e293b',
          height: 'clamp(60px, 5vw, 74px)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 clamp(16px, 2.5vw, 40px)',
          gap: 16,
        }}
      >
        <Link to="/feed" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
          <LogoMark size={28} />
          <span style={{ fontWeight: 800, fontSize: 16, color: '#fff', letterSpacing: '-0.3px' }}>
            Study<span style={{ color: '#3b82f6' }}>Hub</span>
          </span>
        </Link>

        <div style={{ flex: 1, maxWidth: 520, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <IconSearch size={13} style={{ color: '#475569' }} />
          </div>
          <input
            placeholder="Search sheets, courses, students..."
            style={{
              width: '100%',
              padding: '8px 14px 8px 34px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 10,
              color: '#94a3b8',
              fontSize: 13,
              fontFamily: 'inherit',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.color = '#fff' }}
            onBlur={(e) => { e.target.style.borderColor = '#334155'; e.target.style.color = '#94a3b8' }}
          />
        </div>

        <div style={{ flex: 1 }} />

        <button
          title="Notifications"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '5px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            transition: 'color .15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#fff' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8' }}
        >
          <IconBell size={17} />
        </button>

        <div
          style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}
          onClick={() => navigate('/dashboard')}
        >
          <Avatar name={user?.username} size={30} role={user?.role} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{user?.username || '...'}</span>
          <IconChevronDown size={13} style={{ color: '#64748b' }} />
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div
        style={{
          ...pageShell('app', 76, 60),
          display: 'grid',
          gridTemplateColumns: pageColumns.appTwoColumn,
          gap: 24,
        }}
      >
        {/* Left sidebar */}
        <aside style={{ position: 'sticky', top: 76, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Profile card */}
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              border: '1px solid #e8ecf0',
              boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
              padding: '20px 16px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative' }}>
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl?.startsWith('http') ? user.avatarUrl : `${API}${user.avatarUrl}`}
                    alt={user.username}
                    style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0' }}
                  />
                ) : (
                  <Avatar name={user?.username} size={64} role={user?.role} />
                )}
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={handleAvatarChange}
                />
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  title="Change profile photo"
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: '#3b82f6',
                    border: '2px solid #fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: avatarUploading ? 'wait' : 'pointer',
                    padding: 0,
                  }}
                >
                  {avatarUploading
                    ? <span style={{ fontSize: 8, color: '#fff' }}>...</span>
                    : <IconCamera size={11} style={{ color: '#fff' }} />
                  }
                </button>
              </div>
              {avatarError && <div style={{ fontSize: 11, color: '#dc2626', textAlign: 'center', maxWidth: 160 }}>{avatarError}</div>}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{user?.username || '...'}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, textTransform: 'capitalize' }}>{user?.role || 'student'}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Joined {joinedDateLabel}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, width: '100%', marginTop: 4 }}>
                {[
                  { label: 'Courses', val: courseCount },
                  { label: 'Sheets', val: mySheetCount },
                  { label: 'Stars', val: 0 },
                ].map((stat) => (
                  <div key={stat.label} style={{ textAlign: 'center', background: '#f8fafc', borderRadius: 10, padding: '8px 4px' }}>
                    <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>{stat.val}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Nav links */}
          <nav
            style={{
              background: '#fff',
              borderRadius: 16,
              border: '1px solid #e8ecf0',
              boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
              padding: '8px',
            }}
          >
            {NAV_LINKS.map((link) => {
              const isActive = window.location.pathname === link.to
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 10,
                    textDecoration: 'none',
                    background: isActive ? '#eff6ff' : 'transparent',
                    color: isActive ? '#1d4ed8' : '#475569',
                    fontWeight: isActive ? 700 : 500,
                    fontSize: 14,
                    marginBottom: 2,
                    transition: 'all 0.15s',
                    borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#f8fafc' }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  <link.icon size={15} />
                  {link.label}
                </Link>
              )
            })}
          </nav>

          {/* Sign out */}
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '10px',
              background: '#fff',
              border: '1px solid #fecaca',
              borderRadius: 12,
              color: '#dc2626',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
          >
            <IconSignOut size={14} />
            Sign Out
          </button>
        </aside>

        {/* Main content */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Welcome banner */}
          <div
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
              borderRadius: 16,
              padding: '28px 28px',
              border: '1px solid #1e3a5f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
                Welcome back, {user?.username || 'Student'}.
              </h1>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: '#94a3b8', lineHeight: 1.6 }}>
                {courseCount > 0
                  ? `You are enrolled in ${courseCount} course${courseCount > 1 ? 's' : ''}.`
                  : 'Add your courses to personalize your experience.'}
              </p>
            </div>
            <Link
              to="/settings?tab=courses"
              style={{
                flexShrink: 0,
                padding: '10px 20px',
                background: '#3b82f6',
                color: '#fff',
                borderRadius: 10,
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {courseCount > 0 ? 'Manage Courses' : 'Add Courses'}
            </Link>
          </div>

          {/* Admin shortcut */}
          {user?.role === 'admin' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Link
                to="/admin"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#3b82f6', fontWeight: 700, textDecoration: 'none', padding: '6px 14px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}
              >
                ← Back to Admin Panel
              </Link>
            </div>
          )}

          {/* Quick actions */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 }}>
              Loading your dashboard...
            </div>
          ) : (
            <>
              <section>
                <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Quick Actions</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {QUICK_ACTIONS.map((action) => (
                    <Link
                      key={action.label}
                      to={action.to}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 10,
                        padding: '20px 16px',
                        background: '#fff',
                        border: '1px solid #e8ecf0',
                        borderRadius: 14,
                        textDecoration: 'none',
                        transition: 'box-shadow 0.18s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(15,23,42,0.08)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
                    >
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: action.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <action.icon size={20} style={{ color: action.color }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{action.label}</span>
                    </Link>
                  ))}
                </div>
              </section>

              {/* My Courses */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>My Courses</h2>
                  <Link to="/settings?tab=courses" style={{ fontSize: 13, color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>Manage</Link>
                </div>

                {courses.length === 0 ? (
                  <div
                    style={{
                      background: '#fff',
                      borderRadius: 14,
                      border: '1px solid #e8ecf0',
                      padding: '32px',
                      textAlign: 'center',
                      color: '#94a3b8',
                      fontSize: 14,
                    }}
                  >
                    <IconSheets size={28} style={{ color: '#cbd5e1', marginBottom: 10 }} />
                    <p style={{ margin: '0 0 16px' }}>No courses added yet.</p>
                    <Link
                      to="/settings?tab=courses"
                      style={{
                        padding: '8px 20px',
                        background: '#3b82f6',
                        color: '#fff',
                        borderRadius: 8,
                        textDecoration: 'none',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      Select Courses
                    </Link>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                    {courses.map((enrollment) => {
                      const course = enrollment.course || {}
                      const school = course.school || {}
                      return (
                        <div
                          key={enrollment.id}
                          style={{
                            background: '#fff',
                            borderRadius: 14,
                            border: '1px solid #e8ecf0',
                            padding: '16px 18px',
                            transition: 'box-shadow 0.18s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(15,23,42,0.08)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
                        >
                          <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.06em' }}>
                            {school.short || school.name || 'School'}
                          </p>
                          <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                            {course.name || 'Untitled'}
                          </p>
                          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>
                            {course.code || 'No code'}
                          </p>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Link
                              to={`/sheets?course=${course.id}`}
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#1d4ed8',
                                padding: '4px 10px',
                                borderRadius: 7,
                                background: '#eff6ff',
                                textDecoration: 'none',
                              }}
                            >
                              Sheets
                            </Link>
                            <Link
                              to="/tests"
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#065f46',
                                padding: '4px 10px',
                                borderRadius: 7,
                                background: '#f0fdf4',
                                textDecoration: 'none',
                              }}
                            >
                              Tests
                            </Link>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* Recent Sheets */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Recent Sheets</h2>
                  <Link to="/sheets" style={{ fontSize: 13, color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>Browse all</Link>
                </div>

                {sheets.length === 0 ? (
                  <div
                    style={{
                      background: '#fff',
                      borderRadius: 14,
                      border: '1px solid #e8ecf0',
                      padding: '24px',
                      textAlign: 'center',
                      color: '#94a3b8',
                      fontSize: 14,
                    }}
                  >
                    No sheets yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sheets.slice(0, 5).map((sheet) => (
                      <Link
                        key={sheet.id}
                        to={`/sheets/${sheet.id}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          background: '#fff',
                          borderRadius: 12,
                          border: '1px solid #e8ecf0',
                          padding: '14px 18px',
                          textDecoration: 'none',
                          transition: 'box-shadow 0.18s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(15,23,42,0.08)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
                      >
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <IconSheets size={16} style={{ color: '#3b82f6' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {sheet.title}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            by {sheet.author?.username || 'unknown'} · {sheet.course?.code || ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>
                            <IconStar size={12} /> {sheet.stars || 0}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>
                            <IconFork size={12} /> {sheet.forks || 0}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              {/* Account overview */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Account</h2>
                  <Link to="/settings" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>
                    <IconSettings size={13} />
                    Manage Settings
                  </Link>
                </div>
                <div
                  style={{
                    background: '#fff',
                    borderRadius: 14,
                    border: '1px solid #e8ecf0',
                    padding: '20px 24px',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
                    {[
                      { label: 'Username', value: user?.username || 'Unknown' },
                      { label: 'Role', value: user?.role || 'student' },
                      { label: 'Joined', value: joinedDateLabel },
                      { label: 'Courses', value: courseCount },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.06em' }}>
                          {label.toUpperCase()}
                        </p>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a', textTransform: label === 'Role' ? 'capitalize' : 'none' }}>
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
