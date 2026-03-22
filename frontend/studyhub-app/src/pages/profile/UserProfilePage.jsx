/* ═══════════════════════════════════════════════════════════════════════════
 * UserProfilePage.jsx — Public user profile with follow controls
 *
 * Layout (responsive):
 *   Desktop: Profile header + 2-column (Recent Sheets | Enrolled Courses)
 *   Phone:   Stacked single column, stats wrap, responsive avatar
 *
 * Uses the shared Navbar for navigation consistency across the app.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useRef } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import SafeJoyride from '../../components/SafeJoyride'
import { IconSheets, IconStar } from '../../components/Icons'
import { SkeletonProfile } from '../../components/Skeleton'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'
import { useTutorial } from '../../lib/useTutorial'
import { PROFILE_STEPS } from '../../lib/tutorialSteps'
import { fadeInUp, staggerEntrance } from '../../lib/animations'
import AvatarCropModal from '../../components/AvatarCropModal'
import { showToast } from '../../lib/toast'
import { usePageTitle } from '../../lib/usePageTitle'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

export default function UserProfilePage() {
  const { username } = useParams()
  usePageTitle(username ? `${username}'s Profile` : 'Profile')
  const navigate = useNavigate()
  const { user: currentUser, isAuthenticated, setSessionUser } = useSession()

  /* ── State ───────────────────────────────────────────────────────────── */
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [following, setFollowing] = useState(false)
  const [followers, setFollowers] = useState(0)
  const [toggling, setToggling] = useState(false)
  const [followModal, setFollowModal] = useState(null) // 'followers' | 'following' | null
  const [followList, setFollowList] = useState([])
  const [followListLoading, setFollowListLoading] = useState(false)

  const isOwnProfile = currentUser?.username === username
  const [showAvatarCrop, setShowAvatarCrop] = useState(false)
  const tutorial = useTutorial('profile', PROFILE_STEPS)
  const profileCardRef = useRef(null)
  const columnsRef = useRef(null)
  const animatedRef = useRef(false)

  /* Animate profile on first data load */
  useEffect(() => {
    if (loading || !profile || animatedRef.current) return
    animatedRef.current = true
    if (profileCardRef.current) fadeInUp(profileCardRef.current, { duration: 400, y: 16 })
    if (columnsRef.current) staggerEntrance(columnsRef.current.children, { staggerMs: 80, duration: 450, y: 14 })
  }, [loading, profile])

  /* ── Load followers/following list ─────────────────────────────────── */
  async function loadFollowList(type) {
    setFollowModal(type)
    setFollowListLoading(true)
    try {
      const res = await fetch(`${API}/api/users/${username}/${type}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      if (res.ok) {
        setFollowList(await res.json())
      }
    } catch { /* ignore */ }
    finally { setFollowListLoading(false) }
  }

  /* ── Load profile data ───────────────────────────────────────────────── */
  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`${API}/api/users/${username}`, { headers: authHeaders(), credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body.error || (r.status === 404 ? 'This user does not exist.' : 'Could not load this profile.'))
        }
        return r.json()
      })
      .then((data) => {
        setProfile(data)
        setFollowing(data.isFollowing || false)
        setFollowers(data.followerCount || 0)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [username])

  /* ── Follow/Unfollow toggle ──────────────────────────────────────────── */
  async function handleFollowToggle() {
    if (!isAuthenticated) { navigate('/login'); return }
    setToggling(true)
    try {
      const method = following ? 'DELETE' : 'POST'
      const res = await fetch(`${API}/api/users/${username}/follow`, {
        method,
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok) {
        setFollowing(data.following)
        setFollowers(data.followerCount)
        showToast(data.following ? `Following ${username}` : `Unfollowed ${username}`, 'success')
      } else {
        showToast(data.error || 'Could not update follow status.', 'error')
      }
    } catch {
      showToast('Could not connect to the server.', 'error')
    }
    finally { setToggling(false) }
  }

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''
  const initials = username ? username.slice(0, 2).toUpperCase() : '??'

  /* ── Loading state ───────────────────────────────────────────────────── */
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: FONT }}>
      <Navbar crumbs={[{ label: username, to: `/users/${username}` }]} hideTabs />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(20px, 3vw, 40px) clamp(16px, 2vw, 24px)' }}>
        <SkeletonProfile />
      </div>
    </div>
  )

  /* ── Error state ─────────────────────────────────────────────────────── */
  if (error) return (
    <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: FONT }}>
      <Navbar crumbs={[{ label: 'Profile', to: '#' }]} hideTabs />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(20px, 3vw, 40px) clamp(16px, 2vw, 24px)' }}>
        <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #e2e8f0', padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 36, color: '#cbd5e1', marginBottom: 14 }}>{/private|classmates/i.test(error) ? '🔒' : '👤'}</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: '#0f172a', marginBottom: 8 }}>
            {/private|classmates/i.test(error) ? 'Profile not available' : 'User not found'}
          </div>
          <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 20 }}>
            {error}
          </div>
          <Link to="/sheets" style={{ display: 'inline-flex', padding: '10px 22px', borderRadius: 10, background: '#3b82f6', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            Browse Sheets
          </Link>
        </div>
      </div>
    </div>
  )

  /* ── Main profile view ───────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: FONT }}>
      <Navbar crumbs={[{ label: profile.username, to: `/users/${username}` }]} hideTabs />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(20px, 3vw, 40px) clamp(16px, 2vw, 24px)' }}>
        {/* ── Profile card ─────────────────────────────────────────────── */}
        <div ref={profileCardRef} style={{ background: '#fff', borderRadius: 18, border: '1px solid #e2e8f0', padding: 'clamp(20px, 3vw, 28px)', marginBottom: 20, boxShadow: '0 2px 10px rgba(15,23,42,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'clamp(14px, 2vw, 20px)', flexWrap: 'wrap' }}>
            {/* Avatar — responsive sizing via clamp */}
            <div
              data-tutorial="profile-avatar"
              style={{
                position: 'relative',
                width: 'clamp(56px, 8vw, 80px)',
                height: 'clamp(56px, 8vw, 80px)',
                borderRadius: '50%',
                background: 'var(--sh-avatar-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                overflow: 'hidden',
                cursor: isOwnProfile ? 'pointer' : 'default',
              }}
              onClick={isOwnProfile ? () => setShowAvatarCrop(true) : undefined}
              role={isOwnProfile ? 'button' : undefined}
              tabIndex={isOwnProfile ? 0 : undefined}
              onKeyDown={isOwnProfile ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowAvatarCrop(true) } } : undefined}
              aria-label={isOwnProfile ? 'Upload profile photo' : undefined}
            >
              {profile.avatarUrl
                ? <img src={profile.avatarUrl.startsWith('http') ? profile.avatarUrl : `${API}${profile.avatarUrl}`} alt={profile.username} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 800, color: 'var(--sh-avatar-text)' }}>{initials}</span>
              }
              {isOwnProfile && (
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 0, transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0' }}
                >
                  <i className="fa-solid fa-camera" style={{ color: '#fff', fontSize: 'clamp(14px, 2vw, 18px)' }} />
                </div>
              )}
            </div>

            {/* Info column */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <h1 style={{ margin: 0, fontSize: 'clamp(18px, 2.5vw, 22px)', fontWeight: 800, color: '#0f172a' }}>{profile.username}</h1>
                {profile.role === 'admin'
                  ? <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: '#fef9ec', color: '#92400e', border: '1px solid #fde68a' }}>Admin</span>
                  : <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>Student</span>
                }
              </div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
                Joined {fmtDate(profile.createdAt)}
              </div>

              {/* Stats — flex-wrap for responsive */}
              <div className="profile-stats-row" data-tutorial="profile-stats">
                <div style={{ textAlign: 'center', padding: '8px 20px' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{profile.sheetCount || 0}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Sheets</div>
                </div>
                <div style={{ width: 1, height: 36, background: '#e8ecf0' }} />
                <button onClick={() => loadFollowList('followers')} style={{ textAlign: 'center', padding: '8px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 8 }} className="profile-stat-btn">
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{followers}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Followers</div>
                </button>
                <div style={{ width: 1, height: 36, background: '#e8ecf0' }} />
                <button onClick={() => loadFollowList('following')} style={{ textAlign: 'center', padding: '8px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 8 }} className="profile-stat-btn">
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{profile.followingCount || 0}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Following</div>
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'flex-start' }}>
              {isOwnProfile
                ? <Link to="/settings" style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 16px', borderRadius: 10, background: '#fff', color: '#475569', fontWeight: 700, fontSize: 13, textDecoration: 'none', border: '1px solid #e2e8f0' }}>
                    Edit Profile
                  </Link>
                : currentUser && (
                    <button
                      onClick={handleFollowToggle}
                      disabled={toggling}
                      style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '8px 18px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                        border: following ? '1px solid #bbf7d0' : 'none',
                        background: following ? '#f0fdf4' : '#3b82f6',
                        color: following ? '#166534' : '#fff',
                        cursor: toggling ? 'wait' : 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      {toggling ? '...' : following ? 'Following' : 'Follow'}
                    </button>
                  )
              }
            </div>
          </div>
        </div>

        {/* ── Two-column content: sheets | courses ─────────────────────── */}
        <div ref={columnsRef} className="profile-columns">
          {/* Recent Sheets */}
          <div data-tutorial="profile-sheets" style={{ background: '#fff', borderRadius: 18, border: '1px solid #e2e8f0', padding: '24px 28px', boxShadow: '0 2px 10px rgba(15,23,42,0.05)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconSheets size={16} style={{ color: '#3b82f6' }} />
              Recent Sheets
            </h2>
            {profile.recentSheets && profile.recentSheets.length > 0
              ? profile.recentSheets.map((sheet) => (
                  <Link key={sheet.id} to={`/sheets/${sheet.id}`} style={{ display: 'block', padding: '12px 0', borderBottom: '1px solid #f1f5f9', textDecoration: 'none' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>{sheet.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {sheet.course?.code && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                          {sheet.course.code}
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <IconStar size={12} /> {sheet.stars || 0}
                      </span>
                    </div>
                  </Link>
                ))
              : (
                  <div style={{ textAlign: 'center', padding: '36px 16px' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading, #0f172a)', marginBottom: 4 }}>No public sheets yet</div>
                    <div style={{ fontSize: 12, color: 'var(--sh-muted, #94a3b8)', lineHeight: 1.5 }}>Sheets uploaded by this user will appear here.</div>
                  </div>
                )
            }
          </div>

          {/* Shared Notes */}
          {profile.sharedNotes && profile.sharedNotes.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #e2e8f0', padding: '24px 28px', boxShadow: '0 2px 10px rgba(15,23,42,0.05)' }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                📝 Shared Notes
              </h2>
              {profile.sharedNotes.map((note) => (
                <div key={note.id} style={{ display: 'block', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{note.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {note.course?.code && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                        {note.course.code}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>
                      {new Date(note.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Starred Sheets */}
          {profile.starredSheets && profile.starredSheets.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #e2e8f0', padding: '24px 28px', boxShadow: '0 2px 10px rgba(15,23,42,0.05)' }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconStar size={16} style={{ color: '#f59e0b' }} />
                Starred Sheets
              </h2>
              {profile.starredSheets.map((sheet) => (
                <Link key={sheet.id} to={`/sheets/${sheet.id}`} style={{ display: 'block', padding: '12px 0', borderBottom: '1px solid #f1f5f9', textDecoration: 'none' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>{sheet.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {sheet.course?.code && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                        {sheet.course.code}
                      </span>
                    )}
                    {sheet.author?.username && (
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>by {sheet.author.username}</span>
                    )}
                    <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <IconStar size={12} /> {sheet.stars || 0}
                    </span>
                  </div>
                </Link>
              ))}
              {isOwnProfile && (
                <Link to="/sheets?starred=1" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 13, fontWeight: 700, color: '#3b82f6', textDecoration: 'none' }}>
                  View all starred sheets →
                </Link>
              )}
            </div>
          )}

          {/* Enrolled Courses */}
          <div data-tutorial="profile-courses" style={{ background: '#fff', borderRadius: 18, border: '1px solid #e2e8f0', padding: '24px 28px', boxShadow: '0 2px 10px rgba(15,23,42,0.05)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              📚 Enrolled Courses
            </h2>
            {profile.enrollments && profile.enrollments.length > 0
              ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {profile.enrollments.map((e) => (
                      <span key={e.id} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 99, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155', display: 'inline-flex', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700 }}>{e.course?.code}</span>
                        {e.course?.school?.name && (
                          <span style={{ color: '#94a3b8', marginLeft: 4, fontSize: 11 }}>· {e.course.school.name}</span>
                        )}
                      </span>
                    ))}
                  </div>
                )
              : (
                  <div style={{ textAlign: 'center', padding: '28px 0', fontSize: 14, color: '#94a3b8' }}>
                    <div style={{ fontSize: 24, color: '#cbd5e1', marginBottom: 8 }}>📚</div>
                    No enrolled courses
                  </div>
                )
            }
          </div>
        </div>
      </div>

      <SafeJoyride {...tutorial.joyrideProps} />

      {/* ── Followers / Following modal ──────────────────────────────── */}
      {followModal && (
        <div
          onClick={() => setFollowModal(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 18, width: 'min(420px, 92vw)',
              maxHeight: '70vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 8px 30px rgba(15,23,42,0.18)', fontFamily: FONT,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 14px', borderBottom: '1px solid #f1f5f9' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                {followModal === 'followers' ? 'Followers' : 'Following'}
              </h3>
              <button
                onClick={() => setFollowModal(null)}
                style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer', padding: '4px 8px', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {/* List */}
            <div style={{ overflowY: 'auto', padding: '8px 10px 14px' }}>
              {followListLoading ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 14 }}>Loading…</div>
              ) : followList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 14 }}>
                  {followModal === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
                </div>
              ) : (
                followList.map((u) => (
                  <Link
                    key={u.id}
                    to={`/users/${u.username}`}
                    onClick={() => setFollowModal(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                      borderRadius: 10, textDecoration: 'none', color: 'inherit',
                      transition: 'background .15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%', background: 'var(--sh-avatar-bg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, overflow: 'hidden',
                    }}>
                      {u.avatarUrl
                        ? <img src={u.avatarUrl.startsWith('http') ? u.avatarUrl : `${API}${u.avatarUrl}`} alt={u.username} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--sh-avatar-text)' }}>{u.username.slice(0, 2).toUpperCase()}</span>
                      }
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{u.username}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>
                        {u.role === 'admin' ? 'Admin' : 'Student'}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {showAvatarCrop && (
        <AvatarCropModal
          onClose={() => setShowAvatarCrop(false)}
          onUploaded={(avatarUrl) => {
            setProfile((p) => ({ ...p, avatarUrl }))
            setSessionUser((u) => u ? { ...u, avatarUrl } : u)
          }}
        />
      )}
    </div>
  )
}
