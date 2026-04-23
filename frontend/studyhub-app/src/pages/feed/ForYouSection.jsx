/**
 * ForYouSection — Personalized discovery feed with recommended content.
 *
 * Fetches from GET /api/feed/for-you and displays:
 * - Recommended Sheets
 * - Study Groups For You
 * - People You May Know
 * - Trending This Week
 *
 * Each section is a horizontal card row with lazy-loaded data.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import UserAvatar from '../../components/UserAvatar'
import { API } from '../../config'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

export default function ForYouSection({ onSwitchToAll }) {
  const [data, setData] = useState({ sheets: [], groups: [], people: [], trending: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadForYouData = async () => {
      try {
        const response = await fetch(`${API}/api/feed/for-you`, {
          credentials: 'include',
        })
        const result = await response.json()
        if (response.ok) {
          setData({
            sheets: Array.isArray(result.sheets) ? result.sheets : [],
            groups: Array.isArray(result.groups) ? result.groups : [],
            people: Array.isArray(result.people) ? result.people : [],
            trending: Array.isArray(result.trending) ? result.trending : [],
          })
          setError('')
        } else {
          setError(result.error || 'Could not load personalized content.')
        }
      } catch {
        setError('Could not load personalized content.')
      } finally {
        setLoading(false)
      }
    }

    loadForYouData()
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'grid', gap: 28 }}>
        {[
          'Recommended Sheets',
          'Study Groups For You',
          'People You May Know',
          'Trending This Week',
        ].map((title) => (
          <div
            key={title}
            role="region"
            aria-label={title}
            style={{ display: 'grid', gap: 14, background: 'transparent', boxShadow: 'none' }}
          >
            <SectionHeader title={title} />
            <div style={rowStyle}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    minWidth: 280,
                    height: 168,
                    borderRadius: 14,
                    background: 'var(--sh-soft)',
                    animation: 'pulse 2s infinite',
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          padding: '24px',
          borderRadius: 12,
          background: 'var(--sh-danger-bg)',
          border: '1px solid var(--sh-danger-border)',
          color: 'var(--sh-danger-text)',
          fontSize: 13,
        }}
      >
        {error}
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: 28,
        background: 'transparent',
        boxShadow: 'none',
      }}
    >
      {data.sheets.length > 0 && (
        <HorizontalSection
          title="Recommended Sheets"
          items={data.sheets}
          renderCard={(sheet) => <SheetCard key={sheet.id} sheet={sheet} />}
        />
      )}
      {data.groups.length > 0 && (
        <HorizontalSection
          title="Study Groups For You"
          items={data.groups}
          renderCard={(group) => <GroupCard key={group.id} group={group} />}
        />
      )}
      {data.people.length > 0 && (
        <HorizontalSection
          title="People You May Know"
          items={data.people}
          renderCard={(person) => <PersonCard key={person.id} person={person} />}
        />
      )}
      {data.trending.length > 0 && (
        <HorizontalSection
          title="Trending This Week"
          items={data.trending}
          renderCard={(sheet, idx) => <TrendingCard key={sheet.id} sheet={sheet} rank={idx + 1} />}
        />
      )}
      {data.sheets.length === 0 &&
        data.groups.length === 0 &&
        data.people.length === 0 &&
        data.trending.length === 0 && (
          <div
            style={{
              padding: '40px 24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <p style={{ color: 'var(--sh-muted)', fontSize: 14, margin: 0 }}>
              No personalized content available yet. Follow more users and enroll in courses to see
              recommendations here.
            </p>
            {onSwitchToAll && (
              <button
                type="button"
                onClick={onSwitchToAll}
                style={{
                  padding: '8px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--sh-brand)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: FONT,
                }}
              >
                Browse All Posts
              </button>
            )}
          </div>
        )}
    </div>
  )
}

function SectionHeader({ title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        aria-hidden="true"
        style={{
          width: 4,
          height: 20,
          borderRadius: 2,
          background: 'var(--sh-brand)',
        }}
      />
      <h2 style={sectionTitleStyle}>{title}</h2>
    </div>
  )
}

function HorizontalSection({ title, items, renderCard }) {
  // Use a <div> with role="region" rather than <section> so the global
  // `[data-theme='dark'] .sh-ambient-main > section` shadow/background rules
  // can't touch us. The surrounding dark rectangle was these stacked shadows
  // on a dark page bg reading as a filled container.
  return (
    <div
      role="region"
      aria-label={title}
      style={{
        display: 'grid',
        gap: 14,
        background: 'transparent',
        boxShadow: 'none',
      }}
    >
      <SectionHeader title={title} />
      <div style={rowStyle}>{items.map(renderCard)}</div>
    </div>
  )
}

function CourseChip({ code }) {
  if (!code) return null
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 22,
        padding: '0 10px',
        borderRadius: 999,
        background: 'var(--sh-brand-bg, rgba(37,99,235,0.10))',
        color: 'var(--sh-brand)',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.2px',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {code}
    </span>
  )
}

function MetaRow({ stars, comments }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        color: 'var(--sh-muted)',
        fontWeight: 600,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <StarGlyph /> {stars || 0}
      </span>
      <span
        aria-hidden="true"
        style={{
          width: 3,
          height: 3,
          borderRadius: '50%',
          background: 'var(--sh-muted)',
          opacity: 0.5,
        }}
      />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <CommentGlyph /> {comments || 0}
      </span>
    </div>
  )
}

function StarGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function CommentGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function SheetCard({ sheet }) {
  return (
    <Link
      to={`/sheets/${sheet.id}`}
      style={{ ...cardContainerStyle, textDecoration: 'none' }}
      onMouseEnter={applyHover}
      onMouseLeave={clearHover}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <CourseChip code={sheet.course?.code} />
      </div>
      <div style={titleStyle} title={sheet.title}>
        {sheet.title}
      </div>
      <div style={{ flex: 1 }} />
      <div style={authorRowStyle}>
        <UserAvatar
          username={sheet.author?.username}
          avatarUrl={sheet.author?.avatarUrl}
          size={20}
        />
        <span>by {sheet.author?.username || 'Unknown'}</span>
      </div>
      <MetaRow stars={sheet.stars} comments={sheet.commentCount} />
    </Link>
  )
}

function GroupCard({ group }) {
  const [isJoining, setIsJoining] = useState(false)

  const handleJoin = async (e) => {
    e.preventDefault()
    setIsJoining(true)
    try {
      await fetch(`${API}/api/study-groups/${group.id}/join`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
    } catch {
      // ignore
    } finally {
      setIsJoining(false)
    }
  }

  return (
    <div style={cardContainerStyle} onMouseEnter={applyHover} onMouseLeave={clearHover}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {group.privacy && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 22,
              padding: '0 10px',
              borderRadius: 999,
              background: 'var(--sh-soft)',
              color: 'var(--sh-subtext)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.2px',
              lineHeight: 1,
              textTransform: 'capitalize',
            }}
          >
            {group.privacy}
          </span>
        )}
      </div>
      <div style={titleStyle} title={group.name}>
        {group.name}
      </div>
      <div style={{ flex: 1 }} />
      <div
        style={{
          fontSize: 12,
          color: 'var(--sh-muted)',
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
      </div>
      <button
        type="button"
        onClick={handleJoin}
        disabled={isJoining}
        style={primaryBtnStyle(isJoining)}
      >
        {isJoining ? 'Joining...' : 'Join group'}
      </button>
    </div>
  )
}

function PersonCard({ person }) {
  const [isFollowing, setIsFollowing] = useState(false)

  const handleFollow = async (e) => {
    e.preventDefault()
    setIsFollowing(true)
    try {
      const response = await fetch(
        `${API}/api/users/${encodeURIComponent(person.username)}/follow`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        },
      )
      if (response.ok) setIsFollowing(true)
    } catch {
      setIsFollowing(false)
    }
  }

  return (
    <Link
      to={`/users/${person.username}`}
      style={{
        ...cardContainerStyle,
        textDecoration: 'none',
        alignItems: 'center',
        textAlign: 'center',
      }}
      onMouseEnter={applyHover}
      onMouseLeave={clearHover}
    >
      <UserAvatar username={person.username} avatarUrl={person.avatarUrl} size={56} />
      <div
        style={{
          fontSize: 15,
          fontWeight: 800,
          color: 'var(--sh-heading)',
          marginTop: 10,
          marginBottom: 4,
        }}
      >
        {person.username}
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--sh-muted)',
          fontWeight: 600,
          marginBottom: 12,
        }}
      >
        {person.sharedCourses || 0} shared {person.sharedCourses === 1 ? 'course' : 'courses'}
      </div>
      <button
        type="button"
        onClick={handleFollow}
        disabled={isFollowing}
        style={{
          ...primaryBtnStyle(isFollowing),
          background: isFollowing ? 'var(--sh-soft)' : 'var(--sh-brand)',
          color: isFollowing ? 'var(--sh-muted)' : '#fff',
          cursor: isFollowing ? 'default' : 'pointer',
        }}
      >
        {isFollowing ? 'Following' : 'Follow'}
      </button>
    </Link>
  )
}

function TrendingCard({ sheet, rank }) {
  return (
    <Link
      to={`/sheets/${sheet.id}`}
      style={{ ...cardContainerStyle, textDecoration: 'none' }}
      onMouseEnter={applyHover}
      onMouseLeave={clearHover}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span
          aria-label={`Rank ${rank}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 8,
            background: rank === 1 ? 'var(--sh-brand)' : 'var(--sh-soft)',
            color: rank === 1 ? '#fff' : 'var(--sh-heading)',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '-0.01em',
            flexShrink: 0,
          }}
        >
          #{rank}
        </span>
        <CourseChip code={sheet.course?.code} />
      </div>
      <div style={titleStyle} title={sheet.title}>
        {sheet.title}
      </div>
      <div style={{ flex: 1 }} />
      <div style={authorRowStyle}>
        <UserAvatar
          username={sheet.author?.username}
          avatarUrl={sheet.author?.avatarUrl}
          size={20}
        />
        <span>by {sheet.author?.username || 'Unknown'}</span>
      </div>
      <MetaRow stars={sheet.stars} comments={sheet.commentCount} />
    </Link>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────

const rowStyle = {
  display: 'flex',
  gap: 14,
  overflowX: 'auto',
  paddingBottom: 8,
  scrollBehavior: 'smooth',
  scrollSnapType: 'x proximity',
}

const cardContainerStyle = {
  minWidth: 280,
  maxWidth: 320,
  flex: '0 0 auto',
  display: 'flex',
  flexDirection: 'column',
  padding: 16,
  borderRadius: 14,
  background: 'var(--sh-surface)',
  border: '1px solid var(--sh-border)',
  boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04))',
  transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
  fontFamily: FONT,
  cursor: 'pointer',
  scrollSnapAlign: 'start',
  minHeight: 168,
}

const sectionTitleStyle = {
  fontSize: 17,
  fontWeight: 800,
  color: 'var(--sh-heading)',
  margin: 0,
  fontFamily: FONT,
  letterSpacing: '-0.01em',
}

const titleStyle = {
  fontSize: 15,
  fontWeight: 800,
  color: 'var(--sh-heading)',
  lineHeight: 1.35,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  marginBottom: 6,
  letterSpacing: '-0.01em',
}

const authorRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: 'var(--sh-muted)',
  fontWeight: 600,
  marginBottom: 8,
}

function primaryBtnStyle(disabled) {
  return {
    width: '100%',
    fontSize: 12,
    fontWeight: 700,
    padding: '8px 14px',
    borderRadius: 10,
    border: 'none',
    background: 'var(--sh-brand)',
    color: '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    fontFamily: FONT,
    letterSpacing: '0.1px',
  }
}

function applyHover(e) {
  const el = e.currentTarget
  el.style.transform = 'translateY(-2px)'
  el.style.borderColor = 'var(--sh-brand)'
  el.style.boxShadow = '0 6px 18px rgba(37,99,235,0.12)'
}

function clearHover(e) {
  const el = e.currentTarget
  el.style.transform = ''
  el.style.borderColor = 'var(--sh-border)'
  el.style.boxShadow = 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04))'
}
