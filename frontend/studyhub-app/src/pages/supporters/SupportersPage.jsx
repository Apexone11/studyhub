import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import UserAvatar from '../../components/UserAvatar'
import { API } from '../../config'

// ── Inject premium keyframe animations ──────────────────────────────────

function useInjectedStyles() {
  useEffect(() => {
    const STYLE_ID = 'supporters-premium-styles'
    if (document.getElementById(STYLE_ID)) return

    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      @keyframes gradientShift {
        0%   { background-position: 0% 50%; }
        50%  { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @keyframes float {
        0%, 100% { transform: translateY(0); }
        50%      { transform: translateY(-20px); }
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50%      { opacity: 0.7; }
      }
      @keyframes shimmer {
        0%   { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      @keyframes pulseGlow {
        0%, 100% { box-shadow: var(--sh-premium-glow); }
        50%      { box-shadow: var(--sh-premium-glow-strong); }
      }
      @keyframes goldPulse {
        0%, 100% { box-shadow: var(--sh-metal-gold-glow); }
        50%      { box-shadow: var(--sh-metal-gold-glow-strong); }
      }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0s !important;
          transition-duration: 0s !important;
        }
      }
    `
    document.head.appendChild(style)

    return () => {
      const existing = document.getElementById(STYLE_ID)
      if (existing) existing.remove()
    }
  }, [])
}

// ── Particle configuration ──────────────────────────────────────────────

const PARTICLES = [
  { top: '12%', left: '8%', size: 6, opacity: 0.2, duration: '6s', delay: '0s' },
  { top: '22%', right: '12%', size: 4, opacity: 0.15, duration: '7s', delay: '1s' },
  { top: '60%', left: '15%', size: 8, opacity: 0.1, duration: '5s', delay: '0.5s' },
  { top: '45%', right: '20%', size: 5, opacity: 0.25, duration: '8s', delay: '2s' },
  { top: '75%', left: '30%', size: 4, opacity: 0.3, duration: '4s', delay: '1.5s' },
  { top: '35%', right: '35%', size: 7, opacity: 0.12, duration: '6.5s', delay: '0.8s' },
  { top: '80%', right: '10%', size: 5, opacity: 0.18, duration: '7.5s', delay: '3s' },
  { top: '15%', left: '50%', size: 6, opacity: 0.22, duration: '5.5s', delay: '2.5s' },
]

// ── Main Component ───────────────────────────────────────────────────────

export default function SupportersPage() {
  useInjectedStyles()

  const [searchParams, setSearchParams] = useSearchParams()
  const [donors, setDonors] = useState([])
  const [anonymousSupport, setAnonymousSupport] = useState({ donorCount: 0, totalAmount: 0 })
  const [subscribers, setSubscribers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const paymentStatus = searchParams.get('payment')

  /* Clear payment query param after showing banner */
  useEffect(() => {
    if (paymentStatus) {
      const timer = setTimeout(() => {
        setSearchParams({}, { replace: true })
      }, 8000)
      return () => clearTimeout(timer)
    }
  }, [paymentStatus, setSearchParams])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [donorsRes, subsRes] = await Promise.all([
          fetch(`${API}/api/payments/donations/leaderboard`, { credentials: 'include' }),
          fetch(`${API}/api/payments/subscribers`, { credentials: 'include' }),
        ])

        if (!cancelled) {
          if (donorsRes.ok) {
            const d = await donorsRes.json()
            setDonors(d.donors || [])
            setAnonymousSupport(d.anonymousSupport || { donorCount: 0, totalAmount: 0 })
          }
          if (subsRes.ok) {
            const s = await subsRes.json()
            setSubscribers(s.subscribers || [])
          }
        }
      } catch (err) {
        if (!cancelled) setError('Failed to load supporter data.')
        console.error('[supporters]', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div style={s.page}>
      <Navbar />

      {/* ── Donation success banner ──────────────────── */}
      {paymentStatus === 'success' && (
        <div style={s.successBanner}>
          Thank you for your donation! Your support helps keep StudyHub free for students
          everywhere. Anonymous donations stay private and are counted in the community total.
        </div>
      )}

      {/* ── HERO ─────────────────────────────────────── */}
      <section style={s.hero}>
        {PARTICLES.map((p, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: p.top,
              left: p.left,
              right: p.right,
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              background: 'var(--sh-on-dark)',
              opacity: p.opacity,
              animation: `float ${p.duration} ease-in-out infinite`,
              animationDelay: p.delay,
              pointerEvents: 'none',
            }}
          />
        ))}
        <div style={s.heroInner}>
          <h1 style={s.heroH1}>Our Supporters</h1>
          <p style={s.heroSub}>
            StudyHub is kept alive by the generosity of students and educators who believe in making
            study resources accessible to everyone. Thank you.
          </p>
        </div>
      </section>

      {loading ? (
        <section style={s.loadingSection}>
          <div style={s.loadingText}>Loading supporters...</div>
        </section>
      ) : error ? (
        <section style={s.loadingSection}>
          <div style={s.errorText}>{error}</div>
        </section>
      ) : (
        <>
          {/* ── DONATION LEADERBOARD ──────────────────── */}
          <section style={s.section}>
            <div style={s.sectionInner}>
              <h2 style={s.sectionTitle}>Top Donors</h2>
              <p style={s.sectionSub}>
                These generous individuals have donated to help keep StudyHub free for students.
              </p>

              {anonymousSupport.donorCount > 0 && (
                <div style={{
                  marginBottom: 20,
                  padding: '16px 18px',
                  borderRadius: 18,
                  border: '1px solid var(--sh-border)',
                  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.04), rgba(14, 165, 233, 0.08))',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--sh-muted)', marginBottom: 4 }}>
                      Anonymous Support
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--sh-text)', lineHeight: 1.5 }}>
                      {anonymousSupport.donorCount} {anonymousSupport.donorCount === 1 ? 'supporter has' : 'supporters have'} chosen to stay private.
                    </div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--sh-heading)' }}>
                    ${(anonymousSupport.totalAmount / 100).toFixed(2)}
                  </div>
                </div>
              )}

              {donors.length === 0 && anonymousSupport.donorCount === 0 ? (
                <EmptyState
                  message="No donations yet. Be the first to support StudyHub!"
                  ctaTo="/pricing"
                  ctaLabel="Donate Now"
                />
              ) : donors.length === 0 ? (
                <EmptyState
                  message="Support is already coming in, but every donor so far chose to stay anonymous."
                  ctaTo="/pricing#donate"
                  ctaLabel="Join In"
                />
              ) : (
                <div style={s.leaderboardGrid}>
                  {donors.map((donor, index) => (
                    <DonorCard key={donor.userId} donor={donor} rank={index + 1} />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ── SUBSCRIBER SHOWCASE ──────────────────── */}
          <section style={s.sectionAlt}>
            <div style={s.sectionInner}>
              <h2 style={s.sectionTitle}>Pro Members</h2>
              <p style={s.sectionSub}>These members support StudyHub with a Pro subscription.</p>

              {subscribers.length === 0 ? (
                <EmptyState
                  message="No Pro subscribers yet. Upgrade to Pro and be the first!"
                  ctaTo="/pricing"
                  ctaLabel="See Plans"
                />
              ) : (
                <div style={s.subscriberGrid}>
                  {subscribers.map((sub) => (
                    <SubscriberCard key={sub.userId} subscriber={sub} />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ── CTA ──────────────────────────────────── */}
          <section style={s.ctaSection}>
            <div style={s.ctaCard}>
              <img
                src="/images/plan-donation.png"
                alt="Support StudyHub"
                style={{ width: 72, height: 'auto', borderRadius: 14, marginBottom: 16 }}
              />
              <h2 style={s.ctaTitle}>Want to support StudyHub?</h2>
              <p style={s.ctaSub}>
                Every contribution helps us keep the lights on, improve the platform, and support
                students worldwide.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link to="/pricing#donate" style={s.ctaButton}>
                  Donate
                </Link>
                <Link to="/pricing" style={s.ctaButtonOutline}>
                  View Plans
                </Link>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ── FOOTER ──────────────────────────────────── */}
      <footer style={s.footer}>
        <p style={s.footerCopy}>Built by students, for students</p>
      </footer>
    </div>
  )
}

// ── Donor Card ───────────────────────────────────────────────────────────

function DonorCard({ donor, rank }) {
  const [hovered, setHovered] = useState(false)
  const isTop3 = rank <= 3

  const glowStyles = {
    1: {
      boxShadow: hovered ? 'var(--sh-metal-gold-glow-strong)' : 'var(--sh-metal-gold-glow)',
      animation: 'goldPulse 3s ease-in-out infinite',
    },
    2: {
      boxShadow: hovered ? 'var(--sh-metal-silver-glow-strong)' : 'var(--sh-metal-silver-glow)',
    },
    3: {
      boxShadow: hovered ? 'var(--sh-metal-bronze-glow-strong)' : 'var(--sh-metal-bronze-glow)',
    },
  }

  const rankBadgeStyles = {
    1: {
      background: 'var(--sh-metal-gold-gradient)',
      color: 'var(--sh-metal-gold-text)',
      border: 'none',
    },
    2: {
      background: 'var(--sh-metal-silver-gradient)',
      color: 'var(--sh-metal-silver-text)',
      border: 'none',
    },
    3: {
      background: 'var(--sh-metal-bronze-gradient)',
      color: 'var(--sh-metal-bronze-text)',
      border: 'none',
    },
  }

  const badgeStyle = rankBadgeStyles[rank] || {
    background: 'var(--sh-soft)',
    color: 'var(--sh-muted)',
    border: 'none',
  }

  return (
    <div
      style={{
        ...s.donorCard,
        ...(isTop3 ? glowStyles[rank] : {}),
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={s.donorRank}>
        <span style={{ ...s.rankBadge, ...badgeStyle }}>#{rank}</span>
      </div>
      <Link to={`/users/${donor.username}`} style={s.donorAvatarLink}>
        <UserAvatar
          username={donor.username}
          avatarUrl={donor.avatarUrl}
          isDonor
          size={isTop3 ? 56 : 44}
        />
      </Link>
      <div style={s.donorInfo}>
        <Link to={`/users/${donor.username}`} style={s.donorName}>
          {donor.username}
        </Link>
        <div style={s.donorStats}>
          <span style={s.donorAmount}>${(donor.totalAmount / 100).toFixed(2)}</span>
          <span style={s.donorCount}>
            {donor.donationCount} {donor.donationCount === 1 ? 'donation' : 'donations'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Subscriber Card ──────────────────────────────────────────────────────

function SubscriberCard({ subscriber }) {
  const [hovered, setHovered] = useState(false)
  const planLabel = subscriber.plan === 'pro_yearly' ? 'Yearly' : 'Monthly'
  const planImg =
    subscriber.plan === 'pro_yearly'
      ? '/images/plan-pro-yearly.png'
      : '/images/plan-pro-monthly.png'

  return (
    <Link
      to={`/users/${subscriber.username}`}
      style={{
        ...s.subCard,
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: hovered ? 'var(--sh-premium-glow)' : 'var(--shadow-sm)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <UserAvatar
        username={subscriber.username}
        avatarUrl={subscriber.avatarUrl}
        plan={subscriber.plan}
        size={40}
      />
      <div style={s.subInfo}>
        <span style={s.subName}>{subscriber.username}</span>
        <span style={s.subPlanShimmer}>Pro {planLabel}</span>
      </div>
      <img src={planImg} alt={`Pro ${planLabel}`} style={s.subPlanImg} />
    </Link>
  )
}

// ── Empty State ──────────────────────────────────────────────────────────

function EmptyState({ message, ctaTo, ctaLabel }) {
  return (
    <div style={s.emptyState}>
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        style={{ marginBottom: 12, animation: 'pulse 2s ease-in-out infinite' }}
      >
        <path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill="var(--sh-accent-pink)"
        />
      </svg>
      <p style={s.emptyText}>{message}</p>
      <Link to={ctaTo} style={s.emptyButton}>
        {ctaLabel}
      </Link>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────

const s = {
  page: {
    minHeight: '100vh',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    background: 'var(--sh-surface)',
    color: 'var(--sh-text)',
  },

  /* Success banner */
  successBanner: {
    maxWidth: 700,
    margin: '16px auto 0',
    padding: '14px 20px',
    borderRadius: 12,
    background: 'var(--sh-success-bg)',
    border: '1px solid var(--sh-success-border)',
    color: 'var(--sh-success-text)',
    fontSize: 14,
    fontWeight: 600,
    textAlign: 'center',
  },

  /* Hero */
  hero: {
    background: 'var(--sh-premium-gradient)',
    backgroundSize: '300% 300%',
    animation: 'gradientShift 8s ease infinite',
    padding: '120px 20px 100px',
    position: 'relative',
    overflow: 'hidden',
  },
  heroInner: {
    maxWidth: 720,
    margin: '0 auto',
    textAlign: 'center',
    position: 'relative',
    zIndex: 1,
  },
  heroH1: {
    fontSize: 'clamp(32px, 5vw, 48px)',
    fontWeight: 'bold',
    color: 'var(--sh-on-dark)',
    margin: '0 0 16px',
    lineHeight: 1.2,
    textShadow: 'var(--sh-premium-glow-strong)',
  },
  heroSub: {
    fontSize: 17,
    color: 'var(--sh-on-dark-subtle)',
    margin: 0,
    lineHeight: 1.7,
    maxWidth: 560,
    marginInline: 'auto',
  },

  /* Loading */
  loadingSection: {
    padding: '80px 20px',
    textAlign: 'center',
  },
  loadingText: {
    color: 'var(--sh-muted)',
    fontSize: 15,
  },
  errorText: {
    color: 'var(--sh-danger-text)',
    fontSize: 15,
  },

  /* Sections */
  section: {
    padding: '64px 20px',
    background: 'transparent',
  },
  sectionAlt: {
    padding: '64px 20px',
    background: 'var(--sh-bg)',
  },
  sectionInner: {
    maxWidth: 1040,
    margin: '0 auto',
    display: 'grid',
    gap: 18,
  },
  sectionTitle: {
    fontSize: 'clamp(22px, 3vw, 30px)',
    fontWeight: 'bold',
    color: 'var(--sh-heading)',
    margin: '0 0 8px',
    textAlign: 'center',
  },
  sectionSub: {
    fontSize: 15,
    color: 'var(--sh-subtext)',
    textAlign: 'center',
    margin: '0 0 40px',
    lineHeight: 1.6,
  },

  /* Donor Leaderboard */
  leaderboardGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  donorCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '18px 20px',
    background: 'var(--sh-glass-card-bg)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid var(--sh-glass-card-border)',
    borderRadius: 18,
    transition: 'all 0.3s ease',
    justifyContent: 'space-between',
  },
  donorRank: {
    flexShrink: 0,
    width: 40,
    textAlign: 'center',
  },
  rankBadge: {
    display: 'inline-block',
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 8,
    padding: '2px 8px',
    minWidth: 36,
    textAlign: 'center',
  },
  donorAvatarLink: {
    textDecoration: 'none',
    flexShrink: 0,
  },
  donorInfo: {
    flex: 1,
    minWidth: 0,
  },
  donorName: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--sh-text)',
    textDecoration: 'none',
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  donorStats: {
    display: 'flex',
    gap: 12,
    marginTop: 4,
  },
  donorAmount: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--sh-success-text)',
  },
  donorCount: {
    fontSize: 13,
    color: 'var(--sh-muted)',
  },

  /* Subscriber Grid */
  subscriberGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 14,
  },
  subCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '16px 18px',
    background: 'var(--sh-glass-card-bg)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid var(--sh-glass-card-border)',
    borderRadius: 16,
    textDecoration: 'none',
    transition: 'all 0.3s ease',
  },
  subInfo: {
    flex: 1,
    minWidth: 0,
  },
  subName: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--sh-text)',
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  subPlanShimmer: {
    fontSize: 12,
    fontWeight: 600,
    marginTop: 2,
    display: 'inline-block',
    background: 'var(--sh-premium-shimmer-gradient)',
    backgroundSize: '200% 100%',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    animation: 'shimmer 3s linear infinite',
  },
  subPlanImg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    objectFit: 'cover',
    flexShrink: 0,
  },

  /* Empty State */
  emptyState: {
    textAlign: 'center',
    padding: '48px 20px',
    background: 'linear-gradient(135deg, var(--sh-accent-indigo-bg), var(--sh-accent-purple-bg))',
    borderRadius: 22,
    border: '1px solid var(--sh-accent-purple-border)',
    boxShadow: '0 24px 40px rgba(15, 23, 42, 0.08)',
  },
  emptyText: {
    fontSize: 15,
    color: 'var(--sh-subtext)',
    margin: '0 0 16px',
    lineHeight: 1.6,
  },
  emptyButton: {
    display: 'inline-block',
    background: 'var(--sh-premium-gradient)',
    color: 'var(--sh-btn-primary-text)',
    padding: '11px 24px',
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 14,
    textDecoration: 'none',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    transition: 'transform 0.15s ease, opacity 0.15s',
    boxShadow: '0 14px 26px rgba(99, 102, 241, 0.22)',
  },

  /* CTA Section */
  ctaSection: {
    padding: '64px 20px',
    background: 'var(--sh-surface)',
    textAlign: 'center',
  },
  ctaCard: {
    maxWidth: 560,
    margin: '0 auto',
    padding: '52px 42px',
    background: 'linear-gradient(135deg, var(--sh-accent-indigo-bg), var(--sh-accent-purple-bg))',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid var(--sh-accent-purple-border)',
    borderRadius: 24,
    boxShadow: '0 28px 48px rgba(15, 23, 42, 0.1)',
  },
  ctaTitle: {
    fontSize: 'clamp(22px, 3vw, 28px)',
    fontWeight: 'bold',
    color: 'var(--sh-heading)',
    margin: '0 0 12px',
  },
  ctaSub: {
    fontSize: 15,
    color: 'var(--sh-subtext)',
    margin: '0 0 24px',
    lineHeight: 1.6,
  },
  ctaButton: {
    display: 'inline-block',
    background: 'var(--sh-premium-gradient)',
    color: 'var(--sh-btn-primary-text)',
    padding: '12px 32px',
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 15,
    textDecoration: 'none',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    animation: 'pulseGlow 3s ease-in-out infinite',
  },
  ctaButtonOutline: {
    display: 'inline-block',
    background: 'transparent',
    color: 'var(--sh-accent-purple)',
    padding: '11px 32px',
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 15,
    textDecoration: 'none',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    border: '1.5px solid var(--sh-accent-purple-border)',
  },

  /* Footer */
  footer: {
    padding: '40px 20px',
    textAlign: 'center',
    borderTop: '1px solid var(--sh-border)',
    background: 'var(--sh-surface)',
  },
  footerCopy: {
    fontSize: 14,
    color: 'var(--sh-muted)',
    margin: 0,
  },
}
