import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const ACTIVITY = [
  { icon: 'fa-file-lines',   color: '#3b82f6', text: 'Uploaded a study sheet in',      course: 'CMSC131', time: '2 hours ago'   },
  { icon: 'fa-code-fork',    color: '#8b5cf6', text: 'Forked a study sheet in',        course: 'MATH140', time: '5 hours ago'   },
  { icon: 'fa-circle-check', color: '#10b981', text: 'Completed a practice test in',   course: 'CHEM131', time: 'Yesterday'     },
  { icon: 'fa-star',         color: '#f59e0b', text: 'Starred a study sheet in',       course: 'PHYS141', time: '2 days ago'    },
  { icon: 'fa-pen-to-square',color: '#f43f5e', text: 'Edited your notes in',           course: 'ECON201', time: '3 days ago'    },
]

const TRENDING = [
  { title: 'Calculus II Final Review',   course: 'MATH141', school: 'UMD',  stars: 142, forks: 38 },
  { title: 'Data Structures Cheatsheet', course: 'CMSC420', school: 'UMBC', stars: 98,  forks: 21 },
  { title: 'Organic Chemistry Guide',    course: 'CHEM231', school: 'TU',   stars: 87,  forks: 19 },
  { title: 'OS Concepts Summary',        course: 'CMSC412', school: 'UMD',  stars: 76,  forks: 14 },
]

// Study activity grid (like GitHub contributions)
function ActivityGrid() {
  const weeks = 16
  const days  = 7
  const cells = Array.from({ length: weeks * days }, (_, index) => {
    const value = (index * 37 + 11) % 100
    return value < 45 ? 0 : value < 65 ? 1 : value < 80 ? 2 : value < 92 ? 3 : 4
  })
  const colors = ['#1e293b', '#1e3a5f', '#1d4ed8', '#3b82f6', '#60a5fa']
  const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', '']

  return (
    <div>
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
        {/* Day labels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginRight: 4 }}>
          {dayLabels.map((d, i) => (
            <div key={i} style={{ height: 11, fontSize: 9, color: '#475569', lineHeight: '11px', textAlign: 'right', minWidth: 24 }}>{d}</div>
          ))}
        </div>
        {/* Grid */}
        {Array.from({ length: weeks }, (_, w) => (
          <div key={w} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {Array.from({ length: days }, (_, d) => {
              const level = cells[w * days + d]
              return (
                <div key={d} title={`${level} study sessions`} style={{
                  width: 11, height: 11, borderRadius: 2,
                  background: colors[level],
                  cursor: 'pointer', transition: 'transform 0.1s',
                }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.4)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 10, color: '#475569' }}>Less</span>
        {colors.map((c, i) => (
          <div key={i} style={{ width: 11, height: 11, borderRadius: 2, background: c }} />
        ))}
        <span style={{ fontSize: 10, color: '#475569' }}>More</span>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [user, setUser]       = useState(() => getStoredUser())
  const [loading, setLoading] = useState(true)
  const navigate              = useNavigate()

  useEffect(() => {
    const token     = localStorage.getItem('token')
    if (!token) { navigate('/login'); return }
    fetch('http://localhost:4000/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => {
        if (!r.ok) {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          navigate('/login')
          return null
        }

        return r.json()
      })
      .then(d => { if (d) { setUser(d); localStorage.setItem('user', JSON.stringify(d)) } setLoading(false) })
      .catch(() => setLoading(false))
  }, [navigate])

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117' }}>
      <div style={{ textAlign: 'center' }}>
        <i className="fas fa-book-open" style={{ fontSize: 40, color: '#3b82f6', marginBottom: 16, display: 'block' }} />
        <p style={{ color: '#64748b', fontWeight: 500, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Loading StudyHub...</p>
      </div>
    </div>
  )

  const courses = user?.enrollments || []
  const activitySessionCount = Math.max(48, courses.length * 18 + 56)

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#e2e8f0' }}>

      {/* ── TOP NAV ───────────────────────────────── */}
      <div style={{
        background: '#161b22',
        borderBottom: '1px solid #21262d',
        height: 60, display: 'flex', alignItems: 'center',
        padding: '0 24px', position: 'sticky', top: 0, zIndex: 200,
        gap: 16,
      }}>
        {/* Logo */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(59,130,246,0.4)',
          }}>
            <i className="fas fa-book-open" style={{ color: 'white', fontSize: 14 }} />
          </div>
          <span style={{ fontWeight: 800, fontSize: 18, color: 'white', letterSpacing: '-0.3px' }}>
            Study<span style={{ color: '#3b82f6' }}>Hub</span>
          </span>
        </Link>

        {/* Search bar */}
        <div style={{ flex: 1, maxWidth: 320, position: 'relative' }}>
          <i className="fas fa-search" style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: '#475569', fontSize: 13,
          }} />
          <input placeholder="Search courses, sheets, schools..." style={{
            width: '100%', padding: '8px 12px 8px 34px',
            background: '#0d1117', border: '1px solid #30363d',
            borderRadius: 8, color: '#e2e8f0', fontSize: 13,
            outline: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
            onFocus={e => e.target.style.borderColor = '#3b82f6'}
            onBlur={e => e.target.style.borderColor = '#30363d'}
          />
        </div>

        {/* Top nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
          {[
            { icon: 'fa-file-lines',    label: 'Sheets', to: '/study-sheets'  },
            { icon: 'fa-pen-to-square', label: 'Tests', to: '/practice-tests' },
            { icon: 'fa-scroll',        label: 'Syllabus', to: '/syllabus' },
            { icon: 'fa-scale-balanced',label: 'Guidelines', to: '/guidelines' },
          ].map(item => (
            <Link key={item.label} to={item.to} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 6,
              color: '#94a3b8', fontSize: 13, fontWeight: 500,
              textDecoration: 'none', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.color = 'white'; e.currentTarget.style.background = '#21262d' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent' }}
            >
              <i className={`fas ${item.icon}`} style={{ fontSize: 13 }} />
              {item.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button style={{
            background: 'none', border: '1px solid #30363d', color: '#94a3b8',
            padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#58a6ff'; e.currentTarget.style.color = '#58a6ff' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#94a3b8' }}
          >
            <i className="fas fa-plus" style={{ fontSize: 11 }} />
            <i className="fas fa-caret-down" style={{ fontSize: 10 }} />
          </button>

          {/* Avatar */}
          <div onClick={logout} title="Log out" style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #1d4ed8, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 800, fontSize: 13,
            cursor: 'pointer', border: '2px solid #30363d',
            transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#3b82f6'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#30363d'}
          >
            {user?.username?.[0]?.toUpperCase()}
          </div>
        </div>
      </div>

      {/* ── BODY ─────────────────────────────────── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 20px', display: 'grid', gridTemplateColumns: '296px 1fr 296px', gap: 24 }}>

        {/* ── LEFT COLUMN ──────────────────────── */}
        <aside>
          {/* Profile Card */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'linear-gradient(135deg, #1d4ed8, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 800, fontSize: 28,
              marginBottom: 12, border: '3px solid #21262d',
              boxShadow: '0 0 0 1px #30363d',
            }}>
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', margin: '0 0 2px', letterSpacing: '-0.3px' }}>
              {user?.username}
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px', textTransform: 'capitalize' }}>
              {user?.role} · StudyHub
            </p>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.6 }}>
              Student on StudyHub. Sharing study materials and collaborating with classmates.
            </p>
            <Link to="/register" style={{
              display: 'block', textAlign: 'center',
              border: '1px solid #30363d', borderRadius: 6,
              padding: '6px 16px', fontSize: 13, fontWeight: 600,
              color: '#c9d1d9', textDecoration: 'none', background: '#21262d',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#58a6ff'; e.currentTarget.style.background = '#1f3358' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.background = '#21262d' }}
            >Edit profile</Link>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
              {[
                { icon: 'fa-users',     value: '0',              label: 'followers' },
                { icon: 'fa-user-plus', value: '0',              label: 'following' },
                { icon: 'fa-star',      value: '0',              label: 'stars'     },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className={`fas ${s.icon}`} style={{ color: '#64748b', fontSize: 12 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>{s.value}</span>
                  <span style={{ fontSize: 13, color: '#64748b' }}>{s.label}</span>
                </div>
              ))}
            </div>

            {/* Member since */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
              <i className="fas fa-calendar" style={{ color: '#64748b', fontSize: 12 }} />
              <span style={{ fontSize: 13, color: '#64748b' }}>
                Joined {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid #21262d', margin: '20px 0' }} />

          {/* My Courses (like repos) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>My Courses</span>
              <Link to="/register" style={{ fontSize: 12, color: '#58a6ff', textDecoration: 'none', fontWeight: 500 }}>Manage</Link>
            </div>

            {courses.length === 0 ? (
              <div style={{
                border: '1px dashed #30363d', borderRadius: 8,
                padding: '20px 16px', textAlign: 'center',
              }}>
                <i className="fas fa-graduation-cap" style={{ color: '#30363d', fontSize: 24, marginBottom: 8, display: 'block' }} />
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px' }}>No courses yet</p>
                <Link to="/register" style={{
                  fontSize: 12, color: '#58a6ff', textDecoration: 'none', fontWeight: 600,
                  background: '#1f3358', border: '1px solid #1d4ed8',
                  padding: '5px 12px', borderRadius: 5, display: 'inline-block',
                }}>+ Add courses</Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {courses.slice(0, 6).map((e, i) => (
                  <Link key={e.id} to={`/study-sheets?courseId=${e.course.id}`} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    textDecoration: 'none', padding: '6px 0',
                    borderBottom: '1px solid #21262d',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: `hsl(${i * 55 + 200}, 70%, 55%)`,
                        flexShrink: 0,
                      }} />
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#58a6ff', margin: 0, lineHeight: 1.3 }}>
                          {e.course.code || e.course.name.split(' ').slice(0,2).join('')}
                        </p>
                        <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>{e.course.school?.short}</p>
                      </div>
                    </div>
                    <i className="fas fa-chevron-right" style={{ color: '#30363d', fontSize: 10 }} />
                  </Link>
                ))}
                {courses.length > 6 && (
                  <Link to="/register" style={{ fontSize: 12, color: '#58a6ff', textDecoration: 'none', fontWeight: 500 }}>
                    Show {courses.length - 6} more courses →
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid #21262d', margin: '20px 0' }} />

          {/* Logout */}
          <button onClick={logout} style={{
            width: '100%', padding: '8px', background: 'none',
            border: '1px solid #30363d', borderRadius: 6,
            color: '#64748b', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#f87171'; e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = '#1c0a0a' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'none' }}
          >
            <i className="fas fa-right-from-bracket" />
            Sign out
          </button>
        </aside>

        {/* ── CENTER COLUMN ────────────────────── */}
        <main style={{ minWidth: 0 }}>

          {/* Study Activity Graph */}
          <div style={{
            background: '#161b22', border: '1px solid #21262d',
            borderRadius: 10, padding: '20px 24px', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: '0 0 2px' }}>Study Activity</h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                  {activitySessionCount} study sessions in the last 16 weeks
                </p>
              </div>
              <select style={{
                background: '#21262d', border: '1px solid #30363d',
                color: '#94a3b8', borderRadius: 6, padding: '4px 10px',
                fontSize: 12, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>
                <option>Last 16 weeks</option>
                <option>Last year</option>
              </select>
            </div>
            <ActivityGrid />
          </div>

          {/* Feed Header */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {['For you', 'Following', 'My Courses'].map((tab, i) => (
              <button key={tab} style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                background: i === 0 ? '#1f3358' : 'none',
                border: `1px solid ${i === 0 ? '#1d4ed8' : '#30363d'}`,
                color: i === 0 ? '#60a5fa' : '#64748b',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { if (i !== 0) { e.currentTarget.style.borderColor = '#475569'; e.currentTarget.style.color = '#94a3b8' }}}
                onMouseLeave={e => { if (i !== 0) { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#64748b' }}}
              >{tab}</button>
            ))}
          </div>

          {/* Activity Feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Upload CTA card */}
            <div style={{
              background: '#161b22', border: '1px solid #21262d',
              borderRadius: 10, padding: '20px 24px', marginBottom: 4,
              display: 'flex', gap: 16, alignItems: 'flex-start',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #1d4ed8, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 800, fontSize: 16,
              }}>
                {user?.username?.[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  border: '1px solid #30363d', borderRadius: 8,
                  padding: '12px 16px', cursor: 'pointer', transition: 'border-color 0.15s',
                  color: '#64748b', fontSize: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#58a6ff'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#30363d'}
                >
                  <span>Share a study sheet, notes, or contribute to a course...</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { icon: 'fa-file-arrow-up', label: 'Upload',  color: '#3b82f6' },
                      { icon: 'fa-image',          label: 'Image',   color: '#10b981' },
                      { icon: 'fa-link',           label: 'Link',    color: '#f59e0b' },
                    ].map(btn => (
                      <button key={btn.label} style={{
                        background: 'none', border: 'none',
                        color: btn.color, fontSize: 14, cursor: 'pointer',
                        padding: '4px 8px', borderRadius: 4,
                        display: 'flex', alignItems: 'center', gap: 4,
                        transition: 'background 0.15s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = '#21262d'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        <i className={`fas ${btn.icon}`} />
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{btn.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Activity items */}
            {ACTIVITY.map((item, i) => (
              <div key={i} style={{
                background: '#161b22', border: '1px solid #21262d',
                borderRadius: 10, padding: '16px 24px', marginBottom: 4,
                display: 'flex', gap: 14, alignItems: 'flex-start',
                transition: 'border-color 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#30363d'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#21262d'}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: `${item.color}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <i className={`fas ${item.icon}`} style={{ color: item.color, fontSize: 15 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 4px', lineHeight: 1.5 }}>
                    <span style={{ color: '#58a6ff', fontWeight: 600, cursor: 'pointer' }}>{user?.username}</span>
                    {' '}{item.text}{' '}
                    <span style={{
                      color: '#60a5fa', fontWeight: 600, cursor: 'pointer',
                      background: '#1f3358', padding: '2px 8px', borderRadius: 4, fontSize: 12,
                    }}>
                      <i className="fas fa-book" style={{ marginRight: 5, fontSize: 10 }} />
                      {item.course}
                    </span>
                  </p>
                  <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>{item.time}</p>
                </div>
                <button style={{
                  background: 'none', border: '1px solid #30363d',
                  color: '#64748b', padding: '5px 12px', borderRadius: 6,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s', flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.color = '#f59e0b' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#64748b' }}
                >
                  <i className="fas fa-star" style={{ fontSize: 11 }} /> Star
                </button>
              </div>
            ))}

            {/* Empty state hint */}
            <div style={{
              background: '#161b22', border: '1px dashed #21262d',
              borderRadius: 10, padding: '32px 24px', textAlign: 'center', marginTop: 4,
            }}>
              <i className="fas fa-satellite-dish" style={{ color: '#30363d', fontSize: 32, marginBottom: 12, display: 'block' }} />
              <p style={{ color: '#475569', fontSize: 14, margin: '0 0 4px', fontWeight: 600 }}>Your feed is getting started</p>
              <p style={{ color: '#30363d', fontSize: 13, margin: 0 }}>Enroll in courses and follow classmates to fill your feed.</p>
            </div>
          </div>
        </main>

        {/* ── RIGHT COLUMN ─────────────────────── */}
        <aside>

          {/* Latest Sheets */}
          <div style={{
            background: '#161b22', border: '1px solid #21262d',
            borderRadius: 10, padding: '16px 20px', marginBottom: 16,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-fire" style={{ color: '#f97316', fontSize: 13 }} />
              Trending Sheets
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {TRENDING.map((sheet, i) => (
                <div key={i} style={{ paddingBottom: 12, borderBottom: i < TRENDING.length - 1 ? '1px solid #21262d' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 13, fontWeight: 600, color: '#58a6ff',
                        margin: '0 0 3px', cursor: 'pointer',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                        onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                      >{sheet.title}</p>
                      <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
                        <span style={{ color: '#60a5fa', background: '#1f3358', padding: '1px 6px', borderRadius: 3, marginRight: 6, fontSize: 10 }}>
                          {sheet.course}
                        </span>
                        {sheet.school}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>
                      <i className="fas fa-star" style={{ fontSize: 11, color: '#f59e0b' }} />
                      {sheet.stars}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>
                      <i className="fas fa-code-fork" style={{ fontSize: 11, color: '#8b5cf6' }} />
                      {sheet.forks}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <Link to="/study-sheets" style={{
              display: 'block', textAlign: 'center', marginTop: 12,
              fontSize: 12, color: '#58a6ff', textDecoration: 'none', fontWeight: 600,
              padding: '6px', borderRadius: 6,
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#1f3358'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              Explore all sheets →
            </Link>
          </div>

          {/* Explore Schools */}
          <div style={{
            background: '#161b22', border: '1px solid #21262d',
            borderRadius: 10, padding: '16px 20px', marginBottom: 16,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-building-columns" style={{ color: '#3b82f6', fontSize: 13 }} />
              Explore Schools
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['UMD', 'UMBC', 'TU', 'Morgan', 'JHU', 'Loyola', 'Bowie', 'Coppin'].map((s) => (
                <button key={s} style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  background: '#21262d', border: '1px solid #30363d',
                  color: '#94a3b8', cursor: 'pointer', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.color = '#60a5fa'; e.currentTarget.style.background = '#1f3358' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = '#21262d' }}
                >{s}</button>
              ))}
            </div>
            <Link to="/register" style={{
              display: 'block', textAlign: 'center', marginTop: 12,
              fontSize: 12, color: '#58a6ff', textDecoration: 'none', fontWeight: 600,
              padding: '6px', borderRadius: 6, transition: 'background 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#1f3358'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              View all 30+ schools →
            </Link>
          </div>

          {/* Quick Stats */}
          <div style={{
            background: '#161b22', border: '1px solid #21262d',
            borderRadius: 10, padding: '16px 20px',
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-chart-line" style={{ color: '#10b981', fontSize: 13 }} />
              Your Stats
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { icon: 'fa-book',         color: '#3b82f6', label: 'Courses enrolled', value: courses.length },
                { icon: 'fa-file-lines',   color: '#10b981', label: 'Sheets uploaded',  value: 0 },
                { icon: 'fa-code-fork',    color: '#8b5cf6', label: 'Forks made',        value: 0 },
                { icon: 'fa-star',         color: '#f59e0b', label: 'Stars received',    value: 0 },
                { icon: 'fa-circle-check', color: '#f43f5e', label: 'Tests completed',   value: 0 },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className={`fas ${s.icon}`} style={{ color: s.color, fontSize: 13, width: 16, textAlign: 'center' }} />
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>{s.label}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>

        </aside>
      </div>
    </div>
  )
}

function getStoredUser() {
  const raw = localStorage.getItem('user')

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    localStorage.removeItem('user')
    return null
  }
}