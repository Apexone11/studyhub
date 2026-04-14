/**
 * ActivationTab -- Admin activation funnel dashboard.
 *
 * Shows onboarding funnel visualization, activation metrics,
 * and weekly cohort breakdown.
 * Endpoint: GET /api/admin/activation-funnel?period=30d
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
        minWidth: 160,
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

function FunnelBar({ label, count, total, isWorst }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
      <div
        style={{
          width: 140,
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--sh-heading)',
          flexShrink: 0,
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          background: 'var(--sh-soft)',
          borderRadius: 8,
          height: 28,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.max(pct, 2)}%`,
            height: '100%',
            borderRadius: 8,
            background: isWorst ? 'var(--sh-warning)' : 'var(--sh-brand)',
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      <div
        style={{
          width: 100,
          fontSize: 13,
          fontWeight: 700,
          color: isWorst ? 'var(--sh-warning)' : 'var(--sh-heading)',
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {count.toLocaleString()} ({pct.toFixed(1)}%)
      </div>
    </div>
  )
}

export default function ActivationTab() {
  const [period, setPeriod] = useState('30d')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async (p) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/admin/activation-funnel?period=${p}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      const json = await readJsonSafely(res, {})
      if (!res.ok) throw new Error(getApiErrorMessage(json, 'Could not load activation data.'))
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: 28,
                borderRadius: 8,
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

  const funnel = data?.funnel || []
  const cohorts = data?.cohorts || []
  const activationRate = data?.activationRate ?? null
  const medianTimeToFirstSheet = data?.medianTimeToFirstSheetMinutes ?? null
  const totalBase = funnel.length > 0 ? funnel[0].count : 0

  // Find biggest drop-off step
  let worstDropIdx = -1
  let worstDrop = 0
  for (let i = 1; i < funnel.length; i++) {
    const prev = funnel[i - 1].count || 1
    const drop = prev > 0 ? ((prev - funnel[i].count) / prev) * 100 : 0
    if (drop > worstDrop) {
      worstDrop = drop
      worstDropIdx = i
    }
  }

  const isEmpty = funnel.length === 0 && cohorts.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Period filter */}
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
          Activation Funnel
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
            No onboarding data yet.
          </div>
        </section>
      ) : (
        <>
          {/* Metric cards */}
          <section style={SECTION}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <MetricCard
                label="Activation Rate"
                value={activationRate !== null ? `${activationRate.toFixed(1)}%` : '--'}
                sub={`In the last ${period}`}
                color="var(--sh-success)"
              />
              <MetricCard
                label="Median Time to First Sheet"
                value={
                  medianTimeToFirstSheet !== null ? `${medianTimeToFirstSheet.toFixed(0)}m` : '--'
                }
                sub="Minutes from signup to first upload"
                color="var(--sh-brand)"
              />
            </div>
          </section>

          {/* Funnel visualization */}
          {funnel.length > 0 ? (
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
                Funnel Steps
              </h3>
              <div>
                {funnel.map((step, i) => (
                  <FunnelBar
                    key={step.label || i}
                    label={step.label}
                    count={step.count}
                    total={totalBase}
                    isWorst={i === worstDropIdx}
                  />
                ))}
              </div>
              {worstDropIdx >= 0 ? (
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 12,
                    color: 'var(--sh-warning)',
                    fontWeight: 600,
                  }}
                >
                  Largest drop-off: {funnel[worstDropIdx]?.label} ({worstDrop.toFixed(1)}% lost from
                  previous step)
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Cohort table */}
          {cohorts.length > 0 ? (
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
                Weekly Cohorts
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
                      <th style={tableHeadStyle}>Signups</th>
                      <th style={tableHeadStyle}>Activated</th>
                      <th style={tableHeadStyle}>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.map((c) => {
                      const rate =
                        c.signups > 0 ? ((c.activated / c.signups) * 100).toFixed(1) : '0.0'
                      return (
                        <tr key={c.week}>
                          <td style={{ ...tableCell, fontWeight: 700, color: 'var(--sh-heading)' }}>
                            {c.week}
                          </td>
                          <td style={tableCell}>{c.signups}</td>
                          <td style={tableCell}>{c.activated}</td>
                          <td style={tableCell}>
                            <span
                              style={{
                                fontWeight: 700,
                                color:
                                  parseFloat(rate) >= 50
                                    ? 'var(--sh-success)'
                                    : parseFloat(rate) >= 25
                                      ? 'var(--sh-warning)'
                                      : 'var(--sh-danger)',
                              }}
                            >
                              {rate}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
