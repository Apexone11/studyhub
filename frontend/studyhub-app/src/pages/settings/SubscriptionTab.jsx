/**
 * SubscriptionTab.jsx — Subscription management in Settings.
 *
 * Shows current plan, billing period end, cancel status.
 * Links to Stripe Customer Portal for card/plan management.
 * Shows payment history with downloadable receipts.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../../config'
import { SectionCard, Button, Message } from './settingsShared'
import { FONT } from './settingsState'

const PLAN_LABELS = {
  free: 'Free',
  pro_monthly: 'Pro (Monthly)',
  pro_yearly: 'Pro (Yearly)',
}

export default function SubscriptionTab() {
  const [sub, setSub] = useState(null)
  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [historyPage, setHistoryPage] = useState(1)
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState('')

  // Fetch subscription + first page of history
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [subRes, histRes] = await Promise.all([
          fetch(`${API}/api/payments/subscription`, { credentials: 'include' }),
          fetch(`${API}/api/payments/history?page=1&limit=10`, { credentials: 'include' }),
        ])

        if (!cancelled) {
          if (subRes.ok) setSub(await subRes.json())
          if (histRes.ok) setHistory(await histRes.json())
        }
      } catch (err) {
        if (!cancelled) setError('Failed to load subscription data.')
        console.error('[subscription]', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  // Load more history pages
  const loadHistoryPage = useCallback(async (page) => {
    try {
      const res = await fetch(`${API}/api/payments/history?page=${page}&limit=10`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setHistory(data)
        setHistoryPage(page)
      }
    } catch (err) {
      console.error('[subscription] history page error:', err)
    }
  }, [])

  // Open Stripe Customer Portal
  const handleManage = useCallback(async () => {
    setPortalLoading(true)
    try {
      const res = await fetch(`${API}/api/payments/portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to open billing portal.')
        return
      }

      window.location.href = data.url
    } catch (err) {
      console.error('[subscription] portal error:', err)
      setError('Network error. Please try again.')
    } finally {
      setPortalLoading(false)
    }
  }, [])

  if (loading) {
    return (
      <SectionCard title="Subscription" subtitle="Loading your subscription details...">
        <div style={{ height: 80 }} />
      </SectionCard>
    )
  }

  if (error) {
    return (
      <SectionCard title="Subscription">
        <Message tone="error">{error}</Message>
      </SectionCard>
    )
  }

  const isFree = !sub || sub.plan === 'free'
  const isActive = sub?.status === 'active' || sub?.status === 'trialing'
  const isPastDue = sub?.status === 'past_due'

  return (
    <>
      {/* ── Current Plan ──────────────────────────────── */}
      <SectionCard
        title="Current Plan"
        subtitle="Your active subscription and billing details."
      >
        <div style={s.planRow}>
          <div style={s.planInfo}>
            <div style={s.planBadge}>
              <span style={{
                ...s.badge,
                background: isFree ? 'var(--sh-soft)' : '#ddd6fe',
                color: isFree ? 'var(--sh-text)' : '#6d28d9',
              }}>
                {PLAN_LABELS[sub?.plan] || 'Free'}
              </span>
              {isActive && !isFree && (
                <span style={{ ...s.statusDot, background: '#059669' }}>Active</span>
              )}
              {isPastDue && (
                <span style={{ ...s.statusDot, background: '#dc2626' }}>Past Due</span>
              )}
              {sub?.cancelAtPeriodEnd && (
                <span style={{ ...s.statusDot, background: '#f59e0b' }}>Canceling</span>
              )}
            </div>

            {!isFree && sub?.currentPeriodEnd && (
              <p style={s.periodText}>
                {sub.cancelAtPeriodEnd
                  ? `Access until ${formatDate(sub.currentPeriodEnd)}`
                  : `Renews on ${formatDate(sub.currentPeriodEnd)}`}
              </p>
            )}

            {isPastDue && (
              <Message tone="error">
                Your latest payment failed. Please update your payment method to keep your Pro features.
              </Message>
            )}

            {sub?.cancelAtPeriodEnd && (
              <Message tone="info">
                Your subscription will end on {formatDate(sub.currentPeriodEnd)}.
                You will keep Pro features until then. You can resubscribe at any time.
              </Message>
            )}
          </div>
        </div>

        <div style={s.actionRow}>
          {isFree ? (
            <Link to="/pricing" style={s.upgradeLink}>
              Upgrade to Pro
            </Link>
          ) : (
            <Button
              onClick={handleManage}
              disabled={portalLoading}
              secondary
            >
              {portalLoading ? 'Opening...' : 'Manage Subscription'}
            </Button>
          )}
        </div>

        {!isFree && (
          <p style={s.portalNote}>
            Use the billing portal to update your payment method, switch between monthly and yearly,
            or cancel your subscription. Cancellation takes effect at the end of your current billing period.
            No refunds for partial periods.
          </p>
        )}
      </SectionCard>

      {/* ── Plan Features ─────────────────────────────── */}
      <SectionCard
        title="Plan Features"
        subtitle={isFree ? 'Upgrade to Pro to unlock more.' : 'Everything included in your plan.'}
      >
        <div style={s.featuresGrid}>
          <FeatureItem label="Uploads" value={isFree ? '10/month' : 'Unlimited'} highlight={!isFree} />
          <FeatureItem label="AI Messages" value={isFree ? '30/day' : '120/day'} highlight={!isFree} />
          <FeatureItem label="Storage" value={isFree ? '500 MB' : '5 GB'} highlight={!isFree} />
          <FeatureItem label="Study Groups" value={isFree ? '2 private' : '10 private'} highlight={!isFree} />
          <FeatureItem label="Pro Badge" value={isFree ? 'No' : 'Yes'} highlight={!isFree} />
          <FeatureItem label="Priority Support" value={isFree ? 'No' : 'Yes'} highlight={!isFree} />
        </div>
      </SectionCard>

      {/* ── Payment History ────────────────────────────── */}
      <SectionCard
        title="Payment History"
        subtitle="Your recent payments and receipts."
      >
        {!history || history.payments.length === 0 ? (
          <p style={s.emptyText}>No payment history yet.</p>
        ) : (
          <>
            <div style={s.historyTable}>
              <div style={s.historyHeader}>
                <span style={s.historyCol}>Date</span>
                <span style={s.historyCol}>Description</span>
                <span style={s.historyColRight}>Amount</span>
                <span style={s.historyColRight}>Status</span>
                <span style={s.historyColRight}>Receipt</span>
              </div>
              {history.payments.map((p) => (
                <div key={p.id} style={s.historyRow}>
                  <span style={s.historyCol}>{formatDate(p.createdAt)}</span>
                  <span style={{ ...s.historyCol, flex: 2 }}>
                    {p.description || (p.type === 'donation' ? 'Donation' : 'Subscription')}
                  </span>
                  <span style={s.historyColRight}>
                    ${(p.amount / 100).toFixed(2)} {p.currency.toUpperCase()}
                  </span>
                  <span style={s.historyColRight}>
                    <span style={{
                      ...s.statusPill,
                      background: p.status === 'succeeded' ? 'var(--sh-success-bg)' : 'var(--sh-danger-bg)',
                      color: p.status === 'succeeded' ? 'var(--sh-success-text)' : 'var(--sh-danger-text)',
                    }}>
                      {p.status}
                    </span>
                  </span>
                  <span style={s.historyColRight}>
                    {p.receiptUrl ? (
                      <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" style={s.receiptLink}>
                        View
                      </a>
                    ) : (
                      <span style={s.noReceipt}>--</span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            {history.totalPages > 1 && (
              <div style={s.pagination}>
                <button
                  style={s.pageBtn}
                  disabled={historyPage <= 1}
                  onClick={() => loadHistoryPage(historyPage - 1)}
                >
                  Previous
                </button>
                <span style={s.pageInfo}>
                  Page {historyPage} of {history.totalPages}
                </span>
                <button
                  style={s.pageBtn}
                  disabled={historyPage >= history.totalPages}
                  onClick={() => loadHistoryPage(historyPage + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </SectionCard>
    </>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '--'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function FeatureItem({ label, value, highlight }) {
  return (
    <div style={s.featureItem}>
      <span style={s.featureLabel}>{label}</span>
      <span style={{ ...s.featureValue, color: highlight ? '#059669' : 'var(--sh-text)' }}>
        {value}
      </span>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────

const s = {
  planRow: {
    marginBottom: 16,
  },
  planInfo: {},
  planBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  badge: {
    display: 'inline-block',
    fontSize: 13,
    fontWeight: 700,
    padding: '5px 14px',
    borderRadius: 8,
  },
  statusDot: {
    display: 'inline-block',
    fontSize: 12,
    fontWeight: 600,
    color: '#ffffff',
    padding: '3px 10px',
    borderRadius: 6,
  },
  periodText: {
    fontSize: 14,
    color: 'var(--sh-subtext)',
    margin: '0 0 12px',
  },
  actionRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 12,
  },
  upgradeLink: {
    display: 'inline-block',
    background: '#6d28d9',
    color: '#ffffff',
    padding: '10px 24px',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 14,
    textDecoration: 'none',
    fontFamily: FONT,
  },
  portalNote: {
    fontSize: 12,
    color: 'var(--sh-muted)',
    lineHeight: 1.6,
    margin: 0,
  },

  /* Features Grid */
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 12,
  },
  featureItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    background: 'var(--sh-bg)',
    borderRadius: 10,
    border: '1px solid var(--sh-border)',
  },
  featureLabel: {
    fontSize: 13,
    color: 'var(--sh-subtext)',
    fontWeight: 500,
  },
  featureValue: {
    fontSize: 13,
    fontWeight: 700,
  },

  /* History Table */
  historyTable: {
    width: '100%',
    overflowX: 'auto',
  },
  historyHeader: {
    display: 'flex',
    gap: 8,
    padding: '8px 0',
    borderBottom: '1px solid var(--sh-border)',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--sh-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  historyRow: {
    display: 'flex',
    gap: 8,
    padding: '10px 0',
    borderBottom: '1px solid var(--sh-soft)',
    fontSize: 13,
    color: 'var(--sh-text)',
    alignItems: 'center',
  },
  historyCol: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  historyColRight: {
    flex: 1,
    textAlign: 'right',
    minWidth: 0,
  },
  statusPill: {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 6,
  },
  receiptLink: {
    color: 'var(--sh-brand)',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
  },
  noReceipt: {
    color: 'var(--sh-muted)',
    fontSize: 13,
  },
  emptyText: {
    fontSize: 14,
    color: 'var(--sh-muted)',
    margin: 0,
  },

  /* Pagination */
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 16,
    paddingTop: 16,
    borderTop: '1px solid var(--sh-border)',
  },
  pageBtn: {
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--sh-text)',
    background: 'var(--sh-soft)',
    border: '1px solid var(--sh-border)',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: FONT,
    transition: 'background-color 0.2s',
  },
  pageInfo: {
    fontSize: 13,
    color: 'var(--sh-subtext)',
    fontWeight: 500,
  },
}
