/**
 * ProfileStatsWidget — Contribution statistics card for user profiles.
 *
 * Track B1: Enhanced User Profiles — Cycle B: Social & Discovery.
 *
 * Fetches stats from GET /api/users/:username/stats and renders
 * contribution metrics with top courses.
 */
import { useEffect, useState } from 'react'
import { FONT, cardStyle, sectionHeadingStyle } from './profileConstants'
import { API } from '../../config'

export default function ProfileStatsWidget({ username }) {
  const [result, setResult] = useState({ forUser: null, stats: null, done: false })
  const loading = result.forUser !== username || !result.done
  const stats = result.forUser === username ? result.stats : null

  useEffect(() => {
    if (!username) return
    let cancelled = false
    fetch(`${API}/api/users/${encodeURIComponent(username)}/stats`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setResult({ forUser: username, stats: data, done: true })
      })
      .catch(() => {
        if (!cancelled) setResult({ forUser: username, stats: null, done: true })
      })
    return () => {
      cancelled = true
    }
  }, [username])

  if (loading) return null
  if (!stats) return null

  const metrics = [
    { label: 'Sheets', value: stats.totalSheets },
    { label: 'Stars earned', value: stats.totalStarsReceived },
    { label: 'Comments', value: stats.totalComments },
    { label: 'Forks', value: stats.totalForks },
    { label: 'Contributions', value: stats.totalContributions },
  ]

  return (
    <div style={cardStyle}>
      <h3 style={sectionHeadingStyle}>Contribution Stats</h3>

      {/* Metric grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
          gap: 10,
          marginBottom: stats.topCourses?.length > 0 ? 18 : 0,
        }}
      >
        {metrics.map((m) => (
          <div key={m.label} style={metricCard}>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: 'var(--sh-heading)',
                fontFamily: FONT,
              }}
            >
              {formatCount(m.value)}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sh-muted)', marginTop: 2 }}>
              {m.label}
            </div>
          </div>
        ))}
      </div>

      {/* 30-day trend */}
      {stats.last30Days && (stats.last30Days.sheets > 0 || stats.last30Days.comments > 0) && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--sh-subtext)',
            marginBottom: stats.topCourses?.length > 0 ? 14 : 0,
          }}
        >
          Last 30 days: <strong>{stats.last30Days.sheets}</strong> sheets,{' '}
          <strong>{stats.last30Days.comments}</strong> comments
        </div>
      )}

      {/* Top courses */}
      {stats.topCourses && stats.topCourses.length > 0 && (
        <>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--sh-muted)',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
            }}
          >
            Top Courses
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {stats.topCourses.map((c) => (
              <span key={c.courseId} style={coursePill}>
                {c.code} <span style={{ fontWeight: 400, opacity: 0.7 }}>({c.sheetCount})</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function formatCount(n) {
  if (n === undefined || n === null) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

const metricCard = {
  padding: '12px 14px',
  borderRadius: 12,
  background: 'var(--sh-soft)',
  textAlign: 'center',
}

const coursePill = {
  fontSize: 12,
  fontWeight: 700,
  padding: '4px 12px',
  borderRadius: 99,
  background: 'var(--sh-info-bg)',
  color: 'var(--sh-info-text)',
  border: '1px solid var(--sh-info-border)',
}
