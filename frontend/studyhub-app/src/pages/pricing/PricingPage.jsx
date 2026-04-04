import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'
import { fadeInUp, staggerEntrance, fadeInOnScroll } from '../../lib/animations'

const FONT = "'Plus Jakarta Sans', sans-serif"

const FAQ_ITEMS = [
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes, you can cancel your subscription anytime from your account settings. No long-term contracts or cancellation fees.',
  },
  {
    question: 'Is there a student discount?',
    answer:
      'The free tier is designed for students. Pro pricing is already student-friendly at $4.99/month. Verified .edu emails get an additional 20% off.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept all major credit and debit cards through Stripe. PayPal support coming soon.',
  },
  {
    question: 'Can my university get a bulk deal?',
    answer: 'Yes, contact us about Institution pricing with volume discounts for your campus.',
  },
  {
    question: 'Do I get a free trial?',
    answer: 'We offer a 7-day free trial for new Pro subscribers. Cancel anytime before it renews.',
  },
]

const FREE_FEATURES = [
  'Browse all study sheets',
  '10 uploads per month',
  '10 AI messages per day (Hub AI)',
  '30-minute video uploads',
  '50 library bookmarks',
  '2 private study groups',
  '3 playground projects',
]

const PRO_FEATURES = [
  'Everything in Free, plus:',
  'Unlimited uploads',
  '120 AI messages per day',
  'Upload PDFs and code to AI',
  '60-minute video uploads',
  '5 GB storage',
  'Unlimited library bookmarks',
  '10 private study groups',
  '25 playground projects',
  'Custom themes',
  'Priority support',
]

const INSTITUTION_FEATURES = [
  'Everything in Pro, plus:',
  '200 AI messages per day',
  'Upload files up to 50MB',
  'Unlimited study groups',
  'Unlimited playground projects',
  'LMS integration',
  'SSO support',
  'Org-wide analytics',
  'Dedicated support',
]

const DONATION_PRESETS = [3, 5, 10, 25, 50, 100]

// ── Main Page ────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, refreshSession } = useSession()
  const [subscription, setSubscription] = useState(null)
  const heroRef = useRef(null)
  const cardsRef = useRef(null)
  const lowerRef = useRef(null)

  const successFromUrl =
    searchParams.get('success') === 'true' || searchParams.get('payment') === 'success'

  useEffect(() => {
    if (successFromUrl) refreshSession()
  }, [successFromUrl, refreshSession])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${API}/api/payments/subscription`, { credentials: 'include' })
        if (res.ok && !cancelled) {
          const data = await res.json()
          if (data?.plan) setSubscription(data)
        }
      } catch (err) {
        console.error('[fetchSubscription]', err)
      }
    }
    load()
    return () => { cancelled = true }
  }, [user])

  // Animations
  useEffect(() => {
    if (heroRef.current) fadeInUp(heroRef.current.children, { y: 30 })
  }, [])

  useEffect(() => {
    if (cardsRef.current) {
      staggerEntrance(cardsRef.current.children, { staggerMs: 120, y: 24 })
    }
  }, [])

  useEffect(() => {
    if (lowerRef.current) fadeInOnScroll(lowerRef.current.children, { y: 20 })
  }, [])

  const effectivePlan = subscription?.plan && subscription.plan !== 'free'
    ? subscription.plan
    : (user?.plan && user.plan !== 'free' ? user.plan : 'free')
  const isSubscribed = effectivePlan !== 'free'
  const hasActivePro = isSubscribed &&
    ['active', 'trialing', 'past_due'].includes(subscription?.status || 'active')
  const isYearly = effectivePlan === 'pro_yearly'
  const isFreeUser = !hasActivePro

  const handleSubscribe = useCallback(async (plan) => {
    if (!user) { navigate('/login'); return }
    try {
      const res = await fetch(`${API}/api/payments/checkout/subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (res.ok && data.url) window.location.href = data.url
      else return data.error || 'Failed to start checkout.'
    } catch {
      return 'Network error. Please try again.'
    }
    return null
  }, [user, navigate])

  return (
    <div style={p.page}>
      <Navbar />

      {/* Success banner */}
      {successFromUrl && (
        <div style={p.successBanner}>
          <p style={p.successText}>
            Success! Your subscription is now active. Thank you for supporting StudyHub.
          </p>
        </div>
      )}

      {/* Hero */}
      <section style={p.hero}>
        <div style={p.heroInner} ref={heroRef}>
          <h1 style={p.heroH1}>StudyHub Pro</h1>
          <p style={p.heroSub}>
            Unlock the full power of collaborative studying.
          </p>
          {hasActivePro && (
            <div style={p.heroBadge}>
              <CheckIcon size={16} color="#ffffff" />
              <span>You are on Pro {isYearly ? '(Yearly)' : '(Monthly)'}</span>
            </div>
          )}
        </div>
      </section>

      {/* Your Plan summary (subscribed users only) */}
      {hasActivePro && (
        <section style={p.planSummarySection}>
          <div style={p.planSummaryCard}>
            <div style={p.planSummaryHeader}>
              <div>
                <h3 style={p.planSummaryTitle}>
                  {effectivePlan === 'pro_yearly' ? 'Pro Yearly' : 'Pro Monthly'}
                </h3>
                <StatusBadge status={subscription?.status} cancelAtEnd={subscription?.cancelAtPeriodEnd} />
              </div>
              {subscription?.currentPeriodEnd && (
                <p style={p.planSummaryDate}>
                  {subscription.cancelAtPeriodEnd ? 'Access until' : 'Renews'}{' '}
                  {formatDate(subscription.currentPeriodEnd)}
                </p>
              )}
            </div>
            <div style={p.planSummaryActions}>
              <a href="/settings?tab=subscription" style={p.manageLink}>
                Manage Subscription
              </a>
              <a href="/settings?tab=subscription" style={p.changeLink}>
                Change Plan
              </a>
            </div>
          </div>
        </section>
      )}

      {/* Plan comparison cards */}
      <section style={p.cardsSection}>
        <div style={p.cardsGrid} ref={cardsRef}>
          <PlanCard
            tier="free"
            isFreeUser={isFreeUser}
            hasActivePro={hasActivePro}
          />
          <PlanCard
            tier="pro"
            isFreeUser={isFreeUser}
            hasActivePro={hasActivePro}
            isYearly={isYearly}
            subscription={subscription}
            onSubscribe={handleSubscribe}
          />
          <PlanCard
            tier="institution"
            isFreeUser={isFreeUser}
            hasActivePro={hasActivePro}
          />
        </div>
      </section>

      <div ref={lowerRef}>
        {/* Special Offers (free users only) */}
        {isFreeUser && user && <SpecialOffersSection />}

        {/* Gift and Referral */}
        {user && <GiftReferralSection />}

        {/* Donation */}
        <DonationSection />

        {/* FAQ */}
        <section style={p.faqSection}>
          <div style={p.faqInner}>
            <h2 style={p.sectionTitle}>Frequently Asked Questions</h2>
            <div style={p.faqGrid}>
              {FAQ_ITEMS.map((item, i) => (
                <FaqItem key={i} question={item.question} answer={item.answer} />
              ))}
            </div>
          </div>
        </section>
      </div>

      <footer style={p.footer}>
        <p style={p.footerText}>Built by students, for students -- StudyHub</p>
      </footer>
    </div>
  )
}

// ── Plan Card ────────────────────────────────────────────────────────────

function PlanCard({ tier, isFreeUser, hasActivePro, isYearly, subscription, onSubscribe }) {
  const [subscribing, setSubscribing] = useState(null)
  const [error, setError] = useState('')
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistMsg, setWaitlistMsg] = useState('')
  const doSubscribe = async (plan) => {
    setError('')
    setSubscribing(plan)
    const err = await onSubscribe(plan)
    if (err) { setError(err); setSubscribing(null) }
  }

  const handleWaitlist = async (e) => {
    e.preventDefault()
    if (!waitlistEmail.trim()) return
    setWaitlistLoading(true)
    try {
      const res = await fetch(`${API}/api/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: waitlistEmail.trim(), tier: 'institution' }),
      })
      const data = await res.json()
      if (res.ok) { setWaitlistMsg(data.message || 'Joined the waitlist!'); setWaitlistEmail('') }
      else setError(data.error || 'Something went wrong.')
    } catch { setError('Network error.') }
    finally { setWaitlistLoading(false) }
  }

  if (tier === 'free') {
    return (
      <div style={{ ...c.card, ...(isFreeUser ? {} : { opacity: 0.65 }) }}>
        <span style={c.tierLabel}>Free</span>
        <div style={c.priceRow}>
          <span style={c.priceValue}>$0</span>
          <span style={c.pricePeriod}>/month</span>
        </div>
        <ul style={c.featureList}>
          {FREE_FEATURES.map((f) => <FeatureRow key={f} text={f} />)}
        </ul>
        {isFreeUser ? (
          <button style={c.btnOutlineDisabled} disabled>Current Plan</button>
        ) : (
          <p style={c.includedNote}>Included with your Pro subscription</p>
        )}
      </div>
    )
  }

  if (tier === 'pro') {
    return (
      <div style={{ ...c.card, ...c.cardFeatured }}>
        <div style={c.popularTag}>Most Popular</div>
        <span style={{ ...c.tierLabel, color: 'var(--sh-brand-accent)' }}>Pro</span>
        <div style={c.priceRow}>
          <span style={c.priceValue}>$4.99</span>
          <span style={c.pricePeriod}>/month</span>
        </div>
        <ul style={c.featureList}>
          {PRO_FEATURES.map((f) => <FeatureRow key={f} text={f} />)}
        </ul>
        {hasActivePro ? (
          <div style={c.subscribedGroup}>
            <div style={c.subscribedBanner}>
              <CheckIcon size={18} color="var(--sh-success)" />
              <span style={c.subscribedLabel}>
                Subscribed {isYearly ? '(Yearly)' : '(Monthly)'}
              </span>
            </div>
            {subscription?.currentPeriodEnd && (
              <p style={c.renewsLabel}>
                {subscription.cancelAtPeriodEnd ? 'Access until' : 'Renews'}{' '}
                {formatDate(subscription.currentPeriodEnd)}
              </p>
            )}
            <a href="/settings?tab=subscription" style={c.manageBtn}>Manage Subscription</a>
          </div>
        ) : (
          <div style={c.btnGroup}>
            <button
              style={c.btnPrimary}
              disabled={subscribing !== null}
              onClick={() => doSubscribe('pro_monthly')}
            >
              {subscribing === 'pro_monthly' ? 'Redirecting...' : 'Subscribe Monthly -- $4.99/mo'}
            </button>
            <button
              style={c.btnOutline}
              disabled={subscribing !== null}
              onClick={() => doSubscribe('pro_yearly')}
            >
              {subscribing === 'pro_yearly' ? 'Redirecting...' : 'Subscribe Yearly -- $49.99/yr (Save 17%)'}
            </button>
          </div>
        )}
        {error && <div style={c.errorMsg}>{error}</div>}
      </div>
    )
  }

  // Institution
  return (
    <div style={c.card}>
      <div style={c.comingSoonTag}>Coming Soon</div>
      <span style={{ ...c.tierLabel, color: 'var(--sh-brand)' }}>Institution</span>
      <div style={c.priceRow}>
        <span style={c.priceValue}>Custom</span>
        <span style={c.pricePeriod}>pricing</span>
      </div>
      <ul style={c.featureList}>
        {INSTITUTION_FEATURES.map((f) => <FeatureRow key={f} text={f} />)}
      </ul>
      {waitlistMsg ? (
        <div style={c.successMsg}>{waitlistMsg}</div>
      ) : (
        <form onSubmit={handleWaitlist} style={c.btnGroup}>
          <input
            type="email"
            placeholder="your@university.edu"
            value={waitlistEmail}
            onChange={(e) => setWaitlistEmail(e.target.value)}
            style={c.waitlistInput}
            disabled={waitlistLoading}
            required
          />
          <button type="submit" style={c.btnPrimary} disabled={waitlistLoading || !waitlistEmail.trim()}>
            {waitlistLoading ? 'Joining...' : 'Join Waitlist'}
          </button>
          {error && <div style={c.errorMsg}>{error}</div>}
        </form>
      )}
    </div>
  )
}

// ── Feature Row ──────────────────────────────────────────────────────────

function FeatureRow({ text }) {
  return (
    <li style={c.featureItem}>
      <CheckIcon size={18} color="var(--sh-success)" />
      <span style={c.featureText}>{text}</span>
    </li>
  )
}

// ── Status Badge ─────────────────────────────────────────────────────────

function StatusBadge({ status, cancelAtEnd }) {
  if (cancelAtEnd) return <span style={{ ...p.statusBadge, background: 'var(--sh-warning-bg)', color: 'var(--sh-warning-text)' }}>Canceling</span>
  if (status === 'trialing') return <span style={{ ...p.statusBadge, background: 'var(--sh-info-bg)', color: 'var(--sh-info-text)' }}>Trial</span>
  if (status === 'past_due') return <span style={{ ...p.statusBadge, background: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)' }}>Past Due</span>
  return <span style={{ ...p.statusBadge, background: 'var(--sh-success-bg)', color: 'var(--sh-success-text)' }}>Active</span>
}

// ── Special Offers ───────────────────────────────────────────────────────

function SpecialOffersSection() {
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
      if (!res.ok) { setMsg({ type: 'error', text: data.error || 'Failed to start trial.' }); return }
      window.location.href = data.url
    } catch { setMsg({ type: 'error', text: 'Network error. Please try again.' }) }
    finally { setTrialLoading(false) }
  }

  const applyDiscount = async () => {
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
      if (!res.ok) { setMsg({ type: 'error', text: data.error || 'Failed to apply discount.' }); return }
      window.location.href = data.url
    } catch { setMsg({ type: 'error', text: 'Network error. Please try again.' }) }
    finally { setStudentLoading(false) }
  }

  return (
    <section style={p.section}>
      <div style={p.sectionInner}>
        <h2 style={p.sectionTitle}>Special Offers</h2>
        {msg && <div style={msg.type === 'error' ? p.errorBox : p.successBox}>{msg.text}</div>}
        <div style={p.offerGrid}>
          <div style={p.offerCard}>
            <h3 style={p.offerTitle}>7-Day Free Trial</h3>
            <p style={p.offerDesc}>
              Try Pro free for 7 days. Cancel anytime before the trial ends and you will not be charged.
            </p>
            <button style={c.btnPrimary} onClick={startTrial} disabled={trialLoading}>
              {trialLoading ? 'Loading...' : 'Start Free Trial'}
            </button>
          </div>
          <div style={p.offerCard}>
            <h3 style={p.offerTitle}>Student Discount (20% off)</h3>
            <p style={p.offerDesc}>
              Have a verified .edu email? Get 20% off Pro for as long as you are subscribed.
            </p>
            <button style={c.btnOutline} onClick={applyDiscount} disabled={studentLoading}>
              {studentLoading ? 'Loading...' : 'Apply Student Discount'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Gift and Referral ────────────────────────────────────────────────────

function GiftReferralSection() {
  return (
    <section style={p.section}>
      <div style={p.sectionInner}>
        <h2 style={p.sectionTitle}>Gift, Refer, and Redeem</h2>
        <div style={p.giftGrid}>
          <GiftCard />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <ReferralCard />
            <RedeemCard />
          </div>
        </div>
      </div>
    </section>
  )
}

function GiftCard() {
  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState('pro_monthly')
  const [months, setMonths] = useState(1)
  const [giftMessage, setGiftMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  const handleGift = async (e) => {
    e.preventDefault()
    if (!email.trim()) { setMsg({ type: 'error', text: 'Recipient email is required.' }); return }
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetch(`${API}/api/payments/gift/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ recipientEmail: email.trim(), plan, durationMonths: months, message: giftMessage }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg({ type: 'error', text: data.error || 'Failed to create gift checkout.' }); return }
      window.location.href = data.url
    } catch { setMsg({ type: 'error', text: 'Network error. Please try again.' }) }
    finally { setLoading(false) }
  }

  return (
    <div style={p.subCard}>
      <h3 style={p.subCardTitle}>Gift a Subscription</h3>
      <p style={p.subCardDesc}>Give the gift of Pro to a friend.</p>
      {msg && <div style={msg.type === 'error' ? p.errorBox : p.successBox}>{msg.text}</div>}
      <form onSubmit={handleGift} style={p.formStack}>
        <div style={p.fieldGroup}>
          <label style={p.label}>Recipient Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" style={p.input} required />
        </div>
        <div style={p.fieldRow}>
          <div style={p.fieldGroup}>
            <label style={p.label}>Plan</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} style={p.input}>
              <option value="pro_monthly">Pro Monthly</option>
              <option value="pro_yearly">Pro Yearly</option>
            </select>
          </div>
          <div style={p.fieldGroup}>
            <label style={p.label}>Duration</label>
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))} style={p.input}>
              {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
            </select>
          </div>
        </div>
        <div style={p.fieldGroup}>
          <label style={p.label}>Personal Message (optional)</label>
          <textarea value={giftMessage} onChange={(e) => setGiftMessage(e.target.value)} placeholder="Enjoy StudyHub Pro!" style={{ ...p.input, minHeight: 56, resize: 'vertical' }} maxLength={500} />
        </div>
        <button type="submit" style={c.btnPrimary} disabled={loading}>
          {loading ? 'Processing...' : 'Purchase Gift'}
        </button>
      </form>
    </div>
  )
}

function ReferralCard() {
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
        if (res.ok && !cancelled) { const data = await res.json(); setCodes(data.codes || []) }
      } catch { /* silent */ }
      finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
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
      if (!res.ok) { setMsg({ type: 'error', text: data.error || 'Failed to create code.' }); return }
      setCodes((prev) => [data, ...prev])
      setMsg({ type: 'success', text: 'Referral code created.' })
    } catch { setMsg({ type: 'error', text: 'Network error.' }) }
    finally { setCreating(false) }
  }

  const deactivateCode = async (id) => {
    try {
      const res = await fetch(`${API}/api/payments/referral/${id}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) setCodes((prev) => prev.map((co) => co.id === id ? { ...co, active: false } : co))
    } catch { /* silent */ }
  }

  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code)
      setTimeout(() => setCopied(null), 2000)
    }).catch(() => {})
  }

  return (
    <div style={p.subCard}>
      <h3 style={p.subCardTitle}>Referral Codes</h3>
      <p style={p.subCardDesc}>Share your code and earn rewards when friends join.</p>
      {msg && <div style={msg.type === 'error' ? p.errorBox : p.successBox}>{msg.text}</div>}
      {loading ? (
        <p style={p.muted}>Loading referral codes...</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button style={c.btnOutline} onClick={createCode} disabled={creating || codes.filter((co) => co.active).length >= 5}>
              {creating ? 'Creating...' : 'Create Referral Code'}
            </button>
            <span style={p.muted}>{codes.filter((co) => co.active).length}/5 active codes</span>
          </div>
          {codes.length > 0 && (
            <div style={p.codeList}>
              {codes.map((co) => (
                <div key={co.id} style={{ ...p.codeRow, opacity: co.active ? 1 : 0.5 }}>
                  <span style={p.codeText}>{co.code}</span>
                  <span style={p.muted}>{co.currentUses} use{co.currentUses !== 1 ? 's' : ''}</span>
                  {co.active && (
                    <>
                      <button style={p.smallBtn} onClick={() => copyCode(co.code)}>
                        {copied === co.code ? 'Copied' : 'Copy'}
                      </button>
                      <button style={{ ...p.smallBtn, color: 'var(--sh-danger)' }} onClick={() => deactivateCode(co.id)}>
                        Deactivate
                      </button>
                    </>
                  )}
                  {!co.active && <span style={{ ...p.muted, fontStyle: 'italic' }}>Inactive</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function RedeemCard() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  const handleRedeem = async (e) => {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) { setMsg({ type: 'error', text: 'Please enter a code.' }); return }
    setLoading(true)
    setMsg(null)
    try {
      const isGift = trimmed.startsWith('GIFT-')
      const endpoint = isGift ? `${API}/api/payments/gift/redeem` : `${API}/api/payments/referral/redeem`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (!isGift) {
          const giftRes = await fetch(`${API}/api/payments/gift/redeem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ code: trimmed }),
          })
          const giftData = await giftRes.json()
          if (giftRes.ok) { setMsg({ type: 'success', text: giftData.message }); setCode(''); return }
        }
        setMsg({ type: 'error', text: data.error || 'Invalid code.' })
        return
      }
      setMsg({ type: 'success', text: data.message })
      setCode('')
    } catch { setMsg({ type: 'error', text: 'Network error. Please try again.' }) }
    finally { setLoading(false) }
  }

  return (
    <div style={p.subCard}>
      <h3 style={p.subCardTitle}>Redeem a Code</h3>
      <p style={p.subCardDesc}>Enter a referral code (SH-...) or gift code (GIFT-...) to redeem rewards.</p>
      {msg && <div style={msg.type === 'error' ? p.errorBox : p.successBox}>{msg.text}</div>}
      <form onSubmit={handleRedeem} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="SH-XXXXXXXX or GIFT-XXXXXXXX"
          style={{ ...p.input, flex: 1, minWidth: 180 }}
          maxLength={20}
        />
        <button type="submit" style={c.btnPrimary} disabled={loading || !code.trim()}>
          {loading ? 'Redeeming...' : 'Redeem'}
        </button>
      </form>
    </div>
  )
}

// ── Donation Section ─────────────────────────────────────────────────────

function DonationSection() {
  const { user } = useSession()
  const navigate = useNavigate()
  const [amount, setAmount] = useState(10)
  const [message, setMessage] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleDonate = async () => {
    setError('')
    if (!user) { navigate('/login'); return }
    if (amount < 1 || amount > 1000) { setError('Amount must be between $1 and $1,000.'); return }
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/payments/checkout/donation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount, message: message.trim() || '', anonymous }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to start donation checkout.'); setLoading(false); return }
      if (data.url) window.location.href = data.url
      else { setError('No checkout URL received.'); setLoading(false) }
    } catch { setError('Network error. Please try again.'); setLoading(false) }
  }

  return (
    <section style={d.section}>
      <div style={d.inner}>
        <h2 style={d.title}>Support StudyHub</h2>
        <p style={d.subtitle}>
          StudyHub is built by students, for students. Your donation helps us keep the platform free and accessible.
        </p>
        <div style={d.presetRow}>
          {DONATION_PRESETS.map((preset) => (
            <button
              key={preset}
              style={{ ...d.presetBtn, ...(amount === preset ? d.presetActive : {}) }}
              onClick={() => setAmount(preset)}
            >
              ${preset}
            </button>
          ))}
        </div>
        <div style={d.customRow}>
          <label style={d.customLabel}>Custom amount</label>
          <div style={d.customWrap}>
            <span style={d.dollar}>$</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={amount}
              onChange={(e) => { const v = Number(e.target.value); if (v >= 0 && v <= 1000) setAmount(v) }}
              style={d.customInput}
            />
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Leave a message (optional, shown on supporters page)"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 200))}
            maxLength={200}
            style={d.messageInput}
          />
        </div>
        <label style={d.anonLabel}>
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} style={d.anonCheck} />
          <span style={d.anonText}>Donate anonymously</span>
        </label>
        <button style={d.donateBtn} onClick={handleDonate} disabled={loading || amount < 1}>
          {loading ? 'Redirecting to checkout...' : `Donate $${amount}`}
        </button>
        {error && <div style={d.error}>{error}</div>}
        <p style={d.footnote}>
          Donations are processed securely through Stripe. All donors are featured on our supporters page.
        </p>
      </div>
    </section>
  )
}

// ── FAQ Item ─────────────────────────────────────────────────────────────

function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false)

  return (
    <details style={p.faqItem} open={open}>
      <summary
        style={p.faqSummary}
        onClick={(e) => { e.preventDefault(); setOpen(!open) }}
      >
        <span>{question}</span>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease-out', color: 'var(--sh-muted)' }}>
          <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" fill="currentColor" />
        </svg>
      </summary>
      <p style={p.faqAnswer}>{answer}</p>
    </details>
  )
}

// ── Icons ────────────────────────────────────────────────────────────────

function CheckIcon({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        fill={color}
      />
    </svg>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '--'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ── Styles: Page ─────────────────────────────────────────────────────────

const p = {
  page: {
    minHeight: '100vh',
    fontFamily: FONT,
    background: 'var(--sh-bg)',
    color: 'var(--sh-text)',
  },
  successBanner: {
    background: 'var(--sh-success-bg)',
    borderBottom: '1px solid var(--sh-success-border)',
    padding: '14px 20px',
    textAlign: 'center',
  },
  successText: {
    color: 'var(--sh-success-text)',
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
  },

  // Hero
  hero: {
    background: 'linear-gradient(135deg, var(--sh-brand), var(--sh-brand-accent))',
    padding: '100px 20px 80px',
    textAlign: 'center',
  },
  heroInner: { maxWidth: 720, margin: '0 auto' },
  heroH1: {
    fontSize: 'clamp(32px, 5vw, 56px)',
    fontWeight: 800,
    color: '#ffffff',
    margin: '0 0 12px',
    lineHeight: 1.15,
    letterSpacing: '-0.02em',
  },
  heroSub: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.85)',
    margin: '0 0 24px',
    lineHeight: 1.6,
  },
  heroBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(255, 255, 255, 0.2)',
    backdropFilter: 'blur(8px)',
    padding: '8px 20px',
    borderRadius: 'var(--radius-full)',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 700,
  },

  // Plan summary
  planSummarySection: { padding: '0 20px', marginTop: -40, position: 'relative', zIndex: 2 },
  planSummaryCard: {
    maxWidth: 600,
    margin: '0 auto',
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    padding: '20px 24px',
    boxShadow: 'var(--shadow-md)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  planSummaryHeader: { display: 'flex', flexDirection: 'column', gap: 6 },
  planSummaryTitle: { fontSize: 18, fontWeight: 700, color: 'var(--sh-heading)', margin: 0 },
  planSummaryDate: { fontSize: 13, color: 'var(--sh-subtext)', margin: 0 },
  planSummaryActions: { display: 'flex', gap: 16, alignItems: 'center' },
  statusBadge: {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 700,
    padding: '3px 10px',
    borderRadius: 6,
    marginTop: 4,
  },
  manageLink: {
    color: 'var(--sh-brand)',
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
  },
  changeLink: {
    color: 'var(--sh-subtext)',
    fontSize: 13,
    fontWeight: 500,
    textDecoration: 'none',
  },

  // Cards section
  cardsSection: { padding: '60px 20px' },
  cardsGrid: {
    maxWidth: 1100,
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 28,
    alignItems: 'start',
  },

  // Sections
  section: { padding: '60px 20px' },
  sectionInner: { maxWidth: 960, margin: '0 auto' },
  sectionTitle: {
    fontSize: 'clamp(22px, 3vw, 32px)',
    fontWeight: 700,
    color: 'var(--sh-heading)',
    margin: '0 0 32px',
    textAlign: 'center',
  },

  // Offers
  offerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 20,
  },
  offerCard: {
    padding: 24,
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  offerTitle: { fontSize: 16, fontWeight: 700, color: 'var(--sh-heading)', margin: 0 },
  offerDesc: { fontSize: 13, color: 'var(--sh-subtext)', margin: 0, lineHeight: 1.6 },

  // Gift/Referral grid
  giftGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 24,
    alignItems: 'start',
  },
  subCard: {
    padding: 24,
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  subCardTitle: { fontSize: 16, fontWeight: 700, color: 'var(--sh-heading)', margin: 0 },
  subCardDesc: { fontSize: 13, color: 'var(--sh-subtext)', margin: 0, lineHeight: 1.5 },

  // Forms
  formStack: { display: 'flex', flexDirection: 'column', gap: 12 },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 },
  fieldRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
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
  muted: { fontSize: 12, color: 'var(--sh-muted)', margin: 0 },

  // Codes
  codeList: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 },
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
  codeText: { fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: 'var(--sh-brand-accent)' },
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

  // Messages
  errorBox: {
    background: 'var(--sh-danger-bg)',
    color: 'var(--sh-danger-text)',
    border: '1px solid var(--sh-danger-border)',
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: 13,
  },
  successBox: {
    background: 'var(--sh-success-bg)',
    color: 'var(--sh-success-text)',
    border: '1px solid var(--sh-success-border)',
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: 13,
  },

  // FAQ
  faqSection: { background: 'var(--sh-surface)', padding: '60px 20px' },
  faqInner: { maxWidth: 720, margin: '0 auto' },
  faqGrid: { display: 'grid', gap: 12 },
  faqItem: {
    background: 'var(--sh-bg)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
  },
  faqSummary: {
    padding: '16px 20px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--sh-text)',
    userSelect: 'none',
    listStyleType: 'none',
  },
  faqAnswer: {
    padding: '0 20px 16px',
    margin: 0,
    color: 'var(--sh-subtext)',
    fontSize: 14,
    lineHeight: 1.7,
  },

  // Footer
  footer: {
    background: 'var(--sh-slate-900)',
    padding: '32px 20px',
    textAlign: 'center',
  },
  footerText: { color: 'var(--sh-slate-500)', fontSize: 12, margin: 0 },
}

// ── Styles: Cards ────────────────────────────────────────────────────────

const c = {
  card: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-lg)',
    padding: '32px 28px',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  },
  cardFeatured: {
    boxShadow: 'var(--shadow-lg)',
    border: '2px solid var(--sh-brand-accent)',
  },
  popularTag: {
    position: 'absolute',
    top: -12,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--sh-brand-accent)',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 700,
    padding: '5px 16px',
    borderRadius: 'var(--radius-full)',
    whiteSpace: 'nowrap',
  },
  comingSoonTag: {
    position: 'absolute',
    top: 16,
    right: 16,
    background: 'var(--sh-brand-soft)',
    color: 'var(--sh-brand)',
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 12px',
    borderRadius: 6,
  },
  tierLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--sh-subtext)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 8,
  },
  priceRow: { display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 24 },
  priceValue: { fontSize: 44, fontWeight: 800, color: 'var(--sh-heading)', lineHeight: 1 },
  pricePeriod: { fontSize: 15, color: 'var(--sh-muted)', fontWeight: 500 },
  featureList: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 28px',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  featureItem: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  featureText: { fontSize: 14, color: 'var(--sh-text)', lineHeight: 1.5 },
  btnGroup: { display: 'flex', flexDirection: 'column', gap: 10 },
  btnPrimary: {
    background: 'var(--sh-brand-accent)',
    color: '#ffffff',
    border: 'none',
    padding: '12px 24px',
    borderRadius: 'var(--radius-control)',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: FONT,
    transition: 'opacity 0.15s',
    width: '100%',
    textAlign: 'center',
  },
  btnOutline: {
    background: 'transparent',
    color: 'var(--sh-brand-accent)',
    border: '2px solid var(--sh-brand-accent)',
    padding: '10px 24px',
    borderRadius: 'var(--radius-control)',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: FONT,
    transition: 'all 0.15s',
    width: '100%',
    textAlign: 'center',
  },
  btnOutlineDisabled: {
    background: 'var(--sh-soft)',
    color: 'var(--sh-muted)',
    border: 'none',
    padding: '12px 24px',
    borderRadius: 'var(--radius-control)',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'default',
    fontFamily: FONT,
    width: '100%',
  },
  subscribedGroup: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' },
  subscribedBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    background: 'var(--sh-success-bg)',
    border: '1px solid var(--sh-success-border)',
    borderRadius: 'var(--radius)',
    width: '100%',
    justifyContent: 'center',
  },
  subscribedLabel: { fontSize: 14, fontWeight: 700, color: 'var(--sh-success-text)' },
  renewsLabel: { fontSize: 13, color: 'var(--sh-subtext)', margin: 0 },
  manageBtn: {
    color: 'var(--sh-brand-accent)',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
  },
  includedNote: {
    fontSize: 13,
    color: 'var(--sh-muted)',
    textAlign: 'center',
    margin: 0,
    fontStyle: 'italic',
  },
  waitlistInput: {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid var(--sh-border)',
    fontSize: 14,
    fontFamily: FONT,
    background: 'var(--sh-bg)',
    color: 'var(--sh-text)',
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  },
  errorMsg: {
    background: 'var(--sh-danger-bg)',
    color: 'var(--sh-danger-text)',
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 13,
    textAlign: 'center',
  },
  successMsg: {
    background: 'var(--sh-success-bg)',
    color: 'var(--sh-success-text)',
    padding: '12px 14px',
    borderRadius: 8,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: 500,
  },
}

// ── Styles: Donation ─────────────────────────────────────────────────────

const d = {
  section: {
    background: 'linear-gradient(135deg, var(--sh-brand), var(--sh-brand-accent))',
    padding: '60px 20px',
  },
  inner: { maxWidth: 520, margin: '0 auto', textAlign: 'center' },
  title: {
    fontSize: 'clamp(22px, 3vw, 32px)',
    fontWeight: 700,
    color: '#ffffff',
    margin: '0 0 10px',
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    margin: '0 0 28px',
    lineHeight: 1.6,
  },
  presetRow: {
    display: 'flex',
    gap: 8,
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  presetBtn: {
    background: 'rgba(255, 255, 255, 0.15)',
    color: '#ffffff',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    padding: '8px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: FONT,
    transition: 'all 0.15s',
    minWidth: 56,
  },
  presetActive: {
    background: '#ffffff',
    color: 'var(--sh-brand-accent)',
    borderColor: '#ffffff',
  },
  customRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
  },
  customLabel: { fontSize: 13, color: 'rgba(255, 255, 255, 0.8)', fontWeight: 600 },
  customWrap: {
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    padding: '0 12px',
    border: '1px solid rgba(255, 255, 255, 0.3)',
  },
  dollar: { color: '#ffffff', fontWeight: 700, fontSize: 15, marginRight: 4 },
  customInput: {
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 600,
    width: 72,
    padding: '8px 0',
    fontFamily: FONT,
    outline: 'none',
  },
  messageInput: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid rgba(255, 255, 255, 0.3)',
    background: 'rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    fontSize: 14,
    fontFamily: FONT,
    outline: 'none',
    boxSizing: 'border-box',
  },
  anonLabel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
    cursor: 'pointer',
  },
  anonCheck: { width: 16, height: 16, accentColor: '#ffffff', cursor: 'pointer' },
  anonText: { fontSize: 13, color: 'rgba(255, 255, 255, 0.85)', fontWeight: 500 },
  donateBtn: {
    background: '#ffffff',
    color: 'var(--sh-brand-accent)',
    border: 'none',
    padding: '12px 36px',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 16,
    cursor: 'pointer',
    fontFamily: FONT,
    transition: 'opacity 0.15s',
    marginBottom: 14,
    width: '100%',
    maxWidth: 300,
  },
  error: {
    background: 'rgba(239, 68, 68, 0.2)',
    color: '#fecaca',
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 12,
  },
  footnote: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    margin: 0,
    lineHeight: 1.5,
  },
}
