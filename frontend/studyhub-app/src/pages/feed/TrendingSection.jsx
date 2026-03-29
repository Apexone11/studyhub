/**
 * TrendingSection — Trending sheets sidebar/section for the feed page.
 *
 * Track B3: Discovery Engine — Cycle B: Social & Discovery.
 *
 * Fetches from GET /api/feed/trending and displays ranked sheet cards.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL || ''
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

export default function TrendingSection({ period = '7d', limit = 8 }) {
  const [sheets, setSheets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/api/feed/trending?period=${period}&limit=${limit}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setSheets(data || []))
      .catch(() => setSheets([]))
      .finally(() => setLoading(false))
  }, [period, limit])

  if (loading) {
    return (
      <div style={containerStyle}>
        <h3 style={headingStyle}>Trending</h3>
        <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>Loading...</div>
      </div>
    )
  }

  if (sheets.length === 0) return null

  return (
    <div style={containerStyle}>
      <h3 style={headingStyle}>Trending This Week</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {sheets.map((sheet, idx) => (
          <Link
            key={sheet.id}
            to={`/sheets/${sheet.id}`}
            style={cardStyle}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={rankBadge}>{idx + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--sh-heading)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {sheet.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--sh-muted)', marginTop: 2 }}>
                  {sheet.author?.username || 'Unknown'}
                  {sheet.course && <span> · {sheet.course.code}</span>}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, color: 'var(--sh-subtext)' }}>
                  <span>{sheet.stars || 0} stars</span>
                  <span>{sheet.commentCount || 0} comments</span>
                  {sheet.forkCount > 0 && <span>{sheet.forkCount} forks</span>}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

const containerStyle = {
  padding: '20px 24px',
  borderRadius: 18,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)',
  boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
}

const headingStyle = {
  margin: '0 0 14px',
  fontSize: 15,
  fontWeight: 800,
  color: 'var(--sh-heading)',
  fontFamily: FONT,
}

const cardStyle = {
  display: 'block',
  padding: '10px 12px',
  borderRadius: 12,
  background: 'var(--sh-bg)',
  textDecoration: 'none',
  transition: 'background .15s',
}

const rankBadge = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: '50%',
  background: 'var(--sh-brand)',
  color: '#fff',
  fontSize: 11,
  fontWeight: 800,
  flexShrink: 0,
  fontFamily: FONT,
}
