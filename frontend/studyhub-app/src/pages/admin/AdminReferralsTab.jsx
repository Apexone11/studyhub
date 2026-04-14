/**
 * AdminReferralsTab -- Admin referral analytics dashboard.
 *
 * Shows referral metrics, channel breakdown, K-factor trend,
 * top inviters, and rewards count.
 * Endpoint: GET /api/admin/referral-stats?period=30d
 */
import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'
import { authHeaders, FONT, filterSelectStyle, tableHeadStyle, tableCell } from './adminConstants'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'

const SECTION = {
  background: 'var(--sh-surface)',
  borderRadius: 18,
  border: '1px solid var(--sh-border)',
  padding: '22px',
}

const PERIODS = [
  ['7d', '7 days'],
  ['30d', '30 days'],
  ['90d', '90 days'],
]

function MetricCard({ label, value, sub, color }) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 140,
        background: 'var(--sh-soft)',
        borderRadius: 14,
        border: '1px solid var(--sh-border)',
        padding: '18px 20px',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sh-muted)', marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          color: color || 'var(--sh-heading)',
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      {sub ? (
        <div style={{ fontSize: 11, color: 'var(--sh-subtext)', marginTop: 4 }}>{sub}</div>
      ) : null}
    </div>
  )
}

function ChannelBar({ label, sent, accepted, maxVal }) {
  const sentPct = maxVal > 0 ? (sent / maxVal) * 100 : 0
  const acceptedPct = maxVal > 0 ? (accepted / maxVal) * 100 : 0
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-heading)' }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
          {sent} sent / {accepted} accepted
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          height: 22,
          background: 'var(--sh-soft)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${Math.max(sentPct, 1)}%`,
            background: 'var(--sh-info-bg)',
            border: '1px solid var(--sh-info-border)',
            borderRadius: 6,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${Math.max(acceptedPct, 0.5)}%`,
            background: 'var(--sh-brand)',
            borderRadius: 6,
            opacity: 0.85,
          }}
        />
      </div>
    </div>
  )
}

export default function AdminReferralsTab() {
  const [period, setPeriod] = useState('30d')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async (p) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/admin/referral-stats?period=${p}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      const json = await readJsonSafely(res, {})
      if (!res.ok) throw new Error(getApiErrorMessage(json, 'Could not load referral stats.'))
      setData(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(period)
  }, [loadData, period])

  if (loading) {
    return (
      <section style={SECTION}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                flex: '1 1 0',
                minWidth: 140,
                height: 80,
                borderRadius: 14,
                background: 'var(--sh-soft)',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section style={SECTION}>
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
      </section>
    )
  }

  if (!data) return null

  const totalSent = data.totalSent ?? 0
  const totalAccepted = data.totalAccepted ?? 0
  const acceptanceRate = data.acceptanceRate ?? 0
  const kFactor = data.kFactor ?? 0
  const channels = data.channels || []
  const kFactorTrend = data.kFactorTrend || []
  const topInviters = data.topInviters || []
  const rewardsGranted = data.rewardsGranted ?? 0

  const isEmpty = totalSent === 0 && topInviters.length === 0

  const channelMax = channels.reduce((m, c) => Math.max(m, c.sent || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header + filter */}
      <section
        style={{ ...SECTION, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 800,
            color: 'var(--sh-heading)',
            fontFamily: FONT,
          }}
        >
          Referral Analytics
        </h3>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          style={filterSelectStyle}
        >
          {PERIODS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </section>

      {isEmpty ? (
        <section style={SECTION}>
          <div
            style={{
              color: 'var(--sh-muted)',
              fontSize: 13,
              fontStyle: 'italic',
              textAlign: 'center',
              padding: 32,
            }}
          >
            No referral data yet.
          </div>
        </section>
      ) : (
        <>
          {/* Metric cards */}
          <section style={SECTION}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <MetricCard
                label="Total Sent"
                value={totalSent.toLocaleString()}
                color="var(--sh-brand)"
              />
              <MetricCard
                label="Total Accepted"
                value={totalAccepted.toLocaleString()}
                color="var(--sh-success)"
              />
              <MetricCard
                label="Acceptance Rate"
                value={`${acceptanceRate.toFixed(1)}%`}
                color={acceptanceRate >= 30 ? 'var(--sh-success)' : 'var(--sh-warning)'}
              />
              <MetricCard
                label="K-Factor"
                value={kFactor.toFixed(2)}
                sub={kFactor >= 1 ? 'Viral growth' : 'Sub-viral'}
                color={kFactor >= 1 ? 'var(--sh-success)' : 'var(--sh-heading)'}
              />
            </div>
          </section>

          {/* Channel breakdown */}
          {channels.length > 0 ? (
            <section style={SECTION}>
              <h3
                style={{
                  margin: '0 0 16px',
                  fontSize: 14,
                  fontWeight: 800,
                  color: 'var(--sh-heading)',
                  fontFamily: FONT,
                }}
              >
                Channel Breakdown
              </h3>
              <div
                style={{
                  marginBottom: 8,
                  display: 'flex',
                  gap: 16,
                  fontSize: 11,
                  color: 'var(--sh-muted)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: 'var(--sh-info-bg)',
                      border: '1px solid var(--sh-info-border)',
                      display: 'inline-block',
                    }}
                  />
                  Sent
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: 'var(--sh-brand)',
                      display: 'inline-block',
                    }}
                  />
                  Accepted
                </span>
              </div>
              {channels.map((ch) => (
                <ChannelBar
                  key={ch.channel}
                  label={ch.channel}
                  sent={ch.sent || 0}
                  accepted={ch.accepted || 0}
                  maxVal={channelMax}
                />
              ))}
            </section>
          ) : null}

          {/* K-factor trend */}
          {kFactorTrend.length > 0 ? (
            <section style={SECTION}>
              <h3
                style={{
                  margin: '0 0 16px',
                  fontSize: 14,
                  fontWeight: 800,
                  color: 'var(--sh-heading)',
                  fontFamily: FONT,
                }}
              >
                K-Factor Trend (Weekly)
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 13,
                    fontFamily: FONT,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={tableHeadStyle}>Week</th>
                      <th style={tableHeadStyle}>K-Factor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kFactorTrend.map((row) => (
                      <tr key={row.week}>
                        <td style={{ ...tableCell, fontWeight: 700, color: 'var(--sh-heading)' }}>
                          {row.week}
                        </td>
                        <td style={tableCell}>
                          <span
                            style={{
                              fontWeight: 700,
                              color: row.value >= 1 ? 'var(--sh-success)' : 'var(--sh-heading)',
                            }}
                          >
                            {row.value.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* Top inviters */}
          {topInviters.length > 0 ? (
            <section style={SECTION}>
              <h3
                style={{
                  margin: '0 0 16px',
                  fontSize: 14,
                  fontWeight: 800,
                  color: 'var(--sh-heading)',
                  fontFamily: FONT,
                }}
              >
                Top Inviters
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 13,
                    fontFamily: FONT,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={tableHeadStyle}>Username</th>
                      <th style={tableHeadStyle}>Sent</th>
                      <th style={tableHeadStyle}>Accepted</th>
                      <th style={tableHeadStyle}>Rate</th>
                      <th style={tableHeadStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topInviters.map((inv) => {
                      const rate =
                        inv.sent > 0 ? ((inv.accepted / inv.sent) * 100).toFixed(1) : '0.0'
                      return (
                        <tr key={inv.userId || inv.username}>
                          <td style={{ ...tableCell, fontWeight: 700, color: 'var(--sh-heading)' }}>
                            {inv.username}
                          </td>
                          <td style={tableCell}>{inv.sent}</td>
                          <td style={tableCell}>{inv.accepted}</td>
                          <td style={tableCell}>{rate}%</td>
                          <td style={tableCell}>
                            {inv.flagged ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '3px 10px',
                                  borderRadius: 999,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  background: 'var(--sh-warning-bg)',
                                  border: '1px solid var(--sh-warning-border)',
                                  color: 'var(--sh-warning-text)',
                                }}
                              >
                                Flagged
                              </span>
                            ) : (
                              <span style={{ color: 'var(--sh-muted)', fontSize: 12 }}>--</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* Rewards count */}
          <section style={SECTION}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-muted)' }}>
                Total Rewards Granted:
              </span>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--sh-heading)' }}>
                {rewardsGranted.toLocaleString()}
              </span>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
