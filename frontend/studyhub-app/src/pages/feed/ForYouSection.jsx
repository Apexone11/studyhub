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

export default function ForYouSection() {
  const [data, setData] = useState({ sheets: [], groups: [], people: [], trending: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadForYouData = async () => {
      try {
        const response = await fetch(`${API}/api/feed/for-you`, {
          credentials: 'include',
        })
        if (response.ok) {
          const result = await response.json()
          setData({
            sheets: Array.isArray(result.sheets) ? result.sheets : [],
            groups: Array.isArray(result.groups) ? result.groups : [],
            people: Array.isArray(result.people) ? result.people : [],
            trending: Array.isArray(result.trending) ? result.trending : [],
          })
          setError('')
        } else {
          setError('Could not load personalized content.')
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
          <section key={title} style={{ display: 'grid', gap: 12 }}>
            <h2 style={sectionTitleStyle}>{title}</h2>
            <div
              style={{
                display: 'flex',
                gap: 12,
                overflowX: 'auto',
                paddingBottom: 8,
                scrollBehavior: 'smooth',
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    minWidth: 280,
                    height: 160,
                    borderRadius: 12,
                    background: 'var(--sh-soft)',
                    animation: 'pulse 2s infinite',
                  }}
                />
              ))}
            </div>
          </section>
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
    <div style={{ display: 'grid', gap: 28 }}>
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
          renderCard={(sheet) => <TrendingCard key={sheet.id} sheet={sheet} />}
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
              color: 'var(--sh-muted)',
              fontSize: 13,
            }}
          >
            No personalized content available yet. Follow more users and join courses to see
            recommendations.
          </div>
        )}
    </div>
  )
}

function HorizontalSection({ title, items, renderCard }) {
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      <div
        style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          paddingBottom: 8,
          scrollBehavior: 'smooth',
        }}
      >
        {items.map(renderCard)}
      </div>
    </section>
  )
}

function SheetCard({ sheet }) {
  return (
    <Link
      to={`/sheets/${sheet.id}`}
      style={{
        ...cardContainerStyle,
        textDecoration: 'none',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--sh-heading)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 4,
          }}
        >
          {sheet.title}
        </div>
        {sheet.course && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--sh-brand)',
              marginBottom: 8,
            }}
          >
            {sheet.course.code}
          </div>
        )}
        <div
          style={{
            fontSize: 12,
            color: 'var(--sh-muted)',
            marginBottom: 8,
          }}
        >
          by {sheet.author?.username || 'Unknown'}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 10,
            fontSize: 11,
            color: 'var(--sh-subtext)',
          }}
        >
          <span>{sheet.stars || 0} stars</span>
          <span>{sheet.commentCount || 0} comments</span>
        </div>
      </div>
    </Link>
  )
}

function GroupCard({ group }) {
  const [isJoining, setIsJoining] = useState(false)

  const handleJoin = async (e) => {
    e.preventDefault()
    setIsJoining(true)
    try {
      const response = await fetch(`${API}/api/study-groups/${group.id}/join`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (response.ok) {
        // Optionally update UI or show toast
      }
    } catch {
      // Handle error silently
    } finally {
      setIsJoining(false)
    }
  }

  return (
    <div style={cardContainerStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--sh-heading)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 4,
          }}
        >
          {group.name}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--sh-muted)',
            marginBottom: 8,
          }}
        >
          {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
        </div>
        {group.privacy && (
          <div
            style={{
              display: 'inline-block',
              fontSize: 10,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 6,
              background: 'var(--sh-soft)',
              color: 'var(--sh-subtext)',
              marginBottom: 8,
              textTransform: 'capitalize',
            }}
          >
            {group.privacy}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handleJoin}
        disabled={isJoining}
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '6px 14px',
          borderRadius: 7,
          border: 'none',
          background: 'var(--sh-brand)',
          color: 'var(--sh-surface)',
          cursor: isJoining ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
          opacity: isJoining ? 0.6 : 1,
        }}
      >
        {isJoining ? 'Joining...' : 'Join'}
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
      if (response.ok) {
        setIsFollowing(true)
      }
    } catch (err) {
      setIsFollowing(false)
      console.error('[ForYou] follow error:', err)
    }
  }

  return (
    <Link
      to={`/users/${person.username}`}
      style={{
        ...cardContainerStyle,
        textDecoration: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <UserAvatar username={person.username} avatarUrl={person.avatarUrl} size={48} />
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
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
          marginBottom: 10,
        }}
      >
        {person.sharedCourses || 0} shared {person.sharedCourses === 1 ? 'course' : 'courses'}
      </div>
      <button
        type="button"
        onClick={handleFollow}
        disabled={isFollowing}
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '6px 14px',
          borderRadius: 7,
          border: 'none',
          background: isFollowing ? 'var(--sh-soft)' : 'var(--sh-brand)',
          color: isFollowing ? 'var(--sh-muted)' : 'var(--sh-surface)',
          cursor: isFollowing ? 'default' : 'pointer',
          whiteSpace: 'nowrap',
          width: '100%',
        }}
      >
        {isFollowing ? 'Following' : 'Follow'}
      </button>
    </Link>
  )
}

function TrendingCard({ sheet }) {
  return (
    <Link
      to={`/sheets/${sheet.id}`}
      style={{
        ...cardContainerStyle,
        textDecoration: 'none',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'var(--sh-brand)',
          color: '#fff',
          fontSize: 12,
          fontWeight: 800,
          flexShrink: 0,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 10 }}>+</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--sh-heading)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 4,
          }}
        >
          {sheet.title}
        </div>
        {sheet.course && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--sh-brand)',
              marginBottom: 8,
            }}
          >
            {sheet.course.code}
          </div>
        )}
        <div
          style={{
            fontSize: 12,
            color: 'var(--sh-muted)',
            marginBottom: 8,
          }}
        >
          by {sheet.author?.username || 'Unknown'}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 10,
            fontSize: 11,
            color: 'var(--sh-subtext)',
          }}
        >
          <span>{sheet.stars || 0} stars</span>
          <span>{sheet.commentCount || 0} comments</span>
        </div>
      </div>
    </Link>
  )
}

const cardContainerStyle = {
  minWidth: 280,
  display: 'flex',
  flexDirection: 'column',
  padding: 14,
  borderRadius: 12,
  background: 'var(--sh-surface)',
  border: '1px solid var(--sh-border)',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  fontFamily: FONT,
  cursor: 'pointer',
}

const sectionTitleStyle = {
  fontSize: 18,
  fontWeight: 800,
  color: 'var(--sh-heading)',
  margin: 0,
  fontFamily: FONT,
}
