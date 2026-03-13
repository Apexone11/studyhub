import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

// ─── placeholder data ────────────────────────────────────────────
const MOCK_USER = {
  username: 'Student',
  school:   'University of Maryland',
  role:     'student',
  courses:  ['CMSC131', 'MATH140', 'ENGL101'],
  stats:    { sheets: 3, stars: 12, forks: 5 },
}

const FEED_ITEMS = [
  {
    id: 1, type: 'announcement', pinned: true,
    author: 'StudyHub', authorRole: 'admin', time: '2h ago',
    title: '👋 Welcome to StudyHub Beta!',
    body:  'You\'re one of the first students using StudyHub. Upload your study sheets, earn stars from classmates, and help us build the best study platform at UMD.',
    tags:  ['announcement'],
  },
  {
    id: 2, type: 'sheet', pinned: false,
    author: 'studyhub_seed', authorRole: 'student', time: '3h ago',
    title: 'CMSC131 Complete Study Guide',
    body:  'Covers object-oriented programming basics, classes, inheritance, recursion, and arrays. 8 pages of clean notes with code examples.',
    course: 'CMSC131', stars: 24, forks: 7, downloads: 67,
    tags:  ['java', 'oop', 'cmsc131'],
  },
  {
    id: 3, type: 'sheet', pinned: false,
    author: 'studyhub_seed', authorRole: 'student', time: '5h ago',
    title: 'Calculus I – Limits & Derivatives Cheatsheet',
    body:  'Power rule, chain rule, product/quotient rules all in one page. Great for quick review before exams.',
    course: 'MATH140', stars: 31, forks: 9, downloads: 89,
    tags:  ['calculus', 'derivatives', 'math140'],
  },
  {
    id: 4, type: 'activity', pinned: false,
    author: 'classmate_42', authorRole: 'student', time: '6h ago',
    title: 'forked your sheet',
    body:  '"CMSC131 Recursion Cheatsheet" was forked by classmate_42.',
    relatedSheet: 'CMSC131 Recursion Cheatsheet',
  },
  {
    id: 5, type: 'sheet', pinned: false,
    author: 'studyhub_seed', authorRole: 'student', time: '1d ago',
    title: 'CMSC131 Recursion Cheatsheet',
    body:  'Base case, recursive case, common patterns, and tracing diagrams. Everything you need for the recursion unit.',
    course: 'CMSC131', stars: 18, forks: 5, downloads: 45,
    tags:  ['recursion', 'java', 'cmsc131'],
  },
]

const TRENDING = [
  { title: 'CMSC131 Complete Study Guide', stars: 24, course: 'CMSC131' },
  { title: 'Calculus I Limits & Derivatives', stars: 31, course: 'MATH140' },
  { title: 'CMSC131 Recursion Cheatsheet', stars: 18, course: 'CMSC131' },
]

// ─── icons (inline FA via className) ───────────────────────────
const NAV_LINKS = [
  { icon: 'fa-solid fa-house',          label: 'Feed',          to: '/feed',          active: true  },
  { icon: 'fa-solid fa-file-lines',     label: 'Study Sheets',  to: '/sheets',        active: false },
  { icon: 'fa-solid fa-circle-question',label: 'Practice Tests',to: '/tests',         active: false },
  { icon: 'fa-solid fa-note-sticky',    label: 'My Notes',      to: '/notes',         active: false },
  { icon: 'fa-solid fa-bullhorn',       label: 'Announcements', to: '/announcements', active: false },
  { icon: 'fa-solid fa-user',           label: 'Profile',       to: '/dashboard',     active: false },
]

// ─── sub-components ──────────────────────────────────────────────

function Avatar({ name, size = 36, role }) {
  const initials = name.slice(0, 2).toUpperCase()
  const colors   = { admin: '#1d4ed8', student: '#0f172a' }
  const bg       = colors[role] || '#1e293b'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700,
      flexShrink: 0, border: '2px solid #e2e8f0',
    }}>
      {initials}
    </div>
  )
}

function Badge({ text, color = '#64748b' }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
      padding: '2px 8px', borderRadius: 99,
      background: color + '18', color,
      border: `1px solid ${color}30`,
    }}>
      {text}
    </span>
  )
}

function FeedCard({ item }) {
  const [starred, setStarred] = useState(false)

  const typeColors = {
    announcement: '#f59e0b',
    sheet:        '#3b82f6',
    activity:     '#10b981',
  }
  const typeLabel = {
    announcement: 'Announcement',
    sheet:        'Study Sheet',
    activity:     'Activity',
  }

  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      border: item.pinned ? '1.5px solid #fbbf24' : '1px solid #e8ecf0',
      boxShadow: '0 2px 12px rgba(15,23,42,0.06)',
      marginBottom: 16,
      overflow: 'hidden',
      transition: 'box-shadow 0.2s',
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(15,23,42,0.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(15,23,42,0.06)'}
    >
      {item.pinned && (
        <div style={{
          background: '#fef9ec', padding: '6px 20px',
          borderBottom: '1px solid #fde68a',
          fontSize: 12, fontWeight: 600, color: '#92400e',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <i className="fa-solid fa-thumbtack" style={{ fontSize: 11 }} />
          Pinned announcement
        </div>
      )}
      <div style={{ padding: '18px 20px' }}>
        {/* header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Avatar name={item.author} size={38} role={item.authorRole} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{item.author}</span>
              {item.authorRole === 'admin' && <Badge text="Admin" color="#f59e0b" />}
              {item.course && <Badge text={item.course} color="#3b82f6" />}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {typeLabel[item.type]}  ·  {item.time}
            </div>
          </div>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: typeColors[item.type],
            flexShrink: 0,
          }} />
        </div>

        {/* body */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 6 }}>
            {item.type === 'activity'
              ? <span><span style={{ color: '#3b82f6' }}>{item.author}</span> {item.title}</span>
              : item.title
            }
          </div>
          <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.65, margin: 0 }}>
            {item.body}
          </p>
        </div>

        {/* tags */}
        {item.tags && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {item.tags.map(t => (
              <span key={t} style={{
                fontSize: 12, color: '#64748b', background: '#f1f5f9',
                padding: '2px 9px', borderRadius: 99, cursor: 'pointer',
              }}>#{t}</span>
            ))}
          </div>
        )}

        {/* actions – sheets only */}
        {item.type === 'sheet' && (
          <div style={{
            display: 'flex', gap: 4,
            paddingTop: 12, borderTop: '1px solid #f1f5f9',
          }}>
            {[
              {
                icon: starred ? 'fa-solid fa-star' : 'fa-regular fa-star',
                count: (item.stars || 0) + (starred ? 1 : 0),
                color: starred ? '#f59e0b' : '#64748b',
                action: () => setStarred(s => !s),
                label: 'Star',
              },
              {
                icon: 'fa-solid fa-code-fork',
                count: item.forks || 0,
                color: '#64748b',
                action: null,
                label: 'Fork',
              },
              {
                icon: 'fa-solid fa-download',
                count: item.downloads || 0,
                color: '#64748b',
                action: null,
                label: 'Download',
              },
              {
                icon: 'fa-regular fa-comment',
                count: 0,
                color: '#94a3b8',
                action: null,
                label: 'Comment (soon)',
                disabled: true,
              },
            ].map(btn => (
              <button key={btn.label}
                onClick={btn.action || undefined}
                disabled={btn.disabled}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 8,
                  border: 'none', background: 'transparent',
                  color: btn.color, fontSize: 13, fontWeight: 500,
                  cursor: btn.disabled ? 'default' : 'pointer',
                  opacity: btn.disabled ? 0.4 : 1,
                  transition: 'background 0.15s',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => !btn.disabled && (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                title={btn.label}
              >
                <i className={btn.icon} style={{ fontSize: 13 }} />
                <span>{btn.count}</span>
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <Link to={`/sheets/${item.id}`} style={{
              fontSize: 13, fontWeight: 600, color: '#3b82f6',
              textDecoration: 'none', padding: '5px 12px',
              borderRadius: 8, border: '1px solid #bfdbfe',
              background: '#eff6ff',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: 11 }} />
              View Sheet
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── main page ───────────────────────────────────────────────────
export default function FeedPage() {
  const navigate  = useNavigate()

  // Read real user from localStorage, fall back to defaults
  const storedUser = (() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })()
  const [user] = useState(storedUser ? {
    username: storedUser.username || MOCK_USER.username,
    school:   storedUser.school   || MOCK_USER.school,
    role:     storedUser.role     || MOCK_USER.role,
    courses:  storedUser.courses  || MOCK_USER.courses,
    stats:    storedUser.stats    || MOCK_USER.stats,
  } : MOCK_USER)

  const [filter, setFilter] = useState('all')
  const [activeNav, setActiveNav] = useState('/feed')

  const filtered = filter === 'all'
    ? FEED_ITEMS
    : FEED_ITEMS.filter(i => i.type === filter)

  return (
    <div style={{
      minHeight: '100vh',
      background: '#edf0f5',
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      color: '#1e293b',
    }}>

      {/* ── TOP NAV ─────────────────────────────────────────────── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: '#0f172a',
        borderBottom: '1px solid #1e293b',
        height: 56,
        display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: 16,
      }}>
        {/* logo */}
        <Link to="/feed" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <svg width="28" height="28" viewBox="0 0 80 80" fill="none">
            <circle cx="40" cy="40" r="38" fill="#1e293b"/>
            <line x1="40" y1="64" x2="40" y2="45" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round"/>
            <path d="M40 45 Q40 33 25 23" stroke="#3b82f6" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
            <path d="M40 45 Q40 33 55 23" stroke="#3b82f6" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
            <circle cx="40" cy="45" r="4" fill="#3b82f6"/>
            <circle cx="25" cy="23" r="3.5" fill="#60a5fa"/>
            <circle cx="55" cy="23" r="3.5" fill="#60a5fa"/>
            <rect x="30" y="67" width="20" height="4" rx="2" fill="#f59e0b"/>
          </svg>
          <span style={{ fontWeight: 800, fontSize: 17, color: '#fff', letterSpacing: '-0.3px' }}>
            Study<span style={{ color: '#3b82f6' }}>Hub</span>
          </span>
        </Link>

        {/* search bar */}
        <div style={{ flex: 1, maxWidth: 440, position: 'relative' }}>
          <i className="fa-solid fa-search" style={{
            position: 'absolute', left: 12, top: '50%',
            transform: 'translateY(-50%)',
            color: '#475569', fontSize: 13,
          }} />
          <input placeholder="Search sheets, courses, students…" style={{
            width: '100%', padding: '8px 14px 8px 36px',
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 10, color: '#94a3b8',
            fontSize: 13, fontFamily: 'inherit', outline: 'none',
            boxSizing: 'border-box',
          }}
            onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.color = '#fff' }}
            onBlur={e  => { e.target.style.borderColor = '#334155'; e.target.style.color = '#94a3b8' }}
          />
        </div>

        <div style={{ flex: 1 }} />

        {/* upload link */}
        <Link to="/sheets/upload" title="Upload Sheet" style={{
          background: 'transparent', border: 'none',
          color: '#94a3b8', fontSize: 16,
          cursor: 'pointer', padding: '6px 8px', borderRadius: 8,
          transition: 'color 0.15s', textDecoration: 'none',
          display: 'flex', alignItems: 'center',
        }}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'}
          onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
        >
          <i className="fa-solid fa-upload" />
        </Link>

        {/* bell button (placeholder) */}
        <button title="Notifications" style={{
          background: 'transparent', border: 'none',
          color: '#94a3b8', fontSize: 16,
          cursor: 'pointer', padding: '6px 8px', borderRadius: 8,
          transition: 'color 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'}
          onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
        >
          <i className="fa-solid fa-bell" />
        </button>

        {/* avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <Avatar name={user.username} size={32} role={user.role} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{user.username}</span>
          <i className="fa-solid fa-chevron-down" style={{ fontSize: 11, color: '#64748b' }} />
        </div>
      </header>

      {/* ── BODY ─────────────────────────────────────────────────── */}
      <div style={{
        maxWidth: 1140, margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: '220px 1fr 260px',
        gap: 20, padding: '72px 20px 60px',
      }}>

        {/* ── LEFT SIDEBAR ─────────────────────────────────────── */}
        <aside style={{ position: 'sticky', top: 72, alignSelf: 'start' }}>

          {/* profile card */}
          <div style={{
            background: '#fff', borderRadius: 16,
            border: '1px solid #e8ecf0',
            boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
            padding: '20px 16px', marginBottom: 12,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative' }}>
                <Avatar name={user.username} size={64} role={user.role} />
                <div style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#10b981', border: '2px solid #fff',
                }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{user.username}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{user.school}</div>
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                gap: 6, width: '100%', marginTop: 4,
              }}>
                {[
                  { label: 'Sheets', val: user.stats.sheets },
                  { label: 'Stars',  val: user.stats.stars  },
                  { label: 'Forks',  val: user.stats.forks  },
                ].map(s => (
                  <div key={s.label} style={{
                    textAlign: 'center', background: '#f8fafc',
                    borderRadius: 10, padding: '8px 4px',
                  }}>
                    <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* nav links */}
          <nav style={{
            background: '#fff', borderRadius: 16,
            border: '1px solid #e8ecf0',
            boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
            padding: '8px 8px', marginBottom: 12,
          }}>
            {NAV_LINKS.map(link => {
              const isActive = activeNav === link.to
              return (
                <Link key={link.to} to={link.to}
                  onClick={() => setActiveNav(link.to)}
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
                  <i className={link.icon} style={{ width: 16, textAlign: 'center', fontSize: 14 }} />
                  {link.label}
                </Link>
              )
            })}
          </nav>

          {/* my courses */}
          <div style={{
            background: '#fff', borderRadius: 16,
            border: '1px solid #e8ecf0',
            boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
            padding: '14px 16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', marginBottom: 10 }}>
              MY COURSES
            </div>
            {(user.courses || []).map(c => (
              <div key={c} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 0',
                borderBottom: '1px solid #f1f5f9',
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', flexShrink: 0,
                }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{c}</span>
              </div>
            ))}
            <button style={{
              marginTop: 10, width: '100%', padding: '7px',
              background: '#f8fafc', border: '1px dashed #cbd5e1',
              borderRadius: 8, color: '#64748b', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <i className="fa-solid fa-plus" style={{ marginRight: 5, fontSize: 11 }} />
              Add Course
            </button>
          </div>
        </aside>

        {/* ── CENTER FEED ──────────────────────────────────────── */}
        <main>

          {/* compose bar */}
          <div style={{
            background: '#fff', borderRadius: 16,
            border: '1px solid #e8ecf0',
            boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
            padding: '14px 16px', marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <Avatar name={user.username} size={38} role={user.role} />
            <div style={{
              flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 99, padding: '10px 18px',
              color: '#94a3b8', fontSize: 14, cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
              onClick={() => navigate('/sheets/upload')}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#93c5fd'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
            >
              Share a study sheet…
            </div>
            <Link to="/sheets/upload" style={{
              padding: '9px 18px', background: '#3b82f6',
              color: '#fff', borderRadius: 99,
              textDecoration: 'none', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6,
              flexShrink: 0,
            }}>
              <i className="fa-solid fa-upload" style={{ fontSize: 12 }} />
              Upload
            </Link>
          </div>

          {/* filter tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {[
              { key: 'all',          label: 'All'           },
              { key: 'sheet',        label: 'Sheets'        },
              { key: 'announcement', label: 'Announcements' },
              { key: 'activity',     label: 'Activity'      },
            ].map(f => (
              <button key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '7px 16px', borderRadius: 99,
                  border: '1px solid',
                  borderColor: filter === f.key ? '#3b82f6' : '#e2e8f0',
                  background:  filter === f.key ? '#eff6ff'  : '#fff',
                  color:       filter === f.key ? '#1d4ed8'  : '#64748b',
                  fontWeight:  filter === f.key ? 700        : 500,
                  fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* feed */}
          {filtered.map(item => (
            <FeedCard key={item.id} item={item} />
          ))}

          {/* load more placeholder */}
          <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: 13 }}>
            <button style={{
              padding: '10px 28px', borderRadius: 99,
              border: '1px solid #e2e8f0', background: '#fff',
              color: '#64748b', fontWeight: 600, fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Load more — <span style={{ color: '#94a3b8', fontWeight: 400 }}>pagination coming soon</span>
            </button>
          </div>
        </main>

        {/* ── RIGHT SIDEBAR ────────────────────────────────────── */}
        <aside style={{ position: 'sticky', top: 72, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* trending */}
          <div style={{
            background: '#fff', borderRadius: 16,
            border: '1px solid #e8ecf0',
            boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
            padding: '16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', marginBottom: 12 }}>
              🔥 TRENDING THIS WEEK
            </div>
            {TRENDING.map((t, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '9px 0', borderBottom: i < TRENDING.length - 1 ? '1px solid #f1f5f9' : 'none',
              }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#cbd5e1', minWidth: 18 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', lineHeight: 1.4 }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    <i className="fa-solid fa-star" style={{ color: '#f59e0b', marginRight: 3 }} />
                    {t.stars} · {t.course}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* AI assistant – placeholder */}
          <div style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
            borderRadius: 16, padding: '18px 16px',
            border: '1px solid #1e3a5f',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <i className="fa-solid fa-robot" style={{ color: '#60a5fa', fontSize: 18 }} />
              <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>AI Tutor</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px',
                background: '#1d4ed8', color: '#93c5fd',
                borderRadius: 99, letterSpacing: '0.06em',
              }}>SOON</span>
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: '0 0 12px' }}>
              Ask anything about your courses. Claude AI will explain concepts, generate practice questions, and guide you step by step.
            </p>
            <button disabled style={{
              width: '100%', padding: '9px',
              background: '#1e3a5f', border: '1px solid #2d4a7a',
              borderRadius: 10, color: '#64748b',
              fontSize: 13, fontWeight: 600, cursor: 'not-allowed',
              fontFamily: 'inherit',
            }}>
              <i className="fa-solid fa-lock" style={{ marginRight: 6, fontSize: 12 }} />
              Coming in V1
            </button>
          </div>

          {/* quick actions */}
          <div style={{
            background: '#fff', borderRadius: 16,
            border: '1px solid #e8ecf0',
            boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
            padding: '16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', marginBottom: 10 }}>
              QUICK ACTIONS
            </div>
            {[
              { icon: 'fa-solid fa-file-lines',      label: 'Browse All Sheets',    to: '/sheets',        ready: true  },
              { icon: 'fa-solid fa-upload',           label: 'Upload a Sheet',       to: '/sheets/upload', ready: true  },
              { icon: 'fa-solid fa-circle-question',  label: 'Take a Practice Test', to: '/tests',         ready: false },
              { icon: 'fa-solid fa-note-sticky',      label: 'My Notes',             to: '/notes',         ready: false },
            ].map(a => (
              <Link key={a.label} to={a.to} style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '9px 8px', borderRadius: 9,
                textDecoration: 'none',
                color: a.ready ? '#334155' : '#94a3b8',
                fontSize: 13, fontWeight: 500,
                marginBottom: 2, transition: 'background 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <i className={a.icon} style={{ width: 16, textAlign: 'center', fontSize: 13, color: a.ready ? '#3b82f6' : '#cbd5e1' }} />
                {a.label}
                {!a.ready && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#cbd5e1', fontWeight: 600 }}>SOON</span>}
              </Link>
            ))}
          </div>

          {/* sign out */}
          <button
            onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); navigate('/login') }}
            style={{
              width: '100%', padding: '10px',
              background: '#fff', border: '1px solid #fecaca',
              borderRadius: 12, color: '#dc2626',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
          >
            <i className="fa-solid fa-right-from-bracket" style={{ fontSize: 13 }} />
            Sign Out
          </button>

          {/* footer links */}
          <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.8, padding: '0 4px' }}>
            <Link to="/terms"      style={{ color: '#cbd5e1', textDecoration: 'none', marginRight: 8 }}>Terms</Link>
            <Link to="/privacy"    style={{ color: '#cbd5e1', textDecoration: 'none', marginRight: 8 }}>Privacy</Link>
            <Link to="/guidelines" style={{ color: '#cbd5e1', textDecoration: 'none' }}>Guidelines</Link>
            <div style={{ marginTop: 4 }}>© 2026 StudyHub · Built for students</div>
          </div>
        </aside>
      </div>
    </div>
  )
}
