import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'
import { FONT } from './adminConstants'
import UserAvatar from '../../components/UserAvatar'

const PERIODS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
]

const SECTION_STYLE = {
  background: 'var(--sh-surface)',
  borderRadius: 18,
  border: '1px solid var(--sh-border)',
  padding: '22px',
}

const TH_STYLE = {
  padding: '8px 10px',
  textAlign: 'left',
  fontWeight: 700,
  color: 'var(--sh-slate-500)',
  borderBottom: '2px solid var(--sh-border)',
  fontSize: 11,
  letterSpacing: '.04em',
}

const TD_STYLE = {
  padding: '8px 10px',
  color: 'var(--sh-slate-700)',
  borderBottom: '1px solid var(--sh-border)',
}

/* -- Tiny inline bar chart (SVG) ---------------------------------------- */

function BarChart({ data, color = '#2563eb', height = 120 }) {
  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--sh-muted)',
          fontSize: 12,
        }}
      >
        No data for this period
      </div>
    )
  }

  const maxVal = Math.max(...data.map((d) => d.count), 1)
  const barWidth = Math.max(4, Math.min(24, Math.floor(500 / data.length) - 2))
  const chartWidth = data.length * (barWidth + 2)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={Math.max(chartWidth, 200)} height={height + 24} style={{ display: 'block' }}>
        {data.map((d, i) => {
          const barHeight = (d.count / maxVal) * height
          const x = i * (barWidth + 2)
          const y = height - barHeight
          const showLabel = i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 1)}
                rx={2}
                fill={color}
                opacity={0.85}
              >
                <title>{`${d.date}: ${d.count}`}</title>
              </rect>
              {showLabel ? (
                <text
                  x={x + barWidth / 2}
                  y={height + 14}
                  textAnchor="middle"
                  fill="var(--sh-muted)"
                  fontSize={9}
                  fontFamily={FONT}
                >
                  {d.date.slice(5)}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* -- Sparkline (SVG polyline) ------------------------------------------- */

function Sparkline({ data, color = '#2563eb', width = 120, height = 32 }) {
  if (!data || data.length < 2) return null

  const maxVal = Math.max(...data.map((d) => d.count), 1)
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - (d.count / maxVal) * (height - 4)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* -- Multi-series engagement chart -------------------------------------- */

function EngagementChart({ engagement, height = 140 }) {
  const series = [
    { key: 'posts', label: 'Posts', color: '#8b5cf6' },
    { key: 'comments', label: 'Comments', color: '#2563eb' },
    { key: 'stars', label: 'Stars', color: '#f59e0b' },
    { key: 'reactions', label: 'Reactions', color: '#ec4899' },
  ]

  const dateMap = new Map()
  for (const s of series) {
    for (const point of engagement[s.key] || []) {
      if (!dateMap.has(point.date)) dateMap.set(point.date, {})
      dateMap.get(point.date)[s.key] = point.count
    }
  }

  const dates = [...dateMap.keys()].sort()
  if (dates.length === 0) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--sh-muted)',
          fontSize: 12,
        }}
      >
        No engagement data for this period
      </div>
    )
  }

  const maxVal = Math.max(
    ...dates.flatMap((d) => series.map((s) => dateMap.get(d)?.[s.key] || 0)),
    1,
  )
  const chartWidth = Math.max(dates.length * 18, 300)

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <svg width={chartWidth} height={height + 24} style={{ display: 'block' }}>
          {dates.map((date, i) => {
            const groupWidth = 14
            const x = i * 18
            const vals = dateMap.get(date) || {}
            const barW = Math.max(2, Math.floor(groupWidth / series.length))
            const showLabel =
              i === 0 || i === dates.length - 1 || i === Math.floor(dates.length / 2)
            return (
              <g key={date}>
                {series.map((s, si) => {
                  const val = vals[s.key] || 0
                  const barH = (val / maxVal) * height
                  return (
                    <rect
                      key={s.key}
                      x={x + si * barW}
                      y={height - barH}
                      width={Math.max(barW - 1, 1)}
                      height={Math.max(barH, 0.5)}
                      rx={1}
                      fill={s.color}
                      opacity={0.8}
                    >
                      <title>{`${date} ${s.label}: ${val}`}</title>
                    </rect>
                  )
                })}
                {showLabel ? (
                  <text
                    x={x + groupWidth / 2}
                    y={height + 14}
                    textAnchor="middle"
                    fill="var(--sh-muted)"
                    fontSize={9}
                    fontFamily={FONT}
                  >
                    {date.slice(5)}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        {series.map((s) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
            <span style={{ fontSize: 11, color: 'var(--sh-slate-600)', fontWeight: 600 }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* -- KPI Card ----------------------------------------------------------- */

function KpiCard({ label, value, subtitle, color = '#2563eb', sparkData }) {
  return (
    <div
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 16,
        border: '1px solid var(--sh-border)',
        padding: '18px 18px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div
        style={{ fontSize: 11, fontWeight: 700, color: 'var(--sh-muted)', letterSpacing: '.08em' }}
      >
        {label.toUpperCase()}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        {sparkData ? <Sparkline data={sparkData} color={color} /> : null}
      </div>
      {subtitle ? (
        <div style={{ fontSize: 11, color: 'var(--sh-slate-500)' }}>{subtitle}</div>
      ) : null}
    </div>
  )
}

/* -- Ranking table ------------------------------------------------------ */

function RankTable({ title, columns, rows }) {
  if (!rows || rows.length === 0) {
    return (
      <div style={{ marginTop: 20 }}>
        <div
          style={{ fontSize: 14, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 10 }}
        >
          {title}
        </div>
        <div style={{ color: 'var(--sh-muted)', fontSize: 12 }}>No data yet</div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...TH_STYLE, width: 36 }}>#</th>
              {columns.map((col) => (
                <th key={col.key} style={{ ...TH_STYLE, textAlign: col.align || 'left' }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id || i}>
                <td style={TD_STYLE}>{i + 1}</td>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      ...TD_STYLE,
                      textAlign: col.align || 'left',
                      fontWeight: col.bold ? 700 : 400,
                    }}
                  >
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* -- Main AnalyticsTab -------------------------------------------------- */

export default function AnalyticsTab() {
  const [period, setPeriod] = useState('30d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [activeUsers, setActiveUsers] = useState(null)
  const [userGrowth, setUserGrowth] = useState(null)
  const [contentData, setContentData] = useState(null)
  const [engagement, setEngagement] = useState(null)
  const [topContent, setTopContent] = useState(null)

  const fetchAnalytics = useCallback(async (p) => {
    setLoading(true)
    setError('')
    try {
      const opts = { credentials: 'include', headers: { 'Content-Type': 'application/json' } }
      const [auRes, ugRes, cdRes, enRes, tcRes] = await Promise.all([
        fetch(`${API}/api/admin/analytics/active-users`, opts),
        fetch(`${API}/api/admin/analytics/users?period=${p}`, opts),
        fetch(`${API}/api/admin/analytics/content?period=${p}`, opts),
        fetch(`${API}/api/admin/analytics/engagement?period=${p}`, opts),
        fetch(`${API}/api/admin/analytics/top-content`, opts),
      ])
      const [auData, ugData, cdData, enData, tcData] = await Promise.all([
        auRes.ok ? auRes.json() : null,
        ugRes.ok ? ugRes.json() : null,
        cdRes.ok ? cdRes.json() : null,
        enRes.ok ? enRes.json() : null,
        tcRes.ok ? tcRes.json() : null,
      ])
      setActiveUsers(auData)
      setUserGrowth(ugData)
      setContentData(cdData)
      setEngagement(enData)
      setTopContent(tcData)
    } catch (err) {
      setError(err.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAnalytics(period)
  }, [period, fetchAnalytics])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header + Period Selector */}
      <section style={SECTION_STYLE}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 22, color: 'var(--sh-heading)' }}>Analytics</h1>
            <div style={{ fontSize: 12, color: 'var(--sh-subtext)', marginTop: 4 }}>
              Platform performance metrics and engagement data
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: period === p.value ? '1px solid #2563eb' : '1px solid var(--sh-border)',
                  background: period === p.value ? 'var(--sh-info-bg)' : 'var(--sh-surface)',
                  color: period === p.value ? 'var(--sh-info-text)' : 'var(--sh-slate-600)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error ? (
        <div
          style={{
            color: 'var(--sh-danger-text)',
            background: 'var(--sh-danger-bg)',
            border: '1px solid var(--sh-danger-border)',
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {loading && !activeUsers ? (
        <div style={{ ...SECTION_STYLE, color: 'var(--sh-subtext)', fontSize: 13 }}>
          Loading analytics data...
        </div>
      ) : null}

      {/* DAU / WAU / MAU */}
      {activeUsers ? (
        <section style={SECTION_STYLE}>
          <div
            style={{ fontSize: 14, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 14 }}
          >
            Active Users
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 14,
            }}
          >
            <KpiCard
              label="DAU"
              value={activeUsers.dau}
              subtitle="Last 24 hours"
              color="#2563eb"
              sparkData={activeUsers.dauTrend}
            />
            <KpiCard label="WAU" value={activeUsers.wau} subtitle="Last 7 days" color="#7c3aed" />
            <KpiCard label="MAU" value={activeUsers.mau} subtitle="Last 30 days" color="#059669" />
            <KpiCard
              label="Total Users"
              value={activeUsers.totalUsers}
              subtitle="All time"
              color="#475569"
            />
          </div>
        </section>
      ) : null}

      {/* User Growth Chart */}
      {userGrowth ? (
        <section style={SECTION_STYLE}>
          <div
            style={{ fontSize: 14, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 4 }}
          >
            New User Signups
          </div>
          <div style={{ fontSize: 11, color: 'var(--sh-subtext)', marginBottom: 14 }}>
            {userGrowth.activeUsers} new user{userGrowth.activeUsers !== 1 ? 's' : ''} in this
            period
          </div>
          <BarChart data={userGrowth.data} color="#6366f1" />
        </section>
      ) : null}

      {/* Engagement Trends */}
      {engagement ? (
        <section style={SECTION_STYLE}>
          <div
            style={{ fontSize: 14, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 4 }}
          >
            Engagement Trends
          </div>
          <div style={{ fontSize: 11, color: 'var(--sh-subtext)', marginBottom: 14 }}>
            Daily activity across posts, comments, stars, and reactions
          </div>
          <EngagementChart engagement={engagement} />
        </section>
      ) : null}

      {/* Content Creation Breakdown */}
      {contentData ? (
        <section style={SECTION_STYLE}>
          <div
            style={{ fontSize: 14, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 14 }}
          >
            Content Creation
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 16,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--sh-slate-600)',
                  marginBottom: 8,
                }}
              >
                Sheets
              </div>
              <BarChart data={contentData.sheets} color="#059669" height={80} />
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--sh-slate-600)',
                  marginBottom: 8,
                }}
              >
                Notes
              </div>
              <BarChart data={contentData.notes} color="#0f766e" height={80} />
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--sh-slate-600)',
                  marginBottom: 8,
                }}
              >
                Feed Posts
              </div>
              <BarChart data={contentData.feedPosts} color="#8b5cf6" height={80} />
            </div>
          </div>
        </section>
      ) : null}

      {/* Top Content Rankings */}
      {topContent ? (
        <section style={SECTION_STYLE}>
          <div
            style={{ fontSize: 14, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 4 }}
          >
            Content Performance Rankings
          </div>
          <div style={{ fontSize: 11, color: 'var(--sh-subtext)', marginBottom: 8 }}>
            All-time top performers across sheets, posts, and contributors
          </div>

          <RankTable
            title="Top Sheets by Stars"
            columns={[
              {
                key: 'title',
                label: 'Sheet',
                bold: true,
                render: (row) => (
                  <span>
                    <span style={{ color: 'var(--sh-heading)' }}>{row.title}</span>
                    {row.course ? (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          color: 'var(--sh-slate-500)',
                          fontWeight: 600,
                        }}
                      >
                        {row.course.code}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              { key: 'author', label: 'Author', render: (row) => row.author?.username || '\u2014' },
              { key: 'stars', label: 'Stars', align: 'right' },
              { key: 'forks', label: 'Forks', align: 'right' },
              { key: 'downloads', label: 'Downloads', align: 'right' },
            ]}
            rows={topContent.topSheets}
          />

          <RankTable
            title="Top Posts by Reactions"
            columns={[
              {
                key: 'preview',
                label: 'Post',
                bold: true,
                render: (row) => (
                  <span style={{ color: 'var(--sh-heading)' }}>
                    {row.preview || '(no text)'}
                    {row.preview && row.preview.length >= 120 ? '...' : ''}
                  </span>
                ),
              },
              { key: 'author', label: 'Author', render: (row) => row.author?.username || '\u2014' },
              { key: 'reactionCount', label: 'Reactions', align: 'right' },
            ]}
            rows={topContent.topPosts}
          />

          <RankTable
            title="Top Contributors"
            columns={[
              {
                key: 'username',
                label: 'User',
                bold: true,
                render: (row) => (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <UserAvatar user={row} size={22} />
                    <span style={{ color: 'var(--sh-heading)' }}>{row.username}</span>
                  </span>
                ),
              },
              { key: 'sheetCount', label: 'Sheets', align: 'right' },
              { key: 'totalStars', label: 'Stars', align: 'right' },
              { key: 'totalForks', label: 'Forks', align: 'right' },
            ]}
            rows={topContent.topContributors}
          />
        </section>
      ) : null}
    </div>
  )
}
