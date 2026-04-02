import { useState, useEffect } from 'react'
import {
  AreaChart, Area,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { FONT } from './adminConstants'

const CONTENT_COLORS = {
  sheets: '#059669',
  notes: '#0f766e',
  feedPosts: '#8b5cf6',
}

const MODERATION_STATUS_COLORS = {
  pending: '#f59e0b',
  approved: '#059669',
  rejected: '#dc2626',
  warning: '#f97316',
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i}
          style={{
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            borderRadius: 18,
            padding: 22,
            minHeight: 340,
            animation: 'pulse 2s infinite',
          }}
        >
          <div style={{ height: 20, background: 'var(--sh-slate-200)', borderRadius: 8, marginBottom: 12 }} />
          <div style={{ height: 240, background: 'var(--sh-slate-100)', borderRadius: 8 }} />
        </div>
      ))}
    </div>
  )
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div style={{
      background: 'var(--sh-surface)',
      border: '1px solid var(--sh-border)',
      borderRadius: 18,
      padding: '22px',
    }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--sh-heading)',
        }}>
          {title}
        </h3>
        {subtitle && (
          <div style={{
            fontSize: 12,
            color: 'var(--sh-subtext)',
            marginTop: 4,
          }}>
            {subtitle}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

export default function AnalyticsTab() {
  const [period, setPeriod] = useState('30d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({
    users: [],
    content: [],
    ai: [],
    moderation: [],
    overview: null,
  })

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true)
      setError(null)

      try {
        const periodParam = period === '7d' ? '7d' : period === '90d' ? '90d' : period === '1y' ? '1y' : '30d'

        const [usersRes, contentRes, aiRes, moderationRes, overviewRes] = await Promise.all([
          fetch(`${API}/api/admin/analytics/users?period=${periodParam}`, {
            credentials: 'include',
            headers: authHeaders(),
          }),
          fetch(`${API}/api/admin/analytics/content?period=${periodParam}`, {
            credentials: 'include',
            headers: authHeaders(),
          }),
          fetch(`${API}/api/admin/analytics/ai?period=${periodParam}`, {
            credentials: 'include',
            headers: authHeaders(),
          }),
          fetch(`${API}/api/admin/analytics/moderation?period=${periodParam}`, {
            credentials: 'include',
            headers: authHeaders(),
          }),
          fetch(`${API}/api/admin/analytics/overview?period=${periodParam}`, {
            credentials: 'include',
            headers: authHeaders(),
          }),
        ])

        if (!usersRes.ok || !contentRes.ok || !aiRes.ok || !moderationRes.ok || !overviewRes.ok) {
          throw new Error('Failed to fetch analytics data')
        }

        const [usersData, contentData, aiData, moderationData, overviewData] = await Promise.all([
          usersRes.json(),
          contentRes.json(),
          aiRes.json(),
          moderationRes.json(),
          overviewRes.json(),
        ])

        setData({
          users: usersData.data || [],
          content: contentData.data || [],
          ai: aiData.data || [],
          moderation: moderationData.data || [],
          overview: overviewData.data || null,
        })
      } catch (err) {
        setError(err.message || 'Error loading analytics')
      } finally {
        setLoading(false)
      }
    }

    void fetchAnalytics()
  }, [period])

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const contentBreakdown = data.overview ? [
    { name: 'Sheets', value: data.overview.totalSheets || 0, color: CONTENT_COLORS.sheets },
    { name: 'Notes', value: data.overview.totalNotes || 0, color: CONTENT_COLORS.notes },
    { name: 'Feed Posts', value: data.overview.totalFeedPosts || 0, color: CONTENT_COLORS.feedPosts },
  ] : []

  const moderationData = data.moderation.map((item) => ({
    ...item,
    color: MODERATION_STATUS_COLORS[item.status] || '#94a3b8',
  }))

  return (
    <section style={{
      background: 'var(--sh-surface)',
      borderRadius: 18,
      border: '1px solid var(--sh-border)',
      padding: '22px',
    }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: 'var(--sh-heading)', marginBottom: 12 }}>
          Analytics
        </h1>
        <div style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
        }}>
          {[
            { label: '7 Days', value: '7d' },
            { label: '30 Days', value: '30d' },
            { label: '90 Days', value: '90d' },
            { label: '1 Year', value: '1y' },
          ].map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeriod(value)}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: period === value ? '1px solid #2563eb' : '1px solid var(--sh-border)',
                background: period === value ? 'var(--sh-info-bg)' : 'var(--sh-surface)',
                color: period === value ? 'var(--sh-info-text)' : 'var(--sh-slate-600)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: FONT,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{
          color: 'var(--sh-danger-text)',
          background: 'var(--sh-danger-bg)',
          border: '1px solid var(--sh-danger-border)',
          borderRadius: 12,
          padding: '12px 14px',
          fontSize: 13,
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: 20,
        }}>
          {/* User Growth Chart */}
          {data.users.length > 0 && (
            <ChartCard title="User Growth" subtitle="Daily new signups">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={data.users}>
                  <defs>
                    <linearGradient id="colorNewUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--sh-border)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    stroke="var(--sh-subtext)"
                    style={{ fontSize: 12 }}
                  />
                  <YAxis stroke="var(--sh-subtext)" style={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--sh-surface)',
                      border: '1px solid var(--sh-border)',
                      borderRadius: 8,
                      padding: '8px 12px',
                    }}
                    labelStyle={{ color: 'var(--sh-heading)' }}
                    formatter={(value) => [value, 'New Users']}
                    labelFormatter={formatDate}
                  />
                  <Area type="monotone" dataKey="newUsers" stroke="#6366f1" fillOpacity={1} fill="url(#colorNewUsers)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Content Activity Chart */}
          {data.content.length > 0 && (
            <ChartCard title="Content Activity" subtitle="Daily content created">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.content}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--sh-border)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    stroke="var(--sh-subtext)"
                    style={{ fontSize: 12 }}
                  />
                  <YAxis stroke="var(--sh-subtext)" style={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--sh-surface)',
                      border: '1px solid var(--sh-border)',
                      borderRadius: 8,
                      padding: '8px 12px',
                    }}
                    labelStyle={{ color: 'var(--sh-heading)' }}
                    labelFormatter={formatDate}
                  />
                  <Legend />
                  <Bar dataKey="sheets" stackId="a" fill={CONTENT_COLORS.sheets} />
                  <Bar dataKey="notes" stackId="a" fill={CONTENT_COLORS.notes} />
                  <Bar dataKey="feedPosts" stackId="a" fill={CONTENT_COLORS.feedPosts} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* AI Usage Trend */}
          {data.ai.length > 0 && (
            <ChartCard title="AI Usage Trend" subtitle="Messages and unique users">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.ai}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--sh-border)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    stroke="var(--sh-subtext)"
                    style={{ fontSize: 12 }}
                  />
                  <YAxis stroke="var(--sh-subtext)" style={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--sh-surface)',
                      border: '1px solid var(--sh-border)',
                      borderRadius: 8,
                      padding: '8px 12px',
                    }}
                    labelStyle={{ color: 'var(--sh-heading)' }}
                    labelFormatter={formatDate}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="messageCount" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="uniqueUsers" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Moderation Funnel */}
          {moderationData.length > 0 && (
            <ChartCard title="Moderation Status" subtitle="Content by review status">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={moderationData} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--sh-border)" />
                  <XAxis type="number" stroke="var(--sh-subtext)" style={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="status" stroke="var(--sh-subtext)" style={{ fontSize: 12 }} width={90} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--sh-surface)',
                      border: '1px solid var(--sh-border)',
                      borderRadius: 8,
                      padding: '8px 12px',
                    }}
                    labelStyle={{ color: 'var(--sh-heading)' }}
                    formatter={(value) => [value, 'Count']}
                  />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 8, 8, 0]}>
                    {moderationData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Content Breakdown */}
          {contentBreakdown.length > 0 && (
            <ChartCard title="Content Breakdown" subtitle="Total by type">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={contentBreakdown}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {contentBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'var(--sh-surface)',
                      border: '1px solid var(--sh-border)',
                      borderRadius: 8,
                      padding: '8px 12px',
                    }}
                    labelStyle={{ color: 'var(--sh-heading)' }}
                    formatter={(value) => [value, 'Count']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      )}
    </section>
  )
}
