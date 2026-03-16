import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { API } from '../config'
import { getStoredUser, hasStoredSession } from '../lib/session'

const authHeaders = () => ({
  'Content-Type': 'application/json',
})

export default function UserProfilePage() {
  const { username } = useParams()
  const navigate = useNavigate()

  const [profile,   setProfile]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [following, setFollowing] = useState(false)
  const [followers, setFollowers] = useState(0)
  const [toggling,  setToggling]  = useState(false)

  const currentUser = getStoredUser()
  const isOwnProfile = currentUser?.username === username

  useEffect(() => {
    setLoading(true); setError(null)
    fetch(`${API}/api/users/${username}`, { headers: authHeaders() })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(data => {
        setProfile(data)
        setFollowing(data.isFollowing || false)
        setFollowers(data.followerCount || 0)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [username])

  async function handleFollowToggle() {
    if (!hasStoredSession()) { navigate('/login'); return }
    setToggling(true)
    try {
      const method = following ? 'DELETE' : 'POST'
      const res = await fetch(`${API}/api/users/${username}/follow`, {
        method, headers: authHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setFollowing(data.following)
        setFollowers(data.followerCount)
      }
    } catch { /* ignore */ }
    finally { setToggling(false) }
  }

  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''
  const initials = username ? username.slice(0, 2).toUpperCase() : '??'

  if (loading) return (
    <div style={styles.page}>
      <header style={styles.header}>
        <Link to="/feed" style={styles.logoLink}>
          <span style={styles.logoText}>Study<span style={{ color: '#3b82f6' }}>Hub</span></span>
        </Link>
      </header>
      <div style={styles.shell}>
        <div style={{ ...styles.card, textAlign: 'center', padding: 48, color: '#94a3b8' }}>
          <i className="fas fa-circle-notch fa-spin" style={{ fontSize: 28, marginBottom: 12, display: 'block' }}></i>
          Loading profile…
        </div>
      </div>
    </div>
  )

  if (error) return (
    <div style={styles.page}>
      <header style={styles.header}>
        <Link to="/feed" style={styles.logoLink}>
          <span style={styles.logoText}>Study<span style={{ color: '#3b82f6' }}>Hub</span></span>
        </Link>
      </header>
      <div style={styles.shell}>
        <div style={{ ...styles.card, textAlign: 'center', padding: 48 }}>
          <i className="fas fa-user-slash" style={{ fontSize: 36, color: '#cbd5e1', marginBottom: 14, display: 'block' }}></i>
          <div style={{ fontWeight: 700, fontSize: 18, color: '#1e3a5f', marginBottom: 8 }}>User not found</div>
          <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 20 }}>
            {error === '404' ? 'This user does not exist.' : `Error ${error}`}
          </div>
          <Link to="/sheets" style={styles.btnPrimary}>Browse Sheets</Link>
        </div>
      </div>
    </div>
  )

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <Link to="/feed" style={styles.logoLink}>
          <span style={styles.logoText}>Study<span style={{ color: '#3b82f6' }}>Hub</span></span>
        </Link>
        <Link to="/feed" style={styles.backLink}>
          <i className="fas fa-arrow-left" style={{ marginRight: 6 }}></i>Back to Feed
        </Link>
      </header>

      <div style={styles.shell}>
        {/* Profile Card */}
        <div style={{ ...styles.card, marginBottom: 20 }}>
          <div style={styles.profileHeader}>
            {/* Avatar */}
            <div style={styles.avatar}>
              {profile.avatarUrl
                ? <img src={profile.avatarUrl.startsWith('http') ? profile.avatarUrl : `${API}${profile.avatarUrl}`} alt={profile.username} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                : <span style={styles.avatarInitials}>{initials}</span>
              }
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <h1 style={styles.username}>{profile.username}</h1>
                {profile.role === 'admin'
                  ? <span style={styles.adminBadge}>
                      <i className="fas fa-crown" style={{ color: '#f59e0b', marginRight: 4 }}></i>Admin
                    </span>
                  : <span style={styles.studentBadge}>
                      <i className="fas fa-graduation-cap" style={{ color: '#3b82f6', marginRight: 4 }}></i>Student
                    </span>
                }
              </div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
                Joined {fmtDate(profile.createdAt)}
              </div>

              {/* Stats */}
              <div style={styles.statsRow}>
                <div style={styles.stat}>
                  <div style={styles.statValue}>{profile.sheetCount || 0}</div>
                  <div style={styles.statLabel}>Sheets</div>
                </div>
                <div style={styles.statDivider} />
                <div style={styles.stat}>
                  <div style={styles.statValue}>{followers}</div>
                  <div style={styles.statLabel}>Followers</div>
                </div>
                <div style={styles.statDivider} />
                <div style={styles.stat}>
                  <div style={styles.statValue}>{profile.followingCount || 0}</div>
                  <div style={styles.statLabel}>Following</div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'flex-start' }}>
              {isOwnProfile
                ? <Link to="/settings" style={styles.btnGhost}>
                    <i className="fas fa-pen" style={{ marginRight: 6 }}></i>Edit Profile
                  </Link>
                : currentUser && (
                    <button
                      onClick={handleFollowToggle}
                      disabled={toggling}
                      style={following ? styles.btnFollowing : styles.btnFollow}
                    >
                      {toggling
                        ? <i className="fas fa-circle-notch fa-spin"></i>
                        : following
                          ? <><i className="fas fa-user-check" style={{ marginRight: 6 }}></i>Following</>
                          : <><i className="fas fa-user-plus" style={{ marginRight: 6 }}></i>Follow</>
                      }
                    </button>
                  )
              }
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div style={styles.columns}>
          {/* Recent Sheets */}
          <div style={{ flex: 2, minWidth: 0 }}>
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>
                <i className="fas fa-file-lines" style={{ marginRight: 8, color: '#3b82f6' }}></i>
                Recent Sheets
              </h2>
              {profile.recentSheets && profile.recentSheets.length > 0
                ? profile.recentSheets.map(sheet => (
                    <Link key={sheet.id} to={`/sheets/${sheet.id}`} style={styles.sheetRow}>
                      <div style={styles.sheetRowTitle}>{sheet.title}</div>
                      <div style={styles.sheetRowMeta}>
                        {sheet.course?.code && (
                          <span style={styles.courseChip}>{sheet.course.code}</span>
                        )}
                        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>
                          <i className="fas fa-star" style={{ marginRight: 4, color: '#f59e0b' }}></i>{sheet.stars || 0}
                          <i className="fas fa-code-fork" style={{ marginLeft: 10, marginRight: 4, color: '#10b981' }}></i>{sheet.forks || 0}
                        </span>
                      </div>
                    </Link>
                  ))
                : (
                    <div style={styles.emptyState}>
                      <i className="fas fa-file-lines" style={{ fontSize: 28, color: '#cbd5e1', marginBottom: 10, display: 'block' }}></i>
                      No public sheets yet
                    </div>
                  )
              }
            </div>
          </div>

          {/* Courses */}
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>
                <i className="fas fa-book" style={{ marginRight: 8, color: '#8b5cf6' }}></i>
                Enrolled Courses
              </h2>
              {profile.enrollments && profile.enrollments.length > 0
                ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {profile.enrollments.map(e => (
                        <span key={e.id} style={styles.enrollChip}>
                          <span style={{ fontWeight: 700 }}>{e.course?.code}</span>
                          {e.course?.school?.name && (
                            <span style={{ color: '#94a3b8', marginLeft: 4, fontSize: 11 }}>· {e.course.school.name}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  )
                : (
                    <div style={styles.emptyState}>
                      <i className="fas fa-book-open" style={{ fontSize: 24, color: '#cbd5e1', marginBottom: 8, display: 'block' }}></i>
                      No enrolled courses
                    </div>
                  )
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#edf0f5',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  },
  header: {
    background: '#0f172a',
    height: 62,
    display: 'flex',
    alignItems: 'center',
    padding: '0 clamp(16px, 2.5vw, 40px)',
    gap: 16,
    borderBottom: '1px solid #1e293b',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  logoLink: { textDecoration: 'none' },
  logoText: { fontWeight: 800, fontSize: 18, color: '#fff' },
  backLink: {
    marginLeft: 'auto',
    fontSize: 13,
    color: '#94a3b8',
    textDecoration: 'none',
  },
  shell: {
    maxWidth: 860,
    margin: '0 auto',
    padding: 'clamp(20px, 3vw, 40px) clamp(16px, 2vw, 24px)',
  },
  card: {
    background: '#fff',
    borderRadius: 14,
    border: '1px solid #e8ecf0',
    padding: '24px 28px',
    boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
  },
  profileHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 20,
    flexWrap: 'wrap',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    background: '#0f172a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  avatarInitials: {
    fontSize: 26,
    fontWeight: 800,
    color: '#fff',
  },
  username: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    color: '#0f172a',
  },
  adminBadge: {
    fontSize: 12,
    fontWeight: 700,
    padding: '3px 10px',
    borderRadius: 99,
    background: '#fef9ec',
    color: '#92400e',
    border: '1px solid #fde68a',
    display: 'flex',
    alignItems: 'center',
  },
  studentBadge: {
    fontSize: 12,
    fontWeight: 700,
    padding: '3px 10px',
    borderRadius: 99,
    background: '#eff6ff',
    color: '#1d4ed8',
    border: '1px solid #bfdbfe',
    display: 'flex',
    alignItems: 'center',
  },
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
  },
  stat: {
    textAlign: 'center',
    padding: '8px 20px',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 800,
    color: '#0f172a',
  },
  statLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: 500,
  },
  statDivider: {
    width: 1,
    height: 36,
    background: '#e8ecf0',
  },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 22px',
    borderRadius: 9,
    background: '#3b82f6',
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    textDecoration: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnGhost: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 16px',
    borderRadius: 9,
    background: '#fff',
    color: '#475569',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
    border: '1px solid #e2e8f0',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnFollow: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 18px',
    borderRadius: 9,
    background: '#3b82f6',
    color: '#fff',
    fontWeight: 700,
    fontSize: 13,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnFollowing: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 18px',
    borderRadius: 9,
    background: '#f0fdf4',
    color: '#166534',
    fontWeight: 700,
    fontSize: 13,
    border: '1px solid #bbf7d0',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  columns: {
    display: 'flex',
    gap: 16,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  sectionTitle: {
    margin: '0 0 16px',
    fontSize: 15,
    fontWeight: 700,
    color: '#1e3a5f',
    display: 'flex',
    alignItems: 'center',
  },
  sheetRow: {
    display: 'block',
    padding: '12px 0',
    borderBottom: '1px solid #f1f5f9',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  sheetRowTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#0f172a',
    marginBottom: 6,
  },
  sheetRowMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  courseChip: {
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 99,
    background: '#eff6ff',
    color: '#1d4ed8',
    border: '1px solid #bfdbfe',
  },
  emptyState: {
    textAlign: 'center',
    padding: '28px 0',
    fontSize: 14,
    color: '#94a3b8',
  },
  enrollChip: {
    fontSize: 12,
    padding: '4px 12px',
    borderRadius: 99,
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    color: '#334155',
    display: 'inline-flex',
    alignItems: 'center',
  },
}
