import { useCallback, useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts'
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
  borderRadius: 14,
  border: '1px solid var(--sh-border)',
  padding: '28px',
  boxShadow: '0 1px 3px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.02)',
}

const SECTION_HEADING = {
  fontSize: 18,
  fontWeight: 800,
  color: 'var(--sh-heading)',
  marginBottom: 4,
  lineHeight: 1.3,
}

const SECTION_DESC = {
  fontSize: 12,
  color: 'var(--sh-subtext)',
  marginBottom: 18,
  lineHeight: 1.5,
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

const CHART_COLORS = {
  brand: '#6366f1',
  blue: '#2563eb',
  amber: '#f59e0b',
  pink: '#ec4899',
  green: '#10b981',
  slate: '#64748b',
}

const PIE_LABEL = ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 8,
    fontFamily: FONT,
    fontSize: 13,
  },
}

/* -- KPI Card ----------------------------------------------------------- */

const KPI_ACCENTS = {
  '#2563eb': { bg: 'rgba(37,99,235,.06)', border: 'rgba(37,99,235,.15)' },
  '#7c3aed': { bg: 'rgba(124,58,237,.06)', border: 'rgba(124,58,237,.15)' },
  '#059669': { bg: 'rgba(5,150,105,.06)', border: 'rgba(5,150,105,.15)' },
  '#475569': { bg: 'rgba(71,85,105,.05)', border: 'rgba(71,85,105,.12)' },
}

function KpiCard({ label, value, subtitle, color = '#2563eb', sparkData }) {
  const accent = KPI_ACCENTS[color] || { bg: 'var(--sh-soft)', border: 'var(--sh-border)' }
  return (
    <div
      style={{
        background: accent.bg,
        borderRadius: 14,
        border: `1px solid ${accent.border}`,
        padding: '22px 22px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'box-shadow .15s ease',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--sh-slate-500)',
          letterSpacing: '.08em',
        }}
      >
        {label.toUpperCase()}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
        <div
          style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-.02em' }}
        >
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        {sparkData?.length > 1 && (
          <ResponsiveContainer width={120} height={32}>
            <LineChart data={sparkData}>
              <Line
                type="monotone"
                dataKey="count"
                stroke={color || CHART_COLORS.brand}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {subtitle ? (
        <div style={{ fontSize: 12, color: 'var(--sh-slate-500)', fontWeight: 500 }}>
          {subtitle}
        </div>
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
          style={{ fontSize: 15, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 12 }}
        >
          {title}
        </div>
        <div style={{ color: 'var(--sh-muted)', fontSize: 12 }}>No data yet</div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 12 }}>
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

/* -- Helper: merge engagement arrays into single dataset ---------------- */

function mergeEngagementData(engagement) {
  const dateMap = new Map()
  const keys = ['posts', 'comments', 'stars', 'reactions']
  for (const key of keys) {
    for (const point of engagement[key] || []) {
      if (!dateMap.has(point.date)) dateMap.set(point.date, { date: point.date })
      dateMap.get(point.date)[key] = point.count
    }
  }
  return [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/* -- Helper: build content distribution pie data ------------------------ */

function buildContentPieData(contentData) {
  if (!contentData) return []
  const sum = (arr) => (arr || []).reduce((s, d) => s + (d.count || 0), 0)
  return [
    { name: 'Sheets', value: sum(contentData.sheets) },
    { name: 'Notes', value: sum(contentData.notes) },
    { name: 'Feed Posts', value: sum(contentData.feedPosts) },
  ].filter((d) => d.value > 0)
}

/* -- Pie chart card wrapper --------------------------------------------- */

const PIE_COLORS = [
  CHART_COLORS.brand,
  CHART_COLORS.blue,
  CHART_COLORS.amber,
  CHART_COLORS.pink,
  CHART_COLORS.green,
  CHART_COLORS.slate,
]

function PieCard({ title, data }) {
  if (!data || data.length === 0) {
    return (
      <div
        style={{
          background: 'var(--sh-surface)',
          borderRadius: 12,
          padding: 20,
          border: '1px solid var(--sh-border)',
        }}
      >
        <div
          style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 12 }}
        >
          {title}
        </div>
        <div style={{ color: 'var(--sh-muted)', fontSize: 12 }}>No data yet</div>
      </div>
    )
  }

  return (
    <div
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 12,
        padding: 20,
        border: '1px solid var(--sh-border)',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 12 }}>
        {title}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={70}
            label={PIE_LABEL}
            labelLine={false}
            fontSize={11}
            fontFamily={FONT}
          >
            {data.map((_, idx) => (
              <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip {...TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12, fontFamily: FONT }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

/* -- No-data placeholder ------------------------------------------------ */

function NoChartData({ height = 120 }) {
  return (
    <div
      style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--sh-muted)',
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      No data for this period
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
  const [userRoles, setUserRoles] = useState(null)
  const [engagementTotals, setEngagementTotals] = useState(null)

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

      /* Pie chart data -- fetched alongside, failures are non-critical */
      fetch(`${API}/api/admin/analytics/user-roles`, { credentials: 'include' })
        .then((r) => r.json())
        .then(setUserRoles)
        .catch(() => {})
      fetch(`${API}/api/admin/analytics/engagement-totals?period=${p}`, { credentials: 'include' })
        .then((r) => r.json())
        .then(setEngagementTotals)
        .catch(() => {})
    } catch (err) {
      setError(err.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAnalytics(period)
  }, [period, fetchAnalytics])

  /* Derived data for pie charts */
  const contentPieData = buildContentPieData(contentData)
  const rolePieData = userRoles?.roles || []
  const engagementPieData = engagementTotals?.totals
    ? Object.entries(engagementTotals.totals)
        .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
        .filter((d) => d.value > 0)
    : []

  /* Merged engagement data for grouped bar chart */
  const engagementChartData = engagement ? mergeEngagementData(engagement) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header + Period Selector */}
      <section style={SECTION_STYLE}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 14,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 800,
                color: 'var(--sh-heading)',
                letterSpacing: '-.01em',
              }}
            >
              Analytics
            </h1>
            <div
              style={{ fontSize: 13, color: 'var(--sh-subtext)', marginTop: 4, lineHeight: 1.5 }}
            >
              Platform performance metrics and engagement data
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 4,
              background: 'var(--sh-soft)',
              borderRadius: 10,
              padding: 3,
            }}
          >
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                style={{
                  padding: '7px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: period === p.value ? 'var(--sh-brand)' : 'transparent',
                  color: period === p.value ? '#fff' : 'var(--sh-text)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background .15s ease, color .15s ease',
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
          <div style={SECTION_HEADING}>Active Users</div>
          <div style={SECTION_DESC}>Real-time platform user activity across time windows</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 16,
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

      {/* Pie Charts */}
      {(contentPieData.length > 0 || rolePieData.length > 0 || engagementPieData.length > 0) && (
        <section style={SECTION_STYLE}>
          <div style={SECTION_HEADING}>Distribution Overview</div>
          <div style={SECTION_DESC}>
            Content, user roles, and engagement breakdown for this period
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            <PieCard title="Content Distribution" data={contentPieData} />
            <PieCard title="User Roles" data={rolePieData} />
            <PieCard title="Engagement Breakdown" data={engagementPieData} />
          </div>
        </section>
      )}

      {/* User Growth Chart */}
      {userGrowth ? (
        <section style={SECTION_STYLE}>
          <div style={SECTION_HEADING}>New User Signups</div>
          <div style={SECTION_DESC}>
            {userGrowth.activeUsers} new user{userGrowth.activeUsers !== 1 ? 's' : ''} in this
            period
          </div>
          {!userGrowth.data || userGrowth.data.length === 0 ? (
            <NoChartData />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={userGrowth.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sh-border)" opacity={0.6} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fontFamily: FONT, fill: '#64748b' }}
                  angle={-35}
                  textAnchor="end"
                  height={50}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 11, fontFamily: FONT, fill: '#64748b' }}
                  allowDecimals={false}
                />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar
                  dataKey="count"
                  fill={CHART_COLORS.brand}
                  radius={[4, 4, 0, 0]}
                  name="Signups"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      ) : null}

      {/* Engagement Trends */}
      {engagement ? (
        <section style={SECTION_STYLE}>
          <div style={SECTION_HEADING}>Engagement Trends</div>
          <div style={SECTION_DESC}>
            Daily activity across posts, comments, stars, and reactions
          </div>
          {engagementChartData.length === 0 ? (
            <NoChartData height={140} />
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={engagementChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sh-border)" opacity={0.6} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fontFamily: FONT, fill: '#64748b' }}
                  angle={-35}
                  textAnchor="end"
                  height={50}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 11, fontFamily: FONT, fill: '#64748b' }}
                  allowDecimals={false}
                />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: FONT }} />
                <Bar dataKey="posts" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Posts" />
                <Bar
                  dataKey="comments"
                  fill={CHART_COLORS.blue}
                  radius={[4, 4, 0, 0]}
                  name="Comments"
                />
                <Bar dataKey="stars" fill={CHART_COLORS.amber} radius={[4, 4, 0, 0]} name="Stars" />
                <Bar
                  dataKey="reactions"
                  fill={CHART_COLORS.pink}
                  radius={[4, 4, 0, 0]}
                  name="Reactions"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      ) : null}

      {/* Content Creation Breakdown */}
      {contentData ? (
        <section style={SECTION_STYLE}>
          <div style={SECTION_HEADING}>Content Creation</div>
          <div style={SECTION_DESC}>Breakdown of new sheets, notes, and feed posts over time</div>
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
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--sh-heading)',
                  marginBottom: 10,
                }}
              >
                Sheets
              </div>
              {!contentData.sheets || contentData.sheets.length === 0 ? (
                <NoChartData height={200} />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={contentData.sheets}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--sh-border)" opacity={0.6} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={(v) => v.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Bar
                      dataKey="count"
                      fill={CHART_COLORS.green}
                      radius={[3, 3, 0, 0]}
                      name="Sheets"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--sh-heading)',
                  marginBottom: 10,
                }}
              >
                Notes
              </div>
              {!contentData.notes || contentData.notes.length === 0 ? (
                <NoChartData height={200} />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={contentData.notes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--sh-border)" opacity={0.6} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={(v) => v.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Bar dataKey="count" fill="#0f766e" radius={[3, 3, 0, 0]} name="Notes" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--sh-heading)',
                  marginBottom: 10,
                }}
              >
                Feed Posts
              </div>
              {!contentData.feedPosts || contentData.feedPosts.length === 0 ? (
                <NoChartData height={200} />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={contentData.feedPosts}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--sh-border)" opacity={0.6} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={(v) => v.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[3, 3, 0, 0]} name="Feed Posts" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* Top Content Rankings */}
      {topContent ? (
        <section style={SECTION_STYLE}>
          <div style={SECTION_HEADING}>Content Performance Rankings</div>
          <div style={SECTION_DESC}>
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
