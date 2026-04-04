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
  const [showSuccess, setShowSuccess] = useState(false)

  // Check for payment=success in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('payment') && params.get('payment') === 'success') {
      setShowSuccess(true)
      // Clear the param from URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

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
    return () => {
      cancelled = true
    }
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
  const planImage =
    sub?.plan === 'pro_yearly'
      ? '/images/plan-pro-yearly.png'
      : sub?.plan === 'pro_monthly'
        ? '/images/plan-pro-monthly.png'
        : null

  return (
    <>
      {/* ── Success Banner ────────────────────────────── */}
      {showSuccess && (
        <Message tone="success">Welcome to Pro! Your subscription is now active.</Message>
      )}

      {/* ── Current Plan ──────────────────────────────── */}
      <SectionCard title="Current Plan" subtitle="Your active subscription and billing details.">
        <div style={s.planRow}>
          {/* Plan image card for Pro subscribers */}
          {!isFree && planImage && (
            <div style={s.planImageCard}>
              <img src={planImage} alt={PLAN_LABELS[sub?.plan] || 'Pro'} style={s.planImageThumb} />
            </div>
          )}
          <div style={s.planInfo}>
            <div style={s.planBadge}>
              <span
                style={{
                  ...s.badge,
                  background: isFree
                    ? 'var(--sh-soft)'
                    : 'linear-gradient(135deg, #7c3aed, #3b82f6)',
                  color: isFree ? 'var(--sh-text)' : '#ffffff',
                }}
              >
                {PLAN_LABELS[sub?.plan] || 'Free'}
              </span>
              {isActive && !isFree && (
                <span style={{ ...s.statusDot, background: 'var(--sh-success)' }}>Active</span>
              )}
              {sub?.status === 'trialing' && (
                <span
                  style={{
                    ...s.statusDot,
                    background: 'var(--sh-info-bg)',
                    color: 'var(--sh-info-text)',
                  }}
                >
                  Trial
                </span>
              )}
              {isPastDue && (
                <span style={{ ...s.statusDot, background: 'var(--sh-danger)' }}>Past Due</span>
              )}
              {sub?.cancelAtPeriodEnd && (
                <span style={{ ...s.statusDot, background: 'var(--sh-warning)' }}>Canceling</span>
              )}
            </div>

            {!isFree && sub?.currentPeriodEnd && (
              <p style={s.periodText}>
                {sub.cancelAtPeriodEnd
                  ? `Access until ${formatDate(sub.currentPeriodEnd)}`
                  : `Renews on ${formatDate(sub.currentPeriodEnd)}`}
              </p>
            )}

            {!isFree && sub?.createdAt && (
              <p style={s.periodText}>Member since {formatDate(sub.createdAt)}</p>
            )}

            {isFree && (
              <p style={s.periodText}>
                Upgrade to Pro to unlock unlimited uploads, 120 AI messages/day, and more.
              </p>
            )}

            {isPastDue && (
              <Message tone="error">
                Your latest payment failed. Please update your payment method to keep your Pro
                features.
              </Message>
            )}

            {sub?.cancelAtPeriodEnd && (
              <Message tone="info">
                Your subscription will end on {formatDate(sub.currentPeriodEnd)}. You will keep Pro
                features until then. You can resubscribe at any time.
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
            <Button onClick={handleManage} disabled={portalLoading} secondary>
              {portalLoading ? 'Opening...' : 'Manage Subscription'}
            </Button>
          )}
        </div>

        {!isFree && (
          <p style={s.portalNote}>
            Use the billing portal to update your payment method, switch between monthly and yearly,
            or cancel your subscription. Cancellation takes effect at the end of your current
            billing period. No refunds for partial periods.
          </p>
        )}
      </SectionCard>

      {/* ── Plan Features ─────────────────────────────── */}
      <SectionCard
        title="Plan Features"
        subtitle={isFree ? 'Upgrade to Pro to unlock more.' : 'Everything included in your plan.'}
      >
        <div style={s.featuresGrid}>
          <FeatureItem
            label="Uploads"
            value={isFree ? '10/month' : 'Unlimited'}
            highlight={!isFree}
          />
          <FeatureItem
            label="AI Messages"
            value={isFree ? '10/day' : '120/day'}
            highlight={!isFree}
          />
          <FeatureItem
            label="Video Uploads"
            value={isFree ? '5 min max' : '60 min max'}
            highlight={!isFree}
          />
          <FeatureItem label="Storage" value={isFree ? '500 MB' : '5 GB'} highlight={!isFree} />
          <FeatureItem
            label="Study Groups"
            value={isFree ? '2 private' : '10 private'}
            highlight={!isFree}
          />
          <FeatureItem label="Pro Badge" value={isFree ? 'No' : 'Yes'} highlight={!isFree} />
          <FeatureItem label="Priority Support" value={isFree ? 'No' : 'Yes'} highlight={!isFree} />
        </div>
      </SectionCard>

      {/* ── Payment History ────────────────────────────── */}
      <SectionCard title="Payment History" subtitle="Your recent payments and receipts.">
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
                    <span
                      style={{
                        ...s.statusPill,
                        background:
                          p.status === 'succeeded' ? 'var(--sh-success-bg)' : 'var(--sh-danger-bg)',
                        color:
                          p.status === 'succeeded'
                            ? 'var(--sh-success-text)'
                            : 'var(--sh-danger-text)',
                      }}
                    >
                      {p.status}
                    </span>
                  </span>
                  <span style={s.historyColRight}>
                    {p.receiptUrl ? (
                      <a
                        href={p.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={s.receiptLink}
                      >
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

      {/* ── Sprint E: Pro Features ───────────────────────── */}

      {/* Free Trial / Student Discount (only for free users) */}
      {isFree && (
        <SectionCard title="Special Offers" subtitle="Ways to get started with Pro.">
          <TrialAndDiscountSection />
        </SectionCard>
      )}

      {/* Referral Codes */}
      <SectionCard
        title="Referral Codes"
        subtitle="Share your code and earn rewards when friends join."
      >
        <ReferralSection />
      </SectionCard>

      {/* Gift Subscription */}
      <SectionCard title="Gift a Subscription" subtitle="Give the gift of Pro to a friend.">
        <GiftSection />
      </SectionCard>

      {/* Pause Subscription (only for active subscribers) */}
      {!isFree && isActive && (
        <SectionCard title="Pause Subscription" subtitle="Take a break without losing your spot.">
          <PauseSection />
        </SectionCard>
      )}

      {/* Redeem Codes */}
      <SectionCard title="Redeem a Code" subtitle="Have a referral or gift code? Enter it here.">
        <RedeemSection />
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
      <span
        style={{ ...s.featureValue, color: highlight ? 'var(--sh-success)' : 'var(--sh-text)' }}
      >
        {value}
      </span>
    </div>
  )
}

// ── Sprint E Components ─────────────────────────────────────────────────

function TrialAndDiscountSection() {
  const [trialLoading, setTrialLoading] = useState(false)
  const [studentLoading, setStudentLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  const startTrial = async () => {
    setTrialLoading(true)
    setMsg(null)
    try {
      const res = await fetch(`${API}/api/payments/checkout/trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ tone: 'error', text: data.error || 'Failed to start trial.' })
        return
      }
      window.location.href = data.url
    } catch {
      setMsg({ tone: 'error', text: 'Network error. Please try again.' })
    } finally {
      setTrialLoading(false)
    }
  }

  const applyStudentDiscount = async () => {
    setStudentLoading(true)
    setMsg(null)
    try {
      const res = await fetch(`${API}/api/payments/checkout/student-discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: 'pro_monthly' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ tone: 'error', text: data.error || 'Failed to apply student discount.' })
        return
      }
      window.location.href = data.url
    } catch {
      setMsg({ tone: 'error', text: 'Network error. Please try again.' })
    } finally {
      setStudentLoading(false)
    }
  }

  return (
    <div style={se.stack}>
      {msg && <Message tone={msg.tone}>{msg.text}</Message>}
      <div style={se.offerRow}>
        <div style={se.offerCard}>
          <p style={se.offerTitle}>7-Day Free Trial</p>
          <p style={se.offerDesc}>
            Try Pro free for 7 days. Cancel anytime before the trial ends and you will not be
            charged.
          </p>
          <Button onClick={startTrial} disabled={trialLoading}>
            {trialLoading ? 'Loading...' : 'Start Free Trial'}
          </Button>
        </div>
        <div style={se.offerCard}>
          <p style={se.offerTitle}>Student Discount (20% off)</p>
          <p style={se.offerDesc}>
            Have a verified .edu email? Get 20% off Pro for as long as you are subscribed.
          </p>
          <Button onClick={applyStudentDiscount} disabled={studentLoading} secondary>
            {studentLoading ? 'Loading...' : 'Apply Student Discount'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ReferralSection() {
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState(null)
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${API}/api/payments/referral/mine`, { credentials: 'include' })
        if (res.ok && !cancelled) {
          const data = await res.json()
          setCodes(data.codes || [])
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const createCode = async () => {
    setCreating(true)
    setMsg(null)
    try {
      const res = await fetch(`${API}/api/payments/referral/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ tone: 'error', text: data.error || 'Failed to create code.' })
        return
      }
      setCodes((prev) => [data, ...prev])
      setMsg({ tone: 'success', text: 'Referral code created.' })
    } catch {
      setMsg({ tone: 'error', text: 'Network error.' })
    } finally {
      setCreating(false)
    }
  }

  const deactivateCode = async (id) => {
    try {
      const res = await fetch(`${API}/api/payments/referral/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.ok) {
        setCodes((prev) => prev.map((c) => (c.id === id ? { ...c, active: false } : c)))
      }
    } catch {
      // silent
    }
  }

  const copyCode = (code) => {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(code)
        setTimeout(() => setCopied(null), 2000)
      })
      .catch(() => {})
  }

  if (loading) return <p style={s.emptyText}>Loading referral codes...</p>

  return (
    <div style={se.stack}>
      {msg && <Message tone={msg.tone}>{msg.text}</Message>}
      <div style={se.row}>
        <Button
          onClick={createCode}
          disabled={creating || codes.filter((c) => c.active).length >= 5}
        >
          {creating ? 'Creating...' : 'Create Referral Code'}
        </Button>
        <span style={se.hint}>{codes.filter((c) => c.active).length}/5 active codes</span>
      </div>
      {codes.length === 0 ? (
        <p style={s.emptyText}>No referral codes yet. Create one to share with friends.</p>
      ) : (
        <div style={se.codeList}>
          {codes.map((c) => (
            <div key={c.id} style={{ ...se.codeRow, opacity: c.active ? 1 : 0.5 }}>
              <span style={se.codeText}>{c.code}</span>
              <span style={se.codeUses}>
                {c.currentUses} use{c.currentUses !== 1 ? 's' : ''}
              </span>
              {c.active && (
                <>
                  <button style={se.smallBtn} onClick={() => copyCode(c.code)}>
                    {copied === c.code ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    style={{ ...se.smallBtn, color: 'var(--sh-danger)' }}
                    onClick={() => deactivateCode(c.id)}
                  >
                    Deactivate
                  </button>
                </>
              )}
              {!c.active && <span style={se.inactiveLabel}>Inactive</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GiftSection() {
  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState('pro_monthly')
  const [months, setMonths] = useState(1)
  const [giftMessage, setGiftMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  const handleGift = async (e) => {
    e.preventDefault()
    if (!email.trim()) {
      setMsg({ tone: 'error', text: 'Recipient email is required.' })
      return
    }
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetch(`${API}/api/payments/gift/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recipientEmail: email.trim(),
          plan,
          durationMonths: months,
          message: giftMessage,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ tone: 'error', text: data.error || 'Failed to create gift checkout.' })
        return
      }
      window.location.href = data.url
    } catch {
      setMsg({ tone: 'error', text: 'Network error. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleGift} style={se.stack}>
      {msg && <Message tone={msg.tone}>{msg.text}</Message>}
      <div style={se.fieldGroup}>
        <label style={se.label}>Recipient Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="friend@example.com"
          style={se.input}
          required
        />
      </div>
      <div style={se.fieldRow}>
        <div style={se.fieldGroup}>
          <label style={se.label}>Plan</label>
          <select value={plan} onChange={(e) => setPlan(e.target.value)} style={se.input}>
            <option value="pro_monthly">Pro Monthly</option>
            <option value="pro_yearly">Pro Yearly</option>
          </select>
        </div>
        <div style={se.fieldGroup}>
          <label style={se.label}>Duration (months)</label>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            style={se.input}
          >
            {[1, 3, 6, 12].map((m) => (
              <option key={m} value={m}>
                {m} month{m > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={se.fieldGroup}>
        <label style={se.label}>Personal Message (optional)</label>
        <textarea
          value={giftMessage}
          onChange={(e) => setGiftMessage(e.target.value)}
          placeholder="Enjoy StudyHub Pro!"
          style={{ ...se.input, minHeight: 60, resize: 'vertical' }}
          maxLength={500}
        />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? 'Processing...' : 'Purchase Gift'}
      </Button>
    </form>
  )
}

function PauseSection() {
  const [days, setDays] = useState(14)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [pauseStatus, setPauseStatus] = useState(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${API}/api/payments/subscription/pause-status`, {
          credentials: 'include',
        })
        if (res.ok && !cancelled) {
          const data = await res.json()
          setPauseStatus(data)
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setStatusLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handlePause = async () => {
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetch(`${API}/api/payments/subscription/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ days, reason }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ tone: 'error', text: data.error || 'Failed to pause subscription.' })
        return
      }
      setMsg({ tone: 'success', text: data.message })
      setPauseStatus({ paused: true, pause: data.pause })
    } catch {
      setMsg({ tone: 'error', text: 'Network error.' })
    } finally {
      setLoading(false)
    }
  }

  const handleResume = async () => {
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetch(`${API}/api/payments/subscription/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ tone: 'error', text: data.error || 'Failed to resume.' })
        return
      }
      setMsg({ tone: 'success', text: data.message })
      setPauseStatus({ paused: false, pause: null })
    } catch {
      setMsg({ tone: 'error', text: 'Network error.' })
    } finally {
      setLoading(false)
    }
  }

  if (statusLoading) return <p style={s.emptyText}>Checking pause status...</p>

  if (pauseStatus?.paused) {
    return (
      <div style={se.stack}>
        {msg && <Message tone={msg.tone}>{msg.text}</Message>}
        <Message tone="info">
          Your subscription is paused until {formatDate(pauseStatus.pause.resumeAt)}.
        </Message>
        <Button onClick={handleResume} disabled={loading}>
          {loading ? 'Resuming...' : 'Resume Now'}
        </Button>
      </div>
    )
  }

  return (
    <div style={se.stack}>
      {msg && <Message tone={msg.tone}>{msg.text}</Message>}
      <p style={se.desc}>
        Need a break? Pause your subscription for up to 30 days. You will keep access during the
        pause period, but billing will be paused.
      </p>
      <div style={se.fieldRow}>
        <div style={se.fieldGroup}>
          <label style={se.label}>Pause Duration</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={se.input}>
            {[7, 14, 21, 30].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </div>
        <div style={{ ...se.fieldGroup, flex: 2 }}>
          <label style={se.label}>Reason (optional)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Taking a study break..."
            style={se.input}
            maxLength={500}
          />
        </div>
      </div>
      <Button onClick={handlePause} disabled={loading} secondary>
        {loading ? 'Pausing...' : 'Pause Subscription'}
      </Button>
    </div>
  )
}

function RedeemSection() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  const handleRedeem = async (e) => {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) {
      setMsg({ tone: 'error', text: 'Please enter a code.' })
      return
    }
    setLoading(true)
    setMsg(null)
    try {
      // Try referral first, then gift
      const isGift = trimmed.startsWith('GIFT-')
      const endpoint = isGift
        ? `${API}/api/payments/gift/redeem`
        : `${API}/api/payments/referral/redeem`

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) {
        // If referral failed and it is not a GIFT code, try gift endpoint too
        if (!isGift) {
          const giftRes = await fetch(`${API}/api/payments/gift/redeem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ code: trimmed }),
          })
          const giftData = await giftRes.json()
          if (giftRes.ok) {
            setMsg({ tone: 'success', text: giftData.message })
            setCode('')
            return
          }
        }
        setMsg({ tone: 'error', text: data.error || 'Invalid code.' })
        return
      }
      setMsg({ tone: 'success', text: data.message })
      setCode('')
    } catch {
      setMsg({ tone: 'error', text: 'Network error. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleRedeem} style={se.stack}>
      {msg && <Message tone={msg.tone}>{msg.text}</Message>}
      <p style={se.desc}>
        Enter a referral code (SH-...) or gift code (GIFT-...) to redeem rewards.
      </p>
      <div style={se.row}>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="SH-XXXXXXXX or GIFT-XXXXXXXX"
          style={{ ...se.input, flex: 1 }}
          maxLength={20}
        />
        <Button type="submit" disabled={loading || !code.trim()}>
          {loading ? 'Redeeming...' : 'Redeem'}
        </Button>
      </div>
    </form>
  )
}

// ── Sprint E Styles ─────────────────────────────────────────────────────

const se = {
  stack: { display: 'flex', flexDirection: 'column', gap: 12 },
  row: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  fieldRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--sh-subtext)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  input: {
    padding: '9px 12px',
    fontSize: 14,
    border: '1px solid var(--sh-border)',
    borderRadius: 8,
    background: 'var(--sh-bg)',
    color: 'var(--sh-text)',
    fontFamily: FONT,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  hint: { fontSize: 12, color: 'var(--sh-muted)' },
  desc: { fontSize: 13, color: 'var(--sh-subtext)', margin: 0, lineHeight: 1.5 },
  offerRow: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  offerCard: {
    flex: 1,
    minWidth: 220,
    padding: 16,
    border: '1px solid var(--sh-border)',
    borderRadius: 12,
    background: 'var(--sh-bg)',
  },
  offerTitle: { fontSize: 15, fontWeight: 700, color: 'var(--sh-text)', margin: '0 0 6px' },
  offerDesc: { fontSize: 13, color: 'var(--sh-subtext)', margin: '0 0 12px', lineHeight: 1.5 },
  codeList: { display: 'flex', flexDirection: 'column', gap: 6 },
  codeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    background: 'var(--sh-bg)',
    border: '1px solid var(--sh-border)',
    borderRadius: 8,
    flexWrap: 'wrap',
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--sh-brand-accent)',
  },
  codeUses: { fontSize: 12, color: 'var(--sh-muted)' },
  smallBtn: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--sh-brand)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    fontFamily: FONT,
  },
  inactiveLabel: { fontSize: 12, color: 'var(--sh-muted)', fontStyle: 'italic' },
}

// ── Styles ───────────────────────────────────────────────────────────────

const s = {
  planRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 20,
    marginBottom: 16,
  },
  planImageCard: {
    flexShrink: 0,
    width: 80,
    height: 80,
    borderRadius: 14,
    overflow: 'hidden',
    border: '2px solid var(--sh-border)',
    background: 'var(--sh-bg)',
  },
  planImageThumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  planInfo: {
    flex: 1,
    minWidth: 0,
  },
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
    color: 'var(--sh-nav-text)',
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
    background: 'var(--sh-brand-accent)',
    color: 'var(--sh-nav-text)',
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
