/* ═══════════════════════════════════════════════════════════════════════════
 * ProfileWidgets.jsx — Sub-components for UserProfilePage
 *
 * Extracted to keep UserProfilePage.jsx a thin orchestrator.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link } from 'react-router-dom'
import { IconSheets, IconStar } from '../../components/Icons'
import { API } from '../../config'
import { FONT, cardStyle, sectionHeadingStyle, pillStyle } from './profileConstants'

/* ── Avatar ─────────────────────────────────────────────────────────────── */
export function ProfileAvatar({ profile, initials, isOwnProfile, onAvatarClick }) {
  return (
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
      onClick={isOwnProfile ? onAvatarClick : undefined}
      role={isOwnProfile ? 'button' : undefined}
      tabIndex={isOwnProfile ? 0 : undefined}
      onKeyDown={isOwnProfile ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAvatarClick() } } : undefined}
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
  )
}

/* ── Stats row ──────────────────────────────────────────────────────────── */
export function ProfileStatsRow({ profile, followers, onLoadFollowList }) {
  return (
    <div className="profile-stats-row" data-tutorial="profile-stats">
      <div style={{ textAlign: 'center', padding: '8px 20px' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--sh-heading)' }}>{profile.sheetCount || 0}</div>
        <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>Sheets</div>
      </div>
      <div style={{ width: 1, height: 36, background: 'var(--sh-border)' }} />
      <button onClick={() => onLoadFollowList('followers')} style={{ textAlign: 'center', padding: '8px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 8 }} className="profile-stat-btn">
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--sh-heading)' }}>{followers}</div>
        <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>Followers</div>
      </button>
      <div style={{ width: 1, height: 36, background: 'var(--sh-border)' }} />
      <button onClick={() => onLoadFollowList('following')} style={{ textAlign: 'center', padding: '8px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 8 }} className="profile-stat-btn">
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--sh-heading)' }}>{profile.followingCount || 0}</div>
        <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>Following</div>
      </button>
    </div>
  )
}

/* ── Follow / Edit Profile button ───────────────────────────────────────── */
export function ProfileActionButtons({ isOwnProfile, currentUser, following, toggling, onFollowToggle }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'flex-start' }}>
      {isOwnProfile
        ? <Link to="/settings" style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 16px', borderRadius: 10, background: 'var(--sh-surface)', color: 'var(--sh-subtext)', fontWeight: 700, fontSize: 13, textDecoration: 'none', border: '1px solid var(--sh-border)' }}>
            Edit Profile
          </Link>
        : currentUser && (
            <button
              onClick={onFollowToggle}
              disabled={toggling}
              style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '8px 18px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                border: following ? '1px solid var(--sh-success-border, #bbf7d0)' : 'none',
                background: following ? 'var(--sh-success-bg, #f0fdf4)' : 'var(--sh-brand)',
                color: following ? 'var(--sh-success-text, #166534)' : '#fff',
                cursor: toggling ? 'wait' : 'pointer', fontFamily: 'inherit',
              }}
            >
              {toggling ? '...' : following ? 'Following' : 'Follow'}
            </button>
          )
      }
    </div>
  )
}

/* ── Recent Sheets section ──────────────────────────────────────────────── */
export function RecentSheetsSection({ sheets }) {
  return (
    <div data-tutorial="profile-sheets" style={cardStyle}>
      <h2 style={sectionHeadingStyle}>
        <IconSheets size={16} style={{ color: 'var(--sh-brand)' }} />
        Recent Sheets
      </h2>
      {sheets && sheets.length > 0
        ? sheets.map((sheet) => (
            <Link key={sheet.id} to={`/sheets/${sheet.id}`} style={{ display: 'block', padding: '12px 0', borderBottom: '1px solid var(--sh-border)', textDecoration: 'none' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sh-heading)', marginBottom: 6 }}>{sheet.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {sheet.course?.code && <span style={pillStyle}>{sheet.course.code}</span>}
                <span style={{ fontSize: 12, color: 'var(--sh-muted)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <IconStar size={12} /> {sheet.stars || 0}
                </span>
              </div>
            </Link>
          ))
        : (
            <div style={{ textAlign: 'center', padding: '36px 16px' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--sh-brand-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sh-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 4 }}>No public sheets yet</div>
              <div style={{ fontSize: 12, color: 'var(--sh-muted)', lineHeight: 1.5 }}>Sheets uploaded by this user will appear here.</div>
            </div>
          )
      }
    </div>
  )
}

/* ── Shared Notes section ───────────────────────────────────────────────── */
export function SharedNotesSection({ notes }) {
  if (!notes || notes.length === 0) return null
  return (
    <div style={cardStyle}>
      <h2 style={sectionHeadingStyle}>Shared Notes</h2>
      {notes.map((note) => (
        <div key={note.id} style={{ display: 'block', padding: '12px 0', borderBottom: '1px solid var(--sh-border)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sh-heading)', marginBottom: 4 }}>{note.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {note.course?.code && <span style={pillStyle}>{note.course.code}</span>}
            <span style={{ fontSize: 12, color: 'var(--sh-muted)', marginLeft: 'auto' }}>
              {new Date(note.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Starred Sheets section ─────────────────────────────────────────────── */
export function StarredSheetsSection({ sheets, isOwnProfile }) {
  if (!sheets || sheets.length === 0) return null
  return (
    <div style={cardStyle}>
      <h2 style={sectionHeadingStyle}>
        <IconStar size={16} style={{ color: '#f59e0b' }} />
        Starred Sheets
      </h2>
      {sheets.map((sheet) => (
        <Link key={sheet.id} to={`/sheets/${sheet.id}`} style={{ display: 'block', padding: '12px 0', borderBottom: '1px solid var(--sh-border)', textDecoration: 'none' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sh-heading)', marginBottom: 6 }}>{sheet.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {sheet.course?.code && <span style={pillStyle}>{sheet.course.code}</span>}
            {sheet.author?.username && (
              <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>by {sheet.author.username}</span>
            )}
            <span style={{ fontSize: 12, color: 'var(--sh-muted)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconStar size={12} /> {sheet.stars || 0}
            </span>
          </div>
        </Link>
      ))}
      {isOwnProfile && (
        <Link to="/sheets?starred=1" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 13, fontWeight: 700, color: 'var(--sh-brand)', textDecoration: 'none' }}>
          View all starred sheets
        </Link>
      )}
    </div>
  )
}

/* ── Enrolled Courses section ───────────────────────────────────────────── */
export function EnrolledCoursesSection({ enrollments }) {
  return (
    <div data-tutorial="profile-courses" style={cardStyle}>
      <h2 style={sectionHeadingStyle}>Enrolled Courses</h2>
      {enrollments && enrollments.length > 0
        ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {enrollments.map((e) => (
                <span key={e.id} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 99, background: 'var(--sh-soft)', border: '1px solid var(--sh-border)', color: 'var(--sh-text)', display: 'inline-flex', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700 }}>{e.course?.code}</span>
                  {e.course?.school?.name && (
                    <span style={{ color: 'var(--sh-muted)', marginLeft: 4, fontSize: 11 }}>&middot; {e.course.school.name}</span>
                  )}
                </span>
              ))}
            </div>
          )
        : (
            <div style={{ textAlign: 'center', padding: '28px 0', fontSize: 14, color: 'var(--sh-muted)' }}>
              No enrolled courses
            </div>
          )
      }
    </div>
  )
}

/* ── Follow list modal ──────────────────────────────────────────────────── */
export function FollowModal({ followModal, followList, followListLoading, onClose }) {
  if (!followModal) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--sh-surface)', borderRadius: 18, width: 'min(420px, 92vw)',
          maxHeight: '70vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 30px rgba(15,23,42,0.18)', fontFamily: FONT,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 14px', borderBottom: '1px solid var(--sh-border)' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--sh-heading)' }}>
            {followModal === 'followers' ? 'Followers' : 'Following'}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--sh-muted)', cursor: 'pointer', padding: '4px 8px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', padding: '8px 10px 14px' }}>
          {followListLoading ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--sh-muted)', fontSize: 14 }}>Loading…</div>
          ) : followList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--sh-muted)', fontSize: 14 }}>
              {followModal === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            </div>
          ) : (
            followList.map((u) => (
              <Link
                key={u.id}
                to={`/users/${u.username}`}
                onClick={onClose}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: 10, textDecoration: 'none', color: 'inherit',
                  transition: 'background .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sh-soft)' }}
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
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)' }}>{u.username}</div>
                  <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
                    {u.role === 'admin' ? 'Admin' : 'Student'}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
