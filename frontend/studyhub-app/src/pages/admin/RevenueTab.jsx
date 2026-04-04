/* ═══════════════════════════════════════════════════════════════════════════
 * RevenueTab.jsx — Admin payment/revenue analytics tab
 *
 * Self-contained: fetches from GET /api/payments/admin/revenue.
 * Shows 4 metric cards + recent transactions table.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'
import { API } from '../../config'
import { FONT, formatDateTime, tableHeadStyle, tableCell } from './adminConstants'

const SECTION = {
  background: 'var(--sh-surface)',
  borderRadius: 18,
  border: '1px solid var(--sh-border)',
  padding: '22px',
}

function formatCents(cents) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

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

function StatusPill({ status }) {
  const map = {
    succeeded: {
      bg: 'var(--sh-success-bg)',
      border: 'var(--sh-success-border)',
      text: 'var(--sh-success-text)',
    },
    failed: {
      bg: 'var(--sh-danger-bg)',
      border: 'var(--sh-danger-border)',
      text: 'var(--sh-danger-text)',
    },
    pending: {
      bg: 'var(--sh-warning-bg)',
      border: 'var(--sh-warning-border)',
      text: 'var(--sh-warning-text)',
    },
  }
  const s = map[status] || map.pending
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.text,
      }}
    >
      {status}
    </span>
  )
}

export default function RevenueTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  useEffect(() => {
    let active = true

    fetch(`${API}/api/payments/admin/revenue`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body.error || 'Failed to load revenue data')
        }
        return r.json()
      })
      .then((d) => {
        if (active) setData(d)
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <section style={SECTION}>
        <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>Loading revenue data...</div>
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

  const payments = data.recentPayments || []

  const handleSyncStripe = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const r = await fetch(`${API}/api/payments/admin/sync-stripe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const result = await r.json()
      if (r.ok) {
        setSyncResult({
          type: 'success',
          text: `Synced ${result.synced} subscription(s) from Stripe.${result.errors ? ` ${result.errors} error(s).` : ''}`,
        })
        // Reload revenue data
        const rev = await fetch(`${API}/api/payments/admin/revenue`, {
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        })
        if (rev.ok) setData(await rev.json())
      } else {
        setSyncResult({ type: 'error', text: result.error || 'Sync failed.' })
      }
    } catch {
      setSyncResult({ type: 'error', text: 'Network error during sync.' })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Sync Stripe Button ───────────────────────────────────────── */}
      <section
        style={{ ...SECTION, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
      >
        <button
          onClick={handleSyncStripe}
          disabled={syncing}
          style={{
            padding: '8px 18px',
            borderRadius: 10,
            border: '1px solid var(--sh-border)',
            background: 'var(--sh-soft)',
            color: 'var(--sh-heading)',
            fontSize: 13,
            fontWeight: 700,
            cursor: syncing ? 'default' : 'pointer',
            opacity: syncing ? 0.6 : 1,
            fontFamily: FONT,
          }}
        >
          {syncing ? 'Syncing...' : 'Sync Stripe Data'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
          Recover subscriptions and payments from Stripe if webhooks missed them.
        </span>
        {syncResult && (
          <div
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background:
                syncResult.type === 'success' ? 'var(--sh-success-bg)' : 'var(--sh-danger-bg)',
              color:
                syncResult.type === 'success' ? 'var(--sh-success-text)' : 'var(--sh-danger-text)',
              border: `1px solid ${syncResult.type === 'success' ? 'var(--sh-success-border)' : 'var(--sh-danger-border)'}`,
            }}
          >
            {syncResult.text}
          </div>
        )}
      </section>

      {/* ── Metric Cards ─────────────────────────────────────────────── */}
      <section style={SECTION}>
        <h3
          style={{
            margin: '0 0 16px',
            fontSize: 16,
            fontWeight: 800,
            color: 'var(--sh-heading)',
            fontFamily: FONT,
          }}
        >
          Revenue Overview
        </h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <MetricCard
            label="Total Revenue"
            value={formatCents(data.totalRevenueCents)}
            sub="All-time subscription payments"
            color="white"
          />
          <MetricCard
            label="Last 30 Days"
            value={formatCents(data.monthlyRevenueCents)}
            sub="Subscription revenue"
            color="white"
          />
          <MetricCard
            label="Active Subscribers"
            value={data.activeSubscribers}
            sub="Pro monthly + yearly"
            color="white"
          />
          <MetricCard
            label="Donations"
            value={formatCents(data.totalDonationsCents)}
            sub={`${data.totalDonationCount} total donation${data.totalDonationCount === 1 ? '' : 's'}`}
            color="white"
          />
        </div>
      </section>

      {/* ── Recent Transactions ──────────────────────────────────────── */}
      <section style={SECTION}>
        <h3
          style={{
            margin: '0 0 16px',
            fontSize: 16,
            fontWeight: 800,
            color: 'var(--sh-heading)',
            fontFamily: FONT,
          }}
        >
          Recent Transactions
        </h3>

        {payments.length === 0 ? (
          <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>
            No transactions recorded yet.
          </div>
        ) : (
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
                  <th style={tableHeadStyle}>User</th>
                  <th style={tableHeadStyle}>Type</th>
                  <th style={tableHeadStyle}>Amount</th>
                  <th style={tableHeadStyle}>Status</th>
                  <th style={tableHeadStyle}>Description</th>
                  <th style={tableHeadStyle}>Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td style={{ ...tableCell, fontWeight: 700, color: 'var(--sh-heading)' }}>
                      {p.user?.username || 'Unknown'}
                    </td>
                    <td style={tableCell}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          background:
                            p.type === 'donation' ? 'var(--sh-warning-bg)' : 'var(--sh-info-bg)',
                          color:
                            p.type === 'donation'
                              ? 'var(--sh-warning-text)'
                              : 'var(--sh-info-text)',
                        }}
                      >
                        {p.type}
                      </span>
                    </td>
                    <td style={{ ...tableCell, fontWeight: 700 }}>{formatCents(p.amount)}</td>
                    <td style={tableCell}>
                      <StatusPill status={p.status} />
                    </td>
                    <td
                      style={{
                        ...tableCell,
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.description || '--'}
                    </td>
                    <td style={{ ...tableCell, whiteSpace: 'nowrap' }}>
                      {formatDateTime(p.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
