/**
 * SubscriptionTab.jsx -- Subscription management in Settings.
 *
 * Simplified design: plan status, usage dashboard, quick actions,
 * payment history, and sync recovery. Special offers, referral codes,
 * gift subscription, and redeem code live on PricingPage.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'
import { SectionCard, Button, Message } from './settingsShared'
import { FONT } from './settingsState'

/* ─── Constants ──────────────────────────────────────────────────────── */

const PLAN_LABELS = {
  free: 'Free',
  pro_monthly: 'Pro (Monthly)',
  pro_yearly: 'Pro (Yearly)',
}

const STATUS_STYLES = {
  active: { bg: 'var(--sh-success-bg)', border: 'var(--sh-success-border)', text: 'var(--sh-success-text)', label: 'Active' },
  trialing: { bg: 'var(--sh-info-bg)', border: 'var(--sh-info-border)', text: 'var(--sh-info-text)', label: 'Trial' },
  past_due: { bg: 'var(--sh-warning-bg)', border: 'var(--sh-warning-border)', text: 'var(--sh-warning-text)', label: 'Past Due' },
  canceling: { bg: 'var(--sh-warning-bg)', border: 'var(--sh-warning-border)', text: 'var(--sh-warning-text)', label: 'Canceling' },
  free: { bg: 'var(--sh-soft)', border: 'var(--sh-border)', text: 'var(--sh-muted)', label: 'Free' },
}

const HISTORY_PAGE_SIZE = 10

/* ─── Helpers ────────────────────────────────────────────────────────── */

function fmtDate(iso) {
  if (!iso) return '--'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtCurrency(cents) {
  if (cents == null) return '--'
  return `$${(cents / 100).toFixed(2)}`
}

function getStatusKey(sub, cancelAtPeriodEnd) {
  if (!sub || sub.plan === 'free') return 'free'
  if (cancelAtPeriodEnd) return 'canceling'
  if (sub.status === 'trialing') return 'trialing'
  if (sub.status === 'past_due') return 'past_due'
  return 'active'
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function StatusBadge({ statusKey }) {
  const style = STATUS_STYLES[statusKey] || STATUS_STYLES.free
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 6,
      fontSize: 12, fontWeight: 700, fontFamily: FONT,
      background: style.bg, border: `1px solid ${style.border}`, color: style.text,
    }}>
      {style.label}
    </span>
  )
}

function ProgressBar({ value, max, unlimited }) {
  const pct = unlimited ? 15 : max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{ height: 6, borderRadius: 3, background: 'var(--sh-soft)', overflow: 'hidden', marginTop: 8 }}>
      <div style={{
        height: '100%', borderRadius: 3, background: 'var(--sh-brand)',
        width: `${pct}%`, transition: 'width .3s ease',
      }} />
    </div>
  )
}

function MetricCard({ label, value, max, unlimited }) {
  const limitText = unlimited ? 'Unlimited' : `${value} / ${max}`
  return (
    <div style={{
      background: 'var(--sh-surface)', border: '1px solid var(--sh-border)',
      borderRadius: 12, padding: 16,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sh-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--sh-heading)' }}>{limitText}</div>
      <ProgressBar value={value} max={max} unlimited={unlimited} />
    </div>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.4)',
    }}>
      <div style={{
        background: 'var(--sh-surface)', borderRadius: 14, padding: 24,
        maxWidth: 400, width: '90%', boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
      }}>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--sh-text)', lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button secondary onClick={onCancel}>Keep Plan</Button>
          <Button danger onClick={onConfirm}>Cancel Subscription</Button>
        </div>
      </div>
    </div>
  )
}

/* ─── Main Component ─────────────────────────────────────────────────── */

export default function SubscriptionTab() {
  const { user, refreshSession } = useSession()
  const [sub, setSub] = useState(null)
  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [historyPage, setHistoryPage] = useState(1)
  const [portalLoading, setPortalLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [reactivateLoading, setReactivateLoading] = useState(false)
  const [showConfirmCancel, setShowConfirmCancel] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const pollRef = useRef(null)

  const sessionPlan = user?.plan || 'free'

  /* ── Data fetching ─────────────────────────────────────────────── */

  const fetchSubscriptionData = useCallback(async () => {
    const [subRes, histRes] = await Promise.all([
      fetch(`${API}/api/payments/subscription`, { credentials: 'include' }),
      fetch(`${API}/api/payments/history?page=1&limit=${HISTORY_PAGE_SIZE}`, { credentials: 'include' }),
    ])
    const subData = subRes.ok ? await subRes.json() : null
    const histData = histRes.ok ? await histRes.json() : null
    return { subData, histData }
  }, [])

  const fetchHistory = useCallback(async (page) => {
    try {
      const res = await fetch(`${API}/api/payments/history?page=${page}&limit=${HISTORY_PAGE_SIZE}`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setHistory(data)
      }
    } catch { /* silent */ }
  }, [])

  // Payment success polling
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') !== 'success') return

    setShowSuccess(true)
    window.history.replaceState({}, '', window.location.pathname + '?tab=subscription')
    refreshSession()

    let attempts = 0
    const MAX_ATTEMPTS = 10
    pollRef.current = setInterval(async () => {
      attempts++
      try {
        const { subData, histData } = await fetchSubscriptionData()
        if (subData) setSub(subData)
        if (histData) setHistory(histData)
        if ((subData && subData.plan !== 'free') || attempts >= MAX_ATTEMPTS) {
          clearInterval(pollRef.current)
          if (subData && subData.plan !== 'free') refreshSession()
        }
      } catch {
        if (attempts >= MAX_ATTEMPTS) clearInterval(pollRef.current)
      }
    }, 3000)

    return () => clearInterval(pollRef.current)
  }, [refreshSession, fetchSubscriptionData])

  // Initial load
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { subData, histData } = await fetchSubscriptionData()
        if (!cancelled) {
          if (subData) setSub(subData)
          if (histData) setHistory(histData)
        }
      } catch {
        if (!cancelled) setError('Failed to load subscription data.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [fetchSubscriptionData])

  /* ── Derived state ─────────────────────────────────────────────── */

  const apiPlan = sub?.plan || 'free'
  const effectivePlan = apiPlan !== 'free' ? apiPlan : sessionPlan
  const isFree = effectivePlan === 'free'
  const cancelAtPeriodEnd = sub?.cancelAtPeriodEnd || false
  const statusKey = getStatusKey(sub, cancelAtPeriodEnd)

  /* ── Actions ───────────────────────────────────────────────────── */

  async function handlePortal() {
    setPortalLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/payments/portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok && data.url) {
        window.location.href = data.url
      } else {
        setError(data.error || 'Could not open billing portal.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setPortalLoading(false)
    }
  }

  async function handleCancel() {
    setCancelLoading(true)
    setShowConfirmCancel(false)
    setError('')
    try {
      const res = await fetch(`${API}/api/payments/subscription/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok) {
        setSub((prev) => prev ? { ...prev, cancelAtPeriodEnd: true } : prev)
        refreshSession()
      } else {
        setError(data.error || 'Could not cancel subscription.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setCancelLoading(false)
    }
  }

  async function handleReactivate() {
    setReactivateLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/payments/subscription/reactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok) {
        setSub((prev) => prev ? { ...prev, cancelAtPeriodEnd: false } : prev)
        refreshSession()
      } else {
        setError(data.error || 'Could not reactivate subscription.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setReactivateLoading(false)
    }
  }

  async function handleSync() {
    setSyncLoading(true)
    setSyncMsg(null)
    try {
      const res = await fetch(`${API}/api/payments/subscription/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok) {
        setSyncMsg({ tone: 'success', text: data.message || 'Subscription synced successfully.' })
        refreshSession()
        const { subData, histData } = await fetchSubscriptionData()
        if (subData) setSub(subData)
        if (histData) setHistory(histData)
      } else {
        const hint = data.hint || data.error || 'Sync failed.'
        setSyncMsg({ tone: 'error', text: hint })
      }
    } catch {
      setSyncMsg({ tone: 'error', text: 'Network error during sync.' })
    } finally {
      setSyncLoading(false)
    }
  }

  /* ── History pagination ────────────────────────────────────────── */

  function handleHistoryPage(page) {
    setHistoryPage(page)
    fetchHistory(page)
  }

  /* ── Usage limits ──────────────────────────────────────────────── */

  const usage = sub?.usage || {}
  const sheetsUploaded = usage.sheetsThisMonth ?? 0
  const sheetsLimit = isFree ? 10 : null
  const aiMessages = usage.aiMessagesToday ?? 0
  const aiLimit = isFree ? 10 : 120
  const privateGroups = usage.privateGroups ?? 0
  const groupsLimit = isFree ? 2 : 10
  const videoSummary = usage.videoStorage || (isFree ? '0 / 500 MB' : 'Unlimited')

  /* ── Render ────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: 'var(--sh-muted)' }}>Loading subscription...</div>
      </div>
    )
  }

  const payments = history?.payments || history?.data || []
  const totalPages = history?.totalPages || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Success Banner */}
      {showSuccess && (
        <Message tone="success">
          Payment successful! Your Pro plan is now active.
        </Message>
      )}

      {/* Error Banner */}
      {error && <Message tone="error">{error}</Message>}

      {/* Section 1: Plan Status */}
      <SectionCard title="Your Plan">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {isFree ? (
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'var(--sh-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 800, color: 'var(--sh-muted)',
              flexShrink: 0,
            }}>
              F
            </div>
          ) : (
            <img
              src={effectivePlan === 'pro_yearly' ? '/images/plan-pro-yearly.png' : '/images/plan-pro-monthly.png'}
              alt={PLAN_LABELS[effectivePlan] || 'Pro'}
              style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--sh-heading)' }}>
                {PLAN_LABELS[effectivePlan] || effectivePlan}
              </span>
              <StatusBadge statusKey={statusKey} />
            </div>
            {!isFree && sub?.currentPeriodEnd && (
              <div style={{ fontSize: 13, color: 'var(--sh-muted)', marginTop: 4 }}>
                {cancelAtPeriodEnd ? 'Access until' : 'Renews'} {fmtDate(sub.currentPeriodEnd)}
              </div>
            )}
            {!isFree && sub?.createdAt && (
              <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginTop: 2 }}>
                Member since {fmtDate(sub.createdAt)}
              </div>
            )}
            {isFree && (
              <div style={{ fontSize: 13, color: 'var(--sh-muted)', marginTop: 4 }}>
                <Link to="/pricing" style={{ color: 'var(--sh-brand)', fontWeight: 600, textDecoration: 'none' }}>
                  Upgrade to Pro
                </Link>
                {' '}for unlimited uploads, more AI messages, and priority features.
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Section 2: Usage Dashboard */}
      <SectionCard title="Usage" subtitle="Your current usage this billing period.">
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}>
          <MetricCard label="Sheets uploaded (this month)" value={sheetsUploaded} max={sheetsLimit} unlimited={!isFree} />
          <MetricCard label="AI messages (today)" value={aiMessages} max={aiLimit} unlimited={false} />
          <MetricCard label="Private groups" value={privateGroups} max={groupsLimit} unlimited={false} />
          <div style={{
            background: 'var(--sh-surface)', border: '1px solid var(--sh-border)',
            borderRadius: 12, padding: 16,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sh-muted)', marginBottom: 4 }}>Video storage</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--sh-heading)' }}>{videoSummary}</div>
            <ProgressBar value={0} max={1} unlimited={!isFree} />
          </div>
        </div>
      </SectionCard>

      {/* Section 3: Quick Actions */}
      <SectionCard title="Quick Actions">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {!isFree && (
            <Button onClick={handlePortal} disabled={portalLoading}>
              {portalLoading ? 'Opening...' : 'Manage Payment Method'}
            </Button>
          )}
          {isFree && (
            <Link to="/pricing" style={{ textDecoration: 'none' }}>
              <Button>Upgrade Plan</Button>
            </Link>
          )}
          {!isFree && cancelAtPeriodEnd && (
            <Button secondary onClick={handleReactivate} disabled={reactivateLoading}>
              {reactivateLoading ? 'Reactivating...' : 'Reactivate Subscription'}
            </Button>
          )}
          {!isFree && !cancelAtPeriodEnd && (
            <Button danger onClick={() => setShowConfirmCancel(true)} disabled={cancelLoading}>
              {cancelLoading ? 'Canceling...' : 'Cancel Subscription'}
            </Button>
          )}
        </div>
      </SectionCard>

      {/* Section 4: Payment History */}
      <SectionCard title="Payment History" subtitle="Your recent transactions and receipts.">
        {payments.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--sh-muted)', padding: '12px 0' }}>
            No payments yet.
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse', fontSize: 13,
                fontFamily: FONT,
              }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--sh-border)' }}>
                    {['Date', 'Description', 'Amount', 'Status', 'Receipt'].map((h) => (
                      <th key={h} style={{
                        textAlign: 'left', padding: '8px 10px', fontSize: 12,
                        fontWeight: 700, color: 'var(--sh-muted)', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, i) => (
                    <tr key={p.id || i} style={{ borderBottom: '1px solid var(--sh-soft)' }}>
                      <td style={{ padding: '10px', color: 'var(--sh-text)', whiteSpace: 'nowrap' }}>
                        {fmtDate(p.createdAt || p.date)}
                      </td>
                      <td style={{ padding: '10px', color: 'var(--sh-text)' }}>
                        {p.description || p.type || '--'}
                      </td>
                      <td style={{ padding: '10px', color: 'var(--sh-heading)', fontWeight: 700 }}>
                        {fmtCurrency(p.amount)}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 5,
                          fontSize: 11, fontWeight: 600,
                          background: p.status === 'succeeded' || p.status === 'paid'
                            ? 'var(--sh-success-bg)' : 'var(--sh-warning-bg)',
                          color: p.status === 'succeeded' || p.status === 'paid'
                            ? 'var(--sh-success-text)' : 'var(--sh-warning-text)',
                        }}>
                          {p.status || 'unknown'}
                        </span>
                      </td>
                      <td style={{ padding: '10px' }}>
                        {p.receiptUrl ? (
                          <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer"
                            style={{ color: 'var(--sh-brand)', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                            View
                          </a>
                        ) : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 14 }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => handleHistoryPage(page)}
                    style={{
                      width: 30, height: 30, borderRadius: 8, border: 'none',
                      fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
                      background: page === historyPage ? 'var(--sh-brand)' : 'var(--sh-soft)',
                      color: page === historyPage ? 'var(--sh-btn-primary-text)' : 'var(--sh-text)',
                    }}
                  >
                    {page}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* Section 5: Sync Recovery */}
      <div style={{ padding: '8px 0', textAlign: 'center' }}>
        {syncMsg && <Message tone={syncMsg.tone}>{syncMsg.text}</Message>}
        <button
          onClick={handleSync}
          disabled={syncLoading}
          style={{
            background: 'none', border: 'none', cursor: syncLoading ? 'not-allowed' : 'pointer',
            fontSize: 12, color: 'var(--sh-muted)', textDecoration: 'underline',
            fontFamily: FONT, padding: 4, opacity: syncLoading ? 0.6 : 1,
          }}
        >
          {syncLoading ? 'Syncing...' : 'Subscription not showing? Sync from Stripe'}
        </button>
      </div>

      {/* Cancel Confirmation Dialog */}
      {showConfirmCancel && (
        <ConfirmDialog
          message="Are you sure you want to cancel your subscription? You will retain access until the end of your current billing period."
          onConfirm={handleCancel}
          onCancel={() => setShowConfirmCancel(false)}
        />
      )}
    </div>
  )
}
