import { useState } from 'react'
import Navbar from '../../components/navbar/Navbar'
import { API } from '../../config'

const FAQ_ITEMS = [
  {
    question: 'What happens when Pro launches?',
    answer: 'You will be notified by email and get early access pricing.'
  },
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes, no long-term contracts.'
  },
  {
    question: 'Is there a student discount?',
    answer: 'The free tier is designed for students. Pro pricing is already student-friendly.'
  },
  {
    question: 'What payment methods will you accept?',
    answer: 'Credit/debit cards and PayPal at launch.'
  },
  {
    question: 'Can my university get a bulk deal?',
    answer: 'Yes, contact us about Institution pricing.'
  },
]

export default function PricingPage() {
  return (
    <div style={s.page}>
      <Navbar />

      {/* ── HERO ─────────────────────────────────────── */}
      <section style={s.hero}>
        <div style={s.heroInner}>
          <h1 style={s.heroH1}>Choose Your Plan</h1>
          <p style={s.heroSub}>Unlock the full power of StudyHub</p>
        </div>
      </section>

      {/* ── PRICING CARDS ────────────────────────────── */}
      <section style={s.cardsSection}>
        <div style={s.cardsContainer}>
          <PricingCard tier="free" />
          <PricingCard tier="pro" />
          <PricingCard tier="institution" />
        </div>
      </section>

      {/* ── FAQ SECTION ──────────────────────────────── */}
      <section style={s.faqSection}>
        <div style={s.faqInner}>
          <h2 style={s.faqTitle}>Frequently Asked Questions</h2>
          <div style={s.faqGrid}>
            {FAQ_ITEMS.map((item, i) => (
              <FaqItem key={i} question={item.question} answer={item.answer} />
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────── */}
      <footer style={s.footer}>
        <p style={s.footerCopy}>Built by students, for students · StudyHub · Open Source</p>
      </footer>
    </div>
  )
}

function PricingCard({ tier }) {
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistMessage, setWaitlistMessage] = useState('')
  const [waitlistError, setWaitlistError] = useState('')

  const handleWaitlistSubmit = async (e, tierName) => {
    e.preventDefault()
    if (!waitlistEmail.trim()) return

    setWaitlistLoading(true)
    setWaitlistError('')
    setWaitlistMessage('')

    try {
      const res = await fetch(`${API}/api/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: waitlistEmail.trim(), tier: tierName }),
      })

      const data = await res.json()

      if (!res.ok) {
        setWaitlistError(data.error || 'Something went wrong.')
        return
      }

      setWaitlistMessage(data.message || 'Successfully joined the waitlist!')
      setWaitlistEmail('')
    } catch (err) {
      console.error('[waitlist]', err)
      setWaitlistError('Network error. Please try again.')
    } finally {
      setWaitlistLoading(false)
    }
  }

  if (tier === 'free') {
    return (
      <div style={s.card}>
        <div style={s.badgeRow}>
          <span style={s.badge}>Free</span>
        </div>
        <div style={s.priceBlock}>
          <div style={s.price}>$0</div>
          <div style={s.period}>/month</div>
        </div>
        <div style={s.featureList}>
          <Feature text="Browse all study sheets" included />
          <Feature text="10 uploads per month" included />
          <Feature text="10 AI messages per day (Hub AI)" included />
          <Feature text="50 library bookmarks" included />
          <Feature text="2 private study groups" included />
          <Feature text="3 playground projects" included />
        </div>
        <button style={s.ctaDisabled} disabled>
          Current Plan
        </button>
      </div>
    )
  }

  if (tier === 'pro') {
    return (
      <div style={{ ...s.card, ...s.cardElevated }}>
        <div style={s.ribbonContainer}>
          <div style={s.ribbon}>Coming Soon</div>
        </div>
        <div style={s.badgeRow}>
          <span style={{ ...s.badge, ...s.badgePro }}>Pro</span>
        </div>
        <div style={s.priceBlock}>
          <div style={s.price}>$4.99</div>
          <div style={s.period}>/month</div>
        </div>
        <div style={s.featureList}>
          <Feature text="Everything in Free, plus:" included />
          <Feature text="Unlimited uploads" included />
          <Feature text="100 AI messages per day" included />
          <Feature text="Upload PDFs and code to AI" included />
          <Feature text="Unlimited library bookmarks" included />
          <Feature text="10 private study groups" included />
          <Feature text="25 playground projects" included />
          <Feature text="Custom themes" included />
          <Feature text="Priority support" included />
        </div>

        {waitlistMessage ? (
          <div style={s.successMessage}>{waitlistMessage}</div>
        ) : (
          <form onSubmit={(e) => handleWaitlistSubmit(e, 'pro')} style={s.waitlistForm}>
            <input
              type="email"
              placeholder="your@email.com"
              value={waitlistEmail}
              onChange={(e) => setWaitlistEmail(e.target.value)}
              style={s.waitlistInput}
              disabled={waitlistLoading}
              required
            />
            <button
              type="submit"
              style={s.ctaPrimary}
              disabled={waitlistLoading || !waitlistEmail.trim()}
            >
              {waitlistLoading ? 'Joining...' : 'Join Waitlist'}
            </button>
            {waitlistError && <div style={s.errorMessage}>{waitlistError}</div>}
          </form>
        )}
      </div>
    )
  }

  if (tier === 'institution') {
    return (
      <div style={s.card}>
        <div style={s.ribbonContainer}>
          <div style={s.ribbon}>Coming Soon</div>
        </div>
        <div style={s.badgeRow}>
          <span style={{ ...s.badge, ...s.badgeInstitution }}>Institution</span>
        </div>
        <div style={s.priceBlock}>
          <div style={s.price}>Contact Us</div>
          <div style={s.period}></div>
        </div>
        <div style={s.featureList}>
          <Feature text="Everything in Pro, plus:" included />
          <Feature text="200 AI messages per day" included />
          <Feature text="Upload files up to 50MB" included />
          <Feature text="Unlimited study groups" included />
          <Feature text="Unlimited playground projects" included />
          <Feature text="LMS integration" included />
          <Feature text="SSO support" included />
          <Feature text="Org-wide analytics" included />
          <Feature text="Dedicated support" included />
        </div>

        {waitlistMessage ? (
          <div style={s.successMessage}>{waitlistMessage}</div>
        ) : (
          <form onSubmit={(e) => handleWaitlistSubmit(e, 'institution')} style={s.waitlistForm}>
            <input
              type="email"
              placeholder="your@email.com"
              value={waitlistEmail}
              onChange={(e) => setWaitlistEmail(e.target.value)}
              style={s.waitlistInput}
              disabled={waitlistLoading}
              required
            />
            <button
              type="submit"
              style={s.ctaPrimary}
              disabled={waitlistLoading || !waitlistEmail.trim()}
            >
              {waitlistLoading ? 'Joining...' : 'Join Waitlist'}
            </button>
            {waitlistError && <div style={s.errorMessage}>{waitlistError}</div>}
          </form>
        )}
      </div>
    )
  }
}

function Feature({ text, included }) {
  return (
    <div style={s.featureRow}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        style={{ ...s.featureIcon, color: included ? '#059669' : 'var(--sh-border)' }}
      >
        <path
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          fill="currentColor"
        />
      </svg>
      <span style={{ ...s.featureText, color: included ? 'var(--sh-text)' : 'var(--sh-muted)' }}>
        {text}
      </span>
    </div>
  )
}

function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false)

  return (
    <details style={s.faqItem} open={open}>
      <summary
        style={s.faqSummary}
        onClick={(e) => {
          e.preventDefault()
          setOpen(!open)
        }}
      >
        <span>{question}</span>
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          style={{
            ...s.faqChevron,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease-out',
          }}
        >
          <path
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            fill="currentColor"
          />
        </svg>
      </summary>
      <p style={s.faqAnswer}>{answer}</p>
    </details>
  )
}

const s = {
  page: {
    minHeight: '100vh',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    background: 'var(--sh-surface)',
    color: 'var(--sh-text)',
  },
  hero: {
    background: 'linear-gradient(135deg, #6d28d9 0%, #3b82f6 100%)',
    padding: '100px 20px 80px',
  },
  heroInner: {
    maxWidth: 720,
    margin: '0 auto',
    textAlign: 'center',
  },
  heroH1: {
    fontSize: 'clamp(32px, 5vw, 52px)',
    fontWeight: 'bold',
    color: '#ffffff',
    margin: '0 0 16px',
    lineHeight: 1.2,
  },
  heroSub: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.85)',
    margin: 0,
    lineHeight: 1.6,
  },
  cardsSection: {
    padding: '80px 20px',
  },
  cardsContainer: {
    maxWidth: 1200,
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 32,
  },
  card: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 20,
    padding: 32,
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  },
  cardElevated: {
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)',
    borderTopWidth: 4,
    borderTopColor: '#6d28d9',
  },
  ribbonContainer: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  ribbon: {
    background: '#6d28d9',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
    padding: '6px 14px',
    borderRadius: 6,
    transform: 'rotate(0deg)',
    whiteSpace: 'nowrap',
  },
  badgeRow: {
    marginBottom: 20,
  },
  badge: {
    display: 'inline-block',
    background: 'var(--sh-soft)',
    color: 'var(--sh-text)',
    fontSize: 12,
    fontWeight: 'bold',
    padding: '6px 14px',
    borderRadius: 8,
  },
  badgePro: {
    background: '#ddd6fe',
    color: '#6d28d9',
  },
  badgeInstitution: {
    background: '#dbeafe',
    color: '#3b82f6',
  },
  priceBlock: {
    marginBottom: 32,
  },
  price: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'var(--sh-heading)',
    margin: 0,
  },
  period: {
    fontSize: 16,
    color: 'var(--sh-muted)',
    margin: '4px 0 0',
  },
  featureList: {
    flex: 1,
    marginBottom: 32,
  },
  featureRow: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 12,
    fontSize: 14,
  },
  featureIcon: {
    flexShrink: 0,
    marginTop: 2,
  },
  featureText: {
    lineHeight: 1.5,
  },
  ctaPrimary: {
    background: '#6d28d9',
    color: '#ffffff',
    border: 'none',
    padding: '12px 24px',
    borderRadius: 10,
    fontWeight: 'bold',
    fontSize: 15,
    cursor: 'pointer',
    width: '100%',
    transition: 'background 0.2s ease-out',
  },
  ctaDisabled: {
    background: 'var(--sh-soft)',
    color: 'var(--sh-muted)',
    border: 'none',
    padding: '12px 24px',
    borderRadius: 10,
    fontWeight: 'bold',
    fontSize: 15,
    cursor: 'default',
    width: '100%',
  },
  waitlistForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  waitlistInput: {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid var(--sh-border)',
    fontSize: 14,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    background: 'var(--sh-surface)',
    color: 'var(--sh-text)',
  },
  successMessage: {
    background: '#dcfce7',
    color: '#166534',
    padding: '12px 14px',
    borderRadius: 8,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: 500,
  },
  errorMessage: {
    background: '#fee2e2',
    color: '#991b1b',
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 13,
    textAlign: 'center',
  },
  faqSection: {
    background: 'var(--sh-bg)',
    padding: '80px 20px',
  },
  faqInner: {
    maxWidth: 800,
    margin: '0 auto',
  },
  faqTitle: {
    fontSize: 'clamp(24px, 3vw, 36px)',
    fontWeight: 'bold',
    color: 'var(--sh-heading)',
    margin: '0 0 48px',
    textAlign: 'center',
  },
  faqGrid: {
    display: 'grid',
    gap: 16,
  },
  faqItem: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  faqSummary: {
    padding: 20,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    fontSize: 15,
    fontWeight: '600',
    color: 'var(--sh-text)',
    userSelect: 'none',
    listStyleType: 'none',
  },
  faqChevron: {
    color: 'var(--sh-muted)',
    flexShrink: 0,
  },
  faqAnswer: {
    padding: '0 20px 20px',
    margin: 0,
    color: 'var(--sh-subtext)',
    fontSize: 14,
    lineHeight: 1.7,
  },
  footer: {
    background: '#0f172a',
    padding: '40px 20px',
    textAlign: 'center',
  },
  footerCopy: {
    color: '#475569',
    fontSize: 12,
    margin: 0,
  },
}
