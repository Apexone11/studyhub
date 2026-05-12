/**
 * SecurityTab — Admin security monitoring dashboard.
 *
 * Shows a snapshot of security-relevant metrics: locked accounts,
 * failed login attempts, pending reviews, recent audit actions.
 * Admins can manually unlock accounts from this tab.
 *
 * Endpoint: GET /api/admin/security/stats
 */
import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'
import { authHeaders, FONT } from './adminConstants'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { showToast } from '../../lib/toast'
import { Skeleton } from '../../components/Skeleton'
import { IconShield, IconLock } from '../../components/Icons'

export default function SecurityTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadStats = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/admin/security/stats`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      const json = await readJsonSafely(res, {})
      if (!res.ok) throw new Error(getApiErrorMessage(json, 'Could not load security stats.'))
      setData(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    Promise.resolve().then(loadStats)
  }, [loadStats])

  async function handleUnlock(userId, username) {
    if (!window.confirm(`Unlock the account for ${username}?`)) return
    try {
      const res = await fetch(`${API}/api/admin/security/unlock/${userId}`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Could not unlock.')
      showToast(`${username} unlocked.`, 'success')
      void loadStats()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  if (loading)
    return (
      <section
        style={{ fontFamily: FONT, display: 'grid', gap: 14, padding: 8 }}
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">Loading security stats…</span>
        <Skeleton width="40%" height={20} borderRadius={6} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={80} borderRadius={12} />
          ))}
        </div>
        <Skeleton width="100%" height={140} borderRadius={12} />
      </section>
    )
  if (error)
    return (
      <div
        role="alert"
        style={{
          padding: '16px 18px',
          borderRadius: 12,
          background: 'var(--sh-danger-bg)',
          border: '1px solid var(--sh-danger-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          fontFamily: FONT,
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--sh-danger-text)',
              marginBottom: 4,
            }}
          >
            We could not load security stats.
          </div>
          <div style={{ fontSize: 13, color: 'var(--sh-danger-text)', opacity: 0.85 }}>{error}</div>
        </div>
        <button
          type="button"
          onClick={loadStats}
          style={{
            background: 'var(--sh-brand)',
            color: 'var(--sh-btn-primary-text)',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: FONT,
          }}
        >
          Try again
        </button>
      </div>
    )
  if (!data) return null

  const o = data.overview || {}

  return (
    <section style={{ fontFamily: FONT, display: 'grid', gap: 18 }}>
      <h2
        style={{
          margin: 0,
          fontSize: 18,
          fontWeight: 800,
          color: 'var(--sh-heading)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <IconShield size={18} style={{ color: 'var(--sh-brand)' }} />
        Security Overview
      </h2>

      {/* Stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
        }}
      >
        <StatCard label="Total Users" value={o.totalUsers} color="var(--sh-brand)" />
        <StatCard label="Locked Accounts" value={o.lockedAccounts} color="var(--sh-danger)" />
        <StatCard
          label="Failed Login Users"
          value={o.failedAttemptUsers}
          color="var(--sh-warning)"
        />
        <StatCard label="Signups (24h)" value={o.recentSignups24h} color="var(--sh-success)" />
        <StatCard label="Signups (7d)" value={o.recentSignups7d} color="var(--sh-info)" />
        <StatCard
          label="Pending Sheet Reviews"
          value={o.pendingSheetReviews}
          color="var(--sh-warning)"
        />
        <StatCard
          label="Pending Group Reports"
          value={o.pendingGroupReports}
          color="var(--sh-danger)"
        />
        <StatCard
          label="Waitlist (waiting)"
          value={o.pendingWaitlist}
          color="var(--sh-brand-accent)"
        />
        <StatCard
          label="Audit Actions (24h)"
          value={o.groupAuditActions24h}
          color="var(--sh-muted)"
        />
      </div>

      {/* Failed login accounts */}
      <div
        style={{
          background: 'var(--sh-surface)',
          borderRadius: 14,
          border: '1px solid var(--sh-border)',
          padding: '16px 18px',
        }}
      >
        <h3
          style={{
            margin: '0 0 12px',
            fontSize: 14,
            fontWeight: 800,
            color: 'var(--sh-heading)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <IconLock size={14} style={{ color: 'var(--sh-danger)' }} />
          Accounts with Failed Login Attempts
        </h3>
        {!data.recentFailedAccounts || data.recentFailedAccounts.length === 0 ? (
          <div style={{ color: 'var(--sh-muted)', fontSize: 13, fontStyle: 'italic' }}>
            No accounts with failed attempts right now.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Username', 'Failed Attempts', 'Locked', 'Last Attempt', 'Action'].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        padding: '6px 10px',
                        borderBottom: '2px solid var(--sh-border)',
                        color: 'var(--sh-muted)',
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recentFailedAccounts.map((u) => (
                  <tr key={u.id}>
                    <td style={cellStyle}>{u.username}</td>
                    <td style={cellStyle}>
                      <span
                        style={{
                          color: u.failedAttempts >= 5 ? 'var(--sh-danger)' : 'var(--sh-warning)',
                          fontWeight: 700,
                        }}
                      >
                        {u.failedAttempts}
                      </span>
                    </td>
                    <td style={cellStyle}>
                      {u.locked ? (
                        <span style={{ color: 'var(--sh-danger)', fontWeight: 700 }}>Yes</span>
                      ) : (
                        <span style={{ color: 'var(--sh-muted)' }}>No</span>
                      )}
                    </td>
                    <td style={cellStyle}>
                      {u.lastAttempt ? new Date(u.lastAttempt).toLocaleString() : '—'}
                    </td>
                    <td style={cellStyle}>
                      {u.locked || u.failedAttempts > 0 ? (
                        <button
                          onClick={() => handleUnlock(u.id, u.username)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--sh-success-border)',
                            background: 'var(--sh-success-bg)',
                            color: 'var(--sh-success-text)',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Unlock
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 12,
        background: 'var(--sh-soft)',
        border: '1px solid var(--sh-border)',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--sh-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.3px',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>{value ?? 0}</div>
    </div>
  )
}

const cellStyle = {
  padding: '6px 10px',
  borderBottom: '1px solid var(--sh-soft)',
  color: 'var(--sh-heading)',
}
