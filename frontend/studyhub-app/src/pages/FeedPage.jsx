import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  IconAnnouncements,
  IconBell,
  IconChevronDown,
  IconDownload,
  IconFeed,
  IconFork,
  IconNotes,
  IconPlus,
  IconProfile,
  IconSearch,
  IconSheets,
  IconSignOut,
  IconStar,
  IconStarFilled,
  IconTests,
  IconUpload,
  LogoMark,
} from '../components/Icons'
import { pageColumns, pageShell } from '../lib/ui'

import { API } from '../config'

const getToken = () => localStorage.getItem('token')

const authHeaders = () => ({
  'Content-Type': 'application/json',
  ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
})

const FALLBACK_USER = {
  username: '...',
  school: '',
  role: 'student',
  courses: [],
  stats: { sheets: 0, stars: 0, forks: 0 },
}

const FEED_ITEMS = [
  {
    id: 1,
    type: 'announcement',
    pinned: true,
    author: 'StudyHub',
    authorRole: 'admin',
    time: '2h ago',
    title: 'Welcome to StudyHub Beta!',
    body: "You're one of the first students using StudyHub. Upload your study sheets, earn stars from classmates, and help us build the best study platform at UMD.",
    tags: ['announcement'],
  },
  {
    id: 2,
    type: 'sheet',
    pinned: false,
    author: 'studyhub_seed',
    authorRole: 'student',
    time: '3h ago',
    title: 'CMSC131 Complete Study Guide',
    body: 'Covers object-oriented programming basics, classes, inheritance, recursion, and arrays. 8 pages of clean notes with code examples.',
    course: 'CMSC131',
    stars: 24,
    forks: 7,
    downloads: 67,
    tags: ['java', 'oop', 'cmsc131'],
  },
  {
    id: 3,
    type: 'sheet',
    pinned: false,
    author: 'studyhub_seed',
    authorRole: 'student',
    time: '5h ago',
    title: 'Calculus I - Limits & Derivatives Cheatsheet',
    body: 'Power rule, chain rule, product and quotient rules all in one page. Great for quick review before exams.',
    course: 'MATH140',
    stars: 31,
    forks: 9,
    downloads: 89,
    tags: ['calculus', 'derivatives', 'math140'],
  },
  {
    id: 4,
    type: 'activity',
    pinned: false,
    author: 'classmate_42',
    authorRole: 'student',
    time: '6h ago',
    title: 'forked your sheet',
    body: '"CMSC131 Recursion Cheatsheet" was forked by classmate_42.',
    relatedSheet: 'CMSC131 Recursion Cheatsheet',
  },
  {
    id: 5,
    type: 'sheet',
    pinned: false,
    author: 'studyhub_seed',
    authorRole: 'student',
    time: '1d ago',
    title: 'CMSC131 Recursion Cheatsheet',
    body: 'Base case, recursive case, common patterns, and tracing diagrams. Everything you need for the recursion unit.',
    course: 'CMSC131',
    stars: 18,
    forks: 5,
    downloads: 45,
    tags: ['recursion', 'java', 'cmsc131'],
  },
]

const NAV_LINKS = [
  { icon: IconFeed, label: 'Feed', to: '/feed' },
  { icon: IconSheets, label: 'Study Sheets', to: '/sheets' },
  { icon: IconTests, label: 'Practice Tests', to: '/tests' },
  { icon: IconNotes, label: 'My Notes', to: '/notes' },
  { icon: IconAnnouncements, label: 'Announcements', to: '/announcements' },
  { icon: IconProfile, label: 'Profile', to: '/dashboard' },
]

const COURSE_COLORS = {
  CMSC: '#8b5cf6',
  MATH: '#10b981',
  ENGL: '#f59e0b',
  PHYS: '#0ea5e9',
  BIOL: '#ec4899',
  HIST: '#6366f1',
  ECON: '#14b8a6',
  CHEM: '#f97316',
}

function courseColor(code = '') {
  return COURSE_COLORS[code.replace(/\d.*/, '').toUpperCase()] || '#3b82f6'
}

function timeAgo(value) {
  if (!value) return 'recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function summarizeSheetContent(content = '') {
  const plain = content
    .replace(/[#*`>_~[\]]/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!plain) return ''
  if (plain.length <= 160) return plain
  return `${plain.slice(0, 157)}...`
}

function extractTags(content = '') {
  return (content.match(/#\w+/g) || []).slice(0, 3).map((tag) => tag.replace(/^#/, ''))
}

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

function Badge({ text, color = '#64748b' }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        padding: '2px 8px',
        borderRadius: 99,
        background: `${color}18`,
        color,
        border: `1px solid ${color}30`,
      }}
    >
      {text}
    </span>
  )
}

function actionBtn(color) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '5px 9px',
    borderRadius: 7,
    border: 'none',
    background: 'transparent',
    color,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background .15s',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  }
}

function FeedCard({ item }) {
  const sheetId = item.sheetId || item.id
  const [starred, setStarred] = useState(!!item.starred)
  const [starCount, setStarCount] = useState(item.stars || 0)
  const [dlCount, setDlCount] = useState(item.downloads || 0)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const typeColors = {
    announcement: '#f59e0b',
    sheet: '#3b82f6',
    activity: '#10b981',
  }

  const typeLabel = {
    announcement: 'Announcement',
    sheet: 'Study Sheet',
    activity: 'Activity',
  }

  const accent = typeColors[item.type] || '#3b82f6'

  async function handleStar(e) {
    e.stopPropagation()
    if (!getToken()) { navigate('/login'); return }
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`${API}/api/sheets/${sheetId}/star`, {
        method: 'POST',
        headers: authHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setStarred(data.starred)
        setStarCount(data.stars)
      }
    } catch { /* silently ignore */ }
    finally { setBusy(false) }
  }

  async function handleDownload(e) {
    e.stopPropagation()
    try {
      const res = await fetch(`${API}/api/sheets/${sheetId}/download`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setDlCount(data.downloads)
      }
    } catch { /* silently ignore */ }
    // Navigate to view the sheet so they can copy/save content
    navigate(`/sheets/${sheetId}`)
  }

  function handleFork(e) {
    e.stopPropagation()
    if (!getToken()) { navigate('/login'); return }
    navigate(`/sheets/${sheetId}`)
  }

  return (
    <div
      onClick={() => item.type === 'sheet' && navigate(`/sheets/${sheetId}`)}
      style={{
        background: '#fff',
        borderRadius: 14,
        border: item.pinned ? '1px solid #fbbf24' : '1px solid #e8ecf0',
        borderLeft: `3px solid ${accent}`,
        marginBottom: 14,
        overflow: 'hidden',
        transition: 'box-shadow 0.18s',
        cursor: item.type === 'sheet' ? 'pointer' : 'default',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.boxShadow = '0 4px 20px rgba(15,23,42,0.08)'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.boxShadow = 'none'
      }}
    >
      {item.pinned && (
        <div
          style={{
            background: '#fef9ec',
            padding: '5px 18px',
            borderBottom: '1px solid #fde68a',
            fontSize: 11,
            fontWeight: 600,
            color: '#92400e',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <i className="fas fa-thumbtack" style={{ fontSize: 10 }}></i>
          Pinned announcement
        </div>
      )}

      <div style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
          <Avatar name={item.author} size={36} role={item.authorRole} />

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{item.author}</span>
              {item.authorRole === 'admin' && <Badge text="Admin" color="#f59e0b" />}
              {item.course && <Badge text={item.course} color={courseColor(item.course)} />}
            </div>

            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              {typeLabel[item.type]} · {item.time}
            </div>
          </div>

          <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0 }} />
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 5, lineHeight: 1.35 }}>
            {item.type === 'activity'
              ? (
                  <span>
                    <span style={{ color: '#3b82f6' }}>{item.author}</span>
                    {' '}
                    {item.title}
                  </span>
                )
              : item.title}
          </div>
          <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.65, margin: 0 }}>{item.body}</p>
        </div>

        {item.tags && item.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
            {item.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 11,
                  color: '#64748b',
                  background: '#f1f5f9',
                  padding: '2px 8px',
                  borderRadius: 99,
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {item.type === 'sheet' && (
          <div style={{ display: 'flex', gap: 3, paddingTop: 10, borderTop: '1px solid #f1f5f9', alignItems: 'center' }}>
            <button onClick={handleStar} style={actionBtn(starred ? '#f59e0b' : '#64748b')} title={starred ? 'Unstar' : 'Star'}>
              {starred ? <IconStarFilled size={13} style={{ color: '#f59e0b' }} /> : <IconStar size={13} />}
              <span>{starCount}</span>
            </button>

            <button onClick={handleFork} style={actionBtn('#64748b')} title="Fork sheet">
              <IconFork size={13} />
              <span>{item.forks || 0}</span>
            </button>

            <button onClick={handleDownload} style={actionBtn('#64748b')} title="Download / view sheet">
              <IconDownload size={13} />
              <span>{dlCount}</span>
            </button>

            <div style={{ flex: 1 }} />

            <Link
              to={`/sheets/${sheetId}`}
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#3b82f6',
                textDecoration: 'none',
                padding: '5px 13px',
                borderRadius: 8,
                border: '1px solid #bfdbfe',
                background: '#eff6ff',
              }}
            >
              View Sheet
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FeedPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const [user, setUser] = useState(FALLBACK_USER)
  const [filter, setFilter] = useState('all')
  const [compose, setCompose] = useState('')
  const [composeExpanded, setComposeExpanded] = useState(false)
  const [feedSheets, setFeedSheets] = useState([])
  const [leaderStars, setLeaderStars] = useState([])
  const [leaderDownloads, setLeaderDownloads] = useState([])
  const [leaderContribs, setLeaderContribs] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimer = useRef(null)

  const maxCompose = 280

  useEffect(() => {
    let cancelled = false
    const token = getToken()

    if (!token) {
      navigate('/login')
      return undefined
    }

    fetch(`${API}/api/auth/me`, { headers: authHeaders() })
      .then((response) => {
        if (!response.ok) throw new Error('Failed to fetch current user')
        return response.json()
      })
      .then((data) => {
        if (cancelled) return

        const courses = (data.enrollments || []).map((entry) => entry.course?.code).filter(Boolean)

        setUser({
          username: data.username || FALLBACK_USER.username,
          school: data.enrollments?.[0]?.course?.school?.name || 'StudyHub',
          role: data.role || 'student',
          courses: courses.length > 0 ? courses : ['No courses yet'],
          stats: {
            sheets: 0,
            stars: 0,
            forks: 0,
          },
        })
      })
      .catch(() => {
        if (!cancelled) navigate('/login')
      })

    return () => {
      cancelled = true
    }
  }, [navigate])

  useEffect(() => {
    let cancelled = false

    fetch(`${API}/api/sheets?limit=5`, { headers: authHeaders() })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return
        setFeedSheets(data.sheets || data || [])
      })
      .catch(() => {
        if (!cancelled) setFeedSheets([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    Promise.all([
      fetch(`${API}/api/sheets/leaderboard?type=stars`).then(r => r.json()).catch(() => []),
      fetch(`${API}/api/sheets/leaderboard?type=downloads`).then(r => r.json()).catch(() => []),
      fetch(`${API}/api/sheets/leaderboard?type=contributors`).then(r => r.json()).catch(() => []),
    ]).then(([stars, downloads, contribs]) => {
      if (cancelled) return
      setLeaderStars(Array.isArray(stars) ? stars : [])
      setLeaderDownloads(Array.isArray(downloads) ? downloads : [])
      setLeaderContribs(Array.isArray(contribs) ? contribs : [])
    })

    return () => { cancelled = true }
  }, [])

  // Debounced search
  useEffect(() => {
    clearTimeout(searchTimer.current)
    if (!searchQuery.trim()) {
      // Restore default feed
      fetch(`${API}/api/sheets?limit=5`, { headers: authHeaders() })
        .then(r => r.json()).then(d => setFeedSheets(d.sheets || d || [])).catch(() => {})
      return
    }
    searchTimer.current = setTimeout(() => {
      setSearchLoading(true)
      fetch(`${API}/api/sheets?search=${encodeURIComponent(searchQuery.trim())}&limit=10`, { headers: authHeaders() })
        .then(r => r.json())
        .then(d => setFeedSheets(d.sheets || d || []))
        .catch(() => {})
        .finally(() => setSearchLoading(false))
    }, 300)
    return () => clearTimeout(searchTimer.current)
  }, [searchQuery])

  const combinedFeed = [
    FEED_ITEMS[0],
    ...feedSheets.map((sheet) => ({
      id: sheet.id,
      sheetId: sheet.id,
      type: 'sheet',
      author: sheet.author?.username || 'unknown',
      authorRole: 'student',
      time: timeAgo(sheet.createdAt),
      title: sheet.title,
      body: summarizeSheetContent(sheet.content),
      course: sheet.course?.code,
      stars: sheet.stars || 0,
      forks: sheet.forks || 0,
      downloads: sheet.downloads || 0,
      tags: extractTags(sheet.content),
    })),
    FEED_ITEMS[3],
  ]

  const filtered = filter === 'all'
    ? combinedFeed
    : combinedFeed.filter((item) => item.type === filter)

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#edf0f5',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        color: '#1e293b',
      }}
    >
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
            Study
            <span style={{ color: '#3b82f6' }}>Hub</span>
          </span>
        </Link>

        <div style={{ flex: 1, maxWidth: 520, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <IconSearch size={13} style={{ color: '#475569' }} />
          </div>

          <input
            placeholder="Search sheets, courses, students..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 34px 8px 34px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 10,
              color: searchQuery ? '#fff' : '#94a3b8',
              fontSize: 13,
              fontFamily: 'inherit',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={(event) => {
              event.target.style.borderColor = '#3b82f6'
              event.target.style.color = '#fff'
            }}
            onBlur={(event) => {
              event.target.style.borderColor = '#334155'
              if (!searchQuery) event.target.style.color = '#94a3b8'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, padding: 0 }}
            >
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <Link
          to="/sheets/upload"
          title="Upload Sheet"
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
            textDecoration: 'none',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.color = '#94a3b8'
          }}
        >
          <IconUpload size={17} />
        </Link>

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
          onMouseEnter={(event) => {
            event.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.color = '#94a3b8'
          }}
        >
          <IconBell size={17} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
          <Avatar name={user.username} size={30} role={user.role} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{user.username}</span>
          <IconChevronDown size={13} style={{ color: '#64748b' }} />
        </div>
      </header>

      <div
        style={{
          ...pageShell('app', 72, 60),
          display: 'grid',
          gridTemplateColumns: pageColumns.appThreeColumn,
          gap: 24,
        }}
      >
        <aside style={{ position: 'sticky', top: 76, alignSelf: 'start' }}>
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              border: '1px solid #e8ecf0',
              boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
              padding: '20px 16px',
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative' }}>
                <Avatar name={user.username} size={64} role={user.role} />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#10b981',
                    border: '2px solid #fff',
                  }}
                />
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{user.username}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{user.school}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, width: '100%', marginTop: 4 }}>
                {[
                  { label: 'Sheets', val: user.stats.sheets },
                  { label: 'Stars', val: user.stats.stars },
                  { label: 'Forks', val: user.stats.forks },
                ].map((stat) => (
                  <div key={stat.label} style={{ textAlign: 'center', background: '#f8fafc', borderRadius: 10, padding: '8px 4px' }}>
                    <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>{stat.val}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <nav
            style={{
              background: '#fff',
              borderRadius: 16,
              border: '1px solid #e8ecf0',
              boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
              padding: '8px 8px',
              marginBottom: 12,
            }}
          >
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.to
              const IconComponent = link.icon

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
                  onMouseEnter={(event) => {
                    if (!isActive) event.currentTarget.style.background = '#f8fafc'
                  }}
                  onMouseLeave={(event) => {
                    if (!isActive) event.currentTarget.style.background = 'transparent'
                  }}
                >
                  <IconComponent size={15} />
                  {link.label}
                </Link>
              )
            })}
          </nav>

          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              border: '1px solid #e8ecf0',
              boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', marginBottom: 10 }}>
              MY COURSES
            </div>

            {user.courses.map((course) => (
              <div key={course} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: courseColor(course), flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{course}</span>
              </div>
            ))}

            <button
              style={{
                marginTop: 10,
                width: '100%',
                padding: '7px',
                background: '#f8fafc',
                border: '1px dashed #cbd5e1',
                borderRadius: 8,
                color: '#64748b',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              <IconPlus size={12} />
              Add Course
            </button>
          </div>
        </aside>

        <main>
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #e8ecf0',
              padding: composeExpanded ? '14px 16px' : '12px 14px',
              marginBottom: 14,
              transition: 'all .2s',
            }}
          >
            {composeExpanded ? (
              <>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                  <Avatar name={user.username} size={34} role={user.role} />
                  <textarea
                    value={compose}
                    onChange={(event) => setCompose(event.target.value.slice(0, maxCompose))}
                    placeholder="Share a note with your course..."
                    rows={3}
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      resize: 'none',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      color: '#0f172a',
                      background: 'transparent',
                      lineHeight: 1.6,
                    }}
                    autoFocus
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      color: compose.length > maxCompose * 0.85 ? '#ef4444' : '#94a3b8',
                      marginLeft: 44,
                    }}
                  >
                    {maxCompose - compose.length}
                  </span>
                  <div style={{ flex: 1 }} />

                  <button
                    onClick={() => {
                      setCompose('')
                      setComposeExpanded(false)
                    }}
                    style={{
                      padding: '5px 12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: 7,
                      background: '#fff',
                      color: '#64748b',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Cancel
                  </button>

                  <Link
                    to="/sheets/upload"
                    style={{
                      padding: '6px 16px',
                      background: '#3b82f6',
                      color: '#fff',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <IconUpload size={12} />
                    Upload Sheet
                  </Link>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={user.username} size={34} role={user.role} />

                <div
                  style={{
                    flex: 1,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 99,
                    padding: '9px 16px',
                    color: '#94a3b8',
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'border-color .15s',
                  }}
                  onClick={() => setComposeExpanded(true)}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.borderColor = '#93c5fd'
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.borderColor = '#e2e8f0'
                  }}
                >
                  Share a study sheet with your courses...
                </div>

                <Link
                  to="/sheets/upload"
                  style={{
                    padding: '8px 16px',
                    background: '#3b82f6',
                    color: '#fff',
                    borderRadius: 99,
                    textDecoration: 'none',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    flexShrink: 0,
                  }}
                >
                  <IconUpload size={12} />
                  Upload
                </Link>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'sheet', label: 'Sheets' },
              { key: 'announcement', label: 'Announcements' },
              { key: 'activity', label: 'Activity' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                style={{
                  padding: '7px 16px',
                  borderRadius: 99,
                  border: '1px solid',
                  borderColor: filter === tab.key ? '#3b82f6' : '#e2e8f0',
                  background: filter === tab.key ? '#eff6ff' : '#fff',
                  color: filter === tab.key ? '#1d4ed8' : '#64748b',
                  fontWeight: filter === tab.key ? 700 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {searchQuery.trim() && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '8px 12px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
              <span style={{ fontSize: 13, color: '#1d4ed8' }}>
                {searchLoading ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Searching…</> : <>Results for "<strong>{searchQuery}</strong>"</>}
              </span>
              <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                Clear
              </button>
            </div>
          )}

          {filtered.map((item) => (
            <FeedCard key={item.id} item={item} />
          ))}

          <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: 13 }}>
            <button
              style={{
                padding: '10px 28px',
                borderRadius: 99,
                border: '1px solid #e2e8f0',
                background: '#fff',
                color: '#64748b',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Load more -
              <span style={{ color: '#94a3b8', fontWeight: 400 }}> pagination coming soon</span>
            </button>
          </div>
        </main>

        <aside style={{ position: 'sticky', top: 76, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Most Starred */}
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e8ecf0', boxShadow: '0 2px 10px rgba(15,23,42,0.05)', padding: '16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconStarFilled size={11} style={{ color: '#f59e0b' }} />
              TOP STARRED
            </div>
            {leaderStars.length === 0
              ? <div style={{ fontSize: 12, color: '#cbd5e1' }}>No data yet.</div>
              : leaderStars.map((sheet, index) => (
                <Link
                  key={sheet.id}
                  to={`/sheets/${sheet.id}`}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: index < leaderStars.length - 1 ? '1px solid #f1f5f9' : 'none', textDecoration: 'none' }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#cbd5e1', minWidth: 18 }}>{index + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', lineHeight: 1.4 }}>{sheet.title}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      <IconStarFilled size={11} style={{ color: '#f59e0b', marginRight: 3, verticalAlign: 'middle' }} />
                      {sheet.stars} · {sheet.course?.code}
                    </div>
                  </div>
                </Link>
              ))
            }
          </div>

          {/* Most Downloaded */}
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e8ecf0', boxShadow: '0 2px 10px rgba(15,23,42,0.05)', padding: '16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconDownload size={11} style={{ color: '#3b82f6' }} />
              MOST DOWNLOADED
            </div>
            {leaderDownloads.length === 0
              ? <div style={{ fontSize: 12, color: '#cbd5e1' }}>No data yet.</div>
              : leaderDownloads.map((sheet, index) => (
                <Link
                  key={sheet.id}
                  to={`/sheets/${sheet.id}`}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: index < leaderDownloads.length - 1 ? '1px solid #f1f5f9' : 'none', textDecoration: 'none' }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#cbd5e1', minWidth: 18 }}>{index + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', lineHeight: 1.4 }}>{sheet.title}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      <i className="fas fa-download" style={{ fontSize: 9, color: '#3b82f6', marginRight: 3 }}></i>
                      {sheet.downloads} · {sheet.course?.code}
                    </div>
                  </div>
                </Link>
              ))
            }
          </div>

          {/* Top Contributors */}
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e8ecf0', boxShadow: '0 2px 10px rgba(15,23,42,0.05)', padding: '16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fas fa-trophy" style={{ fontSize: 10, color: '#f59e0b' }}></i>
              TOP CONTRIBUTORS
            </div>
            {leaderContribs.length === 0
              ? <div style={{ fontSize: 12, color: '#cbd5e1' }}>No data yet.</div>
              : leaderContribs.map((contrib, index) => (
                <div
                  key={contrib.username}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: index < leaderContribs.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#cbd5e1', minWidth: 18 }}>{index + 1}</span>
                  <Avatar name={contrib.username} size={26} role="student" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{contrib.username}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{contrib.count} sheet{contrib.count !== 1 ? 's' : ''}</div>
                  </div>
                </div>
              ))
            }
          </div>

          <div
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
              borderRadius: 16,
              padding: '18px 16px',
              border: '1px solid #1e3a5f',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>AI Tutor</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 7px',
                  background: '#1d4ed8',
                  color: '#93c5fd',
                  borderRadius: 99,
                  letterSpacing: '0.06em',
                }}
              >
                SOON
              </span>
            </div>

            <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: '0 0 12px' }}>
              Ask anything about your courses. Claude AI will explain concepts, generate practice questions, and guide you step by step.
            </p>

            <button
              disabled
              style={{
                width: '100%',
                padding: '9px',
                background: '#1e3a5f',
                border: '1px solid #2d4a7a',
                borderRadius: 10,
                color: '#64748b',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              Coming in V1
            </button>
          </div>

          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              border: '1px solid #e8ecf0',
              boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', marginBottom: 10 }}>
              QUICK ACTIONS
            </div>

            {[
              { Icon: IconSheets, label: 'Browse All Sheets', to: '/sheets', ready: true },
              { Icon: IconUpload, label: 'Upload a Sheet', to: '/sheets/upload', ready: true },
              { Icon: IconTests, label: 'Take a Practice Test', to: '/tests', ready: false },
              { Icon: IconNotes, label: 'My Notes', to: '/notes', ready: false },
            ].map((action) => (
              <Link
                key={action.label}
                to={action.to}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '9px 8px',
                  borderRadius: 9,
                  textDecoration: 'none',
                  color: action.ready ? '#334155' : '#94a3b8',
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 2,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = '#f8fafc'
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'transparent'
                }}
              >
                <action.Icon size={14} style={{ color: action.ready ? '#3b82f6' : '#cbd5e1', flexShrink: 0 }} />
                {action.label}
                {!action.ready && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#cbd5e1', fontWeight: 600 }}>SOON</span>}
              </Link>
            ))}
          </div>

          <button
            onClick={() => {
              localStorage.removeItem('token')
              localStorage.removeItem('user')
              navigate('/login')
            }}
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
            onMouseEnter={(event) => {
              event.currentTarget.style.background = '#fef2f2'
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = '#fff'
            }}
          >
            <IconSignOut size={14} />
            Sign Out
          </button>

          <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.8, padding: '0 4px' }}>
            <Link to="/terms" style={{ color: '#cbd5e1', textDecoration: 'none', marginRight: 8 }}>Terms</Link>
            <Link to="/privacy" style={{ color: '#cbd5e1', textDecoration: 'none', marginRight: 8 }}>Privacy</Link>
            <Link to="/guidelines" style={{ color: '#cbd5e1', textDecoration: 'none' }}>Guidelines</Link>
            <div style={{ marginTop: 4 }}>(c) 2026 StudyHub · Built for students</div>
          </div>
        </aside>
      </div>
    </div>
  )
}
