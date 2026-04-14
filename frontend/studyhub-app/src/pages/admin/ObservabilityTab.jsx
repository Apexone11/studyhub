/**
 * ObservabilityTab -- Admin observability dashboard.
 *
 * Shows route-level performance stats, AI TTFT metrics,
 * and Core Web Vitals.
 * Endpoint: GET /api/admin/observability/summary?period=24h
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
  ['24h', '24 hours'],
  ['7d', '7 days'],
]

/** Color a latency value based on threshold. */
function latencyColor(ms, warnThreshold) {
  if (ms == null) return 'var(--sh-muted)'
  return ms > warnThreshold ? 'var(--sh-warning)' : 'var(--sh-heading)'
}

/** Color an error rate value. */
function errorRateColor(rate) {
  if (rate == null) return 'var(--sh-muted)'
  return rate > 2 ? 'var(--sh-danger)' : 'var(--sh-heading)'
}

/** Core Web Vital color by metric thresholds. */
function vitalColor(metric, value) {
  if (value == null) return 'var(--sh-muted)'
  const thresholds = {
    LCP: { good: 2500, poor: 4000 },
    INP: { good: 200, poor: 500 },
    CLS: { good: 0.1, poor: 0.25 },
  }
  const t = thresholds[metric]
  if (!t) return 'var(--sh-heading)'
  if (value <= t.good) return 'var(--sh-success)'
  if (value > t.poor) return 'var(--sh-danger)'
  return 'var(--sh-warning)'
}

function VitalRow({ metric, p50, p95, unit }) {
  const fmt = (v) => {
    if (v == null) return 'No data'
    return unit === 'ms' ? `${v.toFixed(0)}ms` : v.toFixed(3)
  }
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '10px 0',
        borderBottom: '1px solid var(--sh-soft)',
      }}
    >
      <div style={{ width: 60, fontSize: 14, fontWeight: 800, color: 'var(--sh-heading)' }}>
        {metric}
      </div>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 12, color: 'var(--sh-muted)', marginRight: 6 }}>p50</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: vitalColor(metric, p50) }}>
          {fmt(p50)}
        </span>
      </div>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 12, color: 'var(--sh-muted)', marginRight: 6 }}>p95</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: vitalColor(metric, p95) }}>
          {fmt(p95)}
        </span>
      </div>
    </div>
  )
}

export default function ObservabilityTab() {
  const [period, setPeriod] = useState('24h')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async (p) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/admin/observability/summary?period=${p}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      const json = await readJsonSafely(res, {})
      if (!res.ok) throw new Error(getApiErrorMessage(json, 'Could not load observability data.'))
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
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                height: 24,
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

  if (!data) return null

  const routes = data.routes || []
  const aiTtft = data.aiTtft || null
  const webVitals = data.webVitals || null

  const isEmpty = routes.length === 0 && !aiTtft && !webVitals

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
          Observability
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
            No observability data yet.
          </div>
        </section>
      ) : (
        <>
          {/* Route group table */}
          {routes.length > 0 ? (
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
                Route Performance
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
                      <th style={tableHeadStyle}>Group</th>
                      <th style={tableHeadStyle}>Requests</th>
                      <th style={tableHeadStyle}>p50ms</th>
                      <th style={tableHeadStyle}>p95ms</th>
                      <th style={tableHeadStyle}>p99ms</th>
                      <th style={tableHeadStyle}>Error Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routes.map((r) => (
                      <tr key={r.group}>
                        <td style={{ ...tableCell, fontWeight: 700, color: 'var(--sh-heading)' }}>
                          {r.group}
                        </td>
                        <td style={tableCell}>{(r.requests ?? 0).toLocaleString()}</td>
                        <td style={{ ...tableCell, color: latencyColor(r.p50, 350) }}>
                          {r.p50 != null ? `${r.p50.toFixed(0)}` : '--'}
                        </td>
                        <td
                          style={{ ...tableCell, fontWeight: 700, color: latencyColor(r.p95, 350) }}
                        >
                          {r.p95 != null ? `${r.p95.toFixed(0)}` : '--'}
                        </td>
                        <td style={{ ...tableCell, color: latencyColor(r.p99, 500) }}>
                          {r.p99 != null ? `${r.p99.toFixed(0)}` : '--'}
                        </td>
                        <td
                          style={{
                            ...tableCell,
                            fontWeight: 700,
                            color: errorRateColor(r.errorRate),
                          }}
                        >
                          {r.errorRate != null ? `${r.errorRate.toFixed(2)}%` : '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* AI TTFT card */}
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
              AI Time-to-First-Token
            </h3>
            {aiTtft ? (
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginBottom: 4 }}>p50</div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: aiTtft.p50 != null ? 'var(--sh-heading)' : 'var(--sh-muted)',
                    }}
                  >
                    {aiTtft.p50 != null ? `${aiTtft.p50.toFixed(0)}ms` : 'No data'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginBottom: 4 }}>p95</div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: aiTtft.p95 != null ? 'var(--sh-heading)' : 'var(--sh-muted)',
                    }}
                  >
                    {aiTtft.p95 != null ? `${aiTtft.p95.toFixed(0)}ms` : 'No data'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginBottom: 4 }}>
                    Samples
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sh-heading)' }}>
                    {(aiTtft.sampleCount ?? 0).toLocaleString()}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--sh-muted)', fontSize: 13, fontStyle: 'italic' }}>
                No AI TTFT data available.
              </div>
            )}
          </section>

          {/* Web Vitals card */}
          <section style={SECTION}>
            <h3
              style={{
                margin: '0 0 12px',
                fontSize: 14,
                fontWeight: 800,
                color: 'var(--sh-heading)',
                fontFamily: FONT,
              }}
            >
              Core Web Vitals
            </h3>
            {webVitals ? (
              <div>
                <div
                  style={{
                    display: 'flex',
                    gap: 16,
                    marginBottom: 8,
                    fontSize: 11,
                    color: 'var(--sh-muted)',
                  }}
                >
                  <span>Good = green</span>
                  <span>Needs improvement = yellow</span>
                  <span>Poor = red</span>
                </div>
                <VitalRow
                  metric="LCP"
                  p50={webVitals.lcp?.p50 ?? null}
                  p95={webVitals.lcp?.p95 ?? null}
                  unit="ms"
                />
                <VitalRow
                  metric="INP"
                  p50={webVitals.inp?.p50 ?? null}
                  p95={webVitals.inp?.p95 ?? null}
                  unit="ms"
                />
                <VitalRow
                  metric="CLS"
                  p50={webVitals.cls?.p50 ?? null}
                  p95={webVitals.cls?.p95 ?? null}
                  unit=""
                />
              </div>
            ) : (
              <div style={{ color: 'var(--sh-muted)', fontSize: 13, fontStyle: 'italic' }}>
                No Web Vitals data available.
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
