/**
 * SheetLabAnalytics — Owner analytics dashboard for sheets.
 * Shows engagement metrics, time-series sparklines, top contributors,
 * fork tree, and recent activity.
 *
 * Track D1 — Cycle D: Admin & Moderation.
 */
import { useCallback, useEffect, useState } from 'react'
import { API } from '../../../config'
import { authHeaders } from './sheetLabConstants'

/* ── SVG Sparkline ─────────────────────────────────────────── */

function Sparkline({ data, width = 200, height = 40, color = '#6366f1' }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--sh-muted)' }}>No data yet</span>
      </div>
    )
  }

  const values = data.map((d) => d.count)
  const max = Math.max(...values, 1)
  const step = width / Math.max(values.length - 1, 1)
  const padding = 4

  const points = values.map((v, i) => {
    const x = i * step
    const y = height - padding - ((v / max) * (height - padding * 2))
    return `${x},${y}`
  }).join(' ')

  // Fill area
  const fillPoints = `0,${height - padding} ${points} ${width},${height - padding}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label={`Sparkline chart showing ${data.length} data points`}
      role="img"
    >
      <polygon
        points={fillPoints}
        fill={color}
        fillOpacity="0.1"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Endpoint dot */}
      {values.length > 0 && (
        <circle
          cx={width}
          cy={height - padding - ((values[values.length - 1] / max) * (height - padding * 2))}
          r="3"
          fill={color}
        />
      )}
    </svg>
  )
}

/* ── Stat Card ─────────────────────────────────────────────── */

function StatCard({ label, value, icon, color, sparkData, sparkColor }) {
  return (
    <div style={{
      background: 'var(--sh-surface)', border: '1px solid var(--sh-border)',
      borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sh-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
          {label}
        </span>
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || 'var(--sh-heading)' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {sparkData && (
        <Sparkline data={sparkData} width={160} height={32} color={sparkColor || '#6366f1'} />
      )}
    </div>
  )
}

/* ── Activity Item ─────────────────────────────────────────── */

const activityLabels = {
  comment: 'commented',
  contribution_pending: 'opened a contribution',
  contribution_accepted: 'contribution accepted',
  contribution_rejected: 'contribution rejected',
  commit: 'committed',
}

const activityColors = {
  comment: '#6366f1',
  contribution_pending: '#f59e0b',
  contribution_accepted: '#16a34a',
  contribution_rejected: '#ef4444',
  commit: '#8b5cf6',
}

function ActivityItem({ item }) {
  const label = activityLabels[item.type] || item.type
  const dotColor = activityColors[item.type] || 'var(--sh-muted)'
  const dateStr = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0' }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%', background: dotColor,
        flexShrink: 0, marginTop: 5,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, color: 'var(--sh-text)' }}>
          {item.actor ? (
            <span style={{ fontWeight: 700, color: 'var(--sh-heading)' }}>{item.actor}</span>
          ) : null}
          {item.actor ? ' ' : ''}{label}
          {item.detail ? <span style={{ color: 'var(--sh-muted)' }}> — {item.detail}</span> : null}
        </span>
      </div>
      <span style={{ fontSize: 11, color: 'var(--sh-muted)', flexShrink: 0 }}>{dateStr}</span>
    </div>
  )
}

/* ── Contributor Row ───────────────────────────────────────── */

function ContributorRow({ contributor, rank }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
      borderBottom: '1px solid var(--sh-border)',
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 10, fontWeight: 800,
        background: rank <= 3 ? '#6366f1' : 'var(--sh-soft)',
        color: rank <= 3 ? '#fff' : 'var(--sh-muted)',
      }}>
        {rank}
      </span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--sh-heading)' }}>
        {contributor.displayName || contributor.username}
      </span>
      <span style={{
        fontSize: 11, fontWeight: 700, color: 'var(--sh-brand)',
        background: 'var(--sh-brand-soft)', padding: '2px 8px', borderRadius: 6,
      }}>
        {contributor.contributions} {contributor.contributions === 1 ? 'contribution' : 'contributions'}
      </span>
    </div>
  )
}

/* ── Fork Row ──────────────────────────────────────────────── */

function ForkRow({ fork }) {
  const dateStr = new Date(fork.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
      borderBottom: '1px solid var(--sh-border)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--sh-muted)' }}>⑂</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fork.title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
          by {fork.author?.username || 'unknown'} • {dateStr}
        </div>
      </div>
      <span style={{
        fontSize: 11, fontWeight: 700, color: 'var(--sh-warning-text)',
        background: 'var(--sh-warning-bg)', padding: '2px 8px', borderRadius: 6,
      }}>
        {fork.stars} stars
      </span>
    </div>
  )
}

/* ── Main Component ────────────────────────────────────────── */

export default function SheetLabAnalytics({ sheet }) {
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAnalytics = useCallback(async () => {
    if (!sheet?.id) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}/analytics`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to load analytics.')
      }
      const data = await response.json()
      setAnalytics(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [sheet?.id])

  useEffect(() => { fetchAnalytics() }, [fetchAnalytics])

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--sh-muted)', fontSize: 13 }}>
          Loading analytics...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={{
          padding: 20, borderRadius: 12, background: 'var(--sh-danger-bg)',
          border: '1px solid var(--sh-danger-border)', color: 'var(--sh-danger-text)', fontSize: 13,
        }}>
          {error}
        </div>
      </div>
    )
  }

  if (!analytics) return null

  const { metrics, engagement, topContributors, forkChildren, recentActivity } = analytics

  return (
    <div style={containerStyle}>
      {/* Metrics grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
      }}>
        <StatCard
          label="Stars"
          value={metrics.stars}
          color="var(--sh-warning-text, #92400e)"
          sparkData={engagement.starHistory}
          sparkColor="#f59e0b"
        />
        <StatCard
          label="Downloads"
          value={metrics.downloads}
          color="var(--sh-success-text, #166534)"
        />
        <StatCard
          label="Forks"
          value={metrics.forks}
          color="var(--sh-brand, #6366f1)"
        />
        <StatCard
          label="Comments"
          value={metrics.comments}
          sparkData={engagement.commentHistory}
          sparkColor="#6366f1"
        />
        <StatCard
          label="Contributions"
          value={metrics.contributions}
          color="var(--sh-info-text, #1e40af)"
        />
        <StatCard
          label="Commits"
          value={metrics.commits}
          color="#8b5cf6"
        />
      </div>

      {/* Two-column detail panels */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 14,
        marginTop: 14,
      }}>
        {/* Top contributors */}
        <div style={panelStyle}>
          <h3 style={panelTitleStyle}>Top Contributors</h3>
          {topContributors.length === 0 ? (
            <div style={emptyStyle}>No contributions yet.</div>
          ) : (
            topContributors.map((c, i) => (
              <ContributorRow key={c.username} contributor={c} rank={i + 1} />
            ))
          )}
        </div>

        {/* Fork tree */}
        <div style={panelStyle}>
          <h3 style={panelTitleStyle}>Fork Tree</h3>
          {forkChildren.length === 0 ? (
            <div style={emptyStyle}>No forks yet.</div>
          ) : (
            forkChildren.map((f) => <ForkRow key={f.id} fork={f} />)
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div style={{ ...panelStyle, marginTop: 14 }}>
        <h3 style={panelTitleStyle}>Recent Activity</h3>
        {recentActivity.length === 0 ? (
          <div style={emptyStyle}>No activity yet.</div>
        ) : (
          <div role="list" aria-label="Recent sheet activity">
            {recentActivity.map((item, i) => (
              <div key={i} role="listitem">
                <ActivityItem item={item} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Styles ────────────────────────────────────────────────── */

const containerStyle = {
  display: 'grid',
  gap: 0,
}

const panelStyle = {
  background: 'var(--sh-surface)',
  border: '1px solid var(--sh-border)',
  borderRadius: 14,
  padding: '16px 18px',
}

const panelTitleStyle = {
  margin: '0 0 12px',
  fontSize: 13,
  fontWeight: 800,
  color: 'var(--sh-heading)',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
}

const emptyStyle = {
  fontSize: 12,
  color: 'var(--sh-muted)',
  fontStyle: 'italic',
  padding: '8px 0',
}
