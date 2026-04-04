import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import UserAvatar from '../../components/UserAvatar'
import { API } from '../../config'

// ── Main Component ───────────────────────────────────────────────────────

export default function SupportersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [donors, setDonors] = useState([])
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
        <div
          style={{
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
          }}
        >
          Thank you for your donation! Your support helps keep StudyHub free for students
          everywhere.
        </div>
      )}

      {/* ── HERO ─────────────────────────────────────── */}
      <section style={s.hero}>
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

              {donors.length === 0 ? (
                <EmptyState
                  message="No donations yet. Be the first to support StudyHub!"
                  ctaTo="/pricing"
                  ctaLabel="Donate Now"
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
            <div style={s.ctaInner}>
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
  const isTop3 = rank <= 3
  const rankColors = { 1: 'var(--sh-warning)', 2: 'var(--sh-slate-400)', 3: '#cd7f32' }
  const rankColor = rankColors[rank] || 'var(--sh-muted)'

  return (
    <div style={{ ...s.donorCard, ...(isTop3 ? s.donorCardTop : {}) }}>
      <div style={s.donorRank}>
        <span style={{ ...s.rankBadge, borderColor: rankColor, color: rankColor }}>#{rank}</span>
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
  const planLabel = subscriber.plan === 'pro_yearly' ? 'Yearly' : 'Monthly'
  const planImg =
    subscriber.plan === 'pro_yearly'
      ? '/images/plan-pro-yearly.png'
      : '/images/plan-pro-monthly.png'

  return (
    <Link to={`/users/${subscriber.username}`} style={s.subCard}>
      <UserAvatar
        username={subscriber.username}
        avatarUrl={subscriber.avatarUrl}
        plan={subscriber.plan}
        size={40}
      />
      <div style={s.subInfo}>
        <span style={s.subName}>{subscriber.username}</span>
        <span style={s.subPlan}>Pro {planLabel}</span>
      </div>
      <img src={planImg} alt={`Pro ${planLabel}`} style={s.subPlanImg} />
    </Link>
  )
}

// ── Empty State ──────────────────────────────────────────────────────────

function EmptyState({ message, ctaTo, ctaLabel }) {
  return (
    <div style={s.emptyState}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 12 }}>
        <path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill="var(--sh-border)"
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

  /* Hero */
  hero: {
    background: 'linear-gradient(135deg, var(--sh-success), var(--sh-brand))',
    padding: '100px 20px 80px',
  },
  heroInner: {
    maxWidth: 720,
    margin: '0 auto',
    textAlign: 'center',
  },
  heroH1: {
    fontSize: 'clamp(32px, 5vw, 48px)',
    fontWeight: 'bold',
    color: '#ffffff',
    margin: '0 0 16px',
    lineHeight: 1.2,
  },
  heroSub: {
    fontSize: 17,
    color: 'rgba(255, 255, 255, 0.85)',
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
    background: 'var(--sh-surface)',
  },
  sectionAlt: {
    padding: '64px 20px',
    background: 'var(--sh-bg)',
  },
  sectionInner: {
    maxWidth: 900,
    margin: '0 auto',
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
    gap: 12,
  },
  donorCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '16px 20px',
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 14,
    transition: 'box-shadow 0.15s',
  },
  donorCardTop: {
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
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
    border: '2px solid',
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 12,
  },
  subCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 12,
    textDecoration: 'none',
    transition: 'box-shadow 0.15s',
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
  subPlan: {
    fontSize: 12,
    color: 'var(--sh-info-text)',
    fontWeight: 600,
    marginTop: 2,
    display: 'block',
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
    background: 'var(--sh-soft)',
    borderRadius: 16,
  },
  emptyText: {
    fontSize: 15,
    color: 'var(--sh-subtext)',
    margin: '0 0 16px',
    lineHeight: 1.6,
  },
  emptyButton: {
    display: 'inline-block',
    background: 'var(--sh-brand)',
    color: 'var(--sh-nav-text)',
    padding: '10px 24px',
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 14,
    textDecoration: 'none',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    transition: 'opacity 0.15s',
  },

  /* CTA Section */
  ctaSection: {
    padding: '64px 20px',
    background: 'var(--sh-surface)',
    textAlign: 'center',
  },
  ctaInner: {
    maxWidth: 560,
    margin: '0 auto',
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
    background: 'var(--sh-brand)',
    color: 'var(--sh-nav-text)',
    padding: '12px 32px',
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 15,
    textDecoration: 'none',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    transition: 'opacity 0.15s',
    cursor: 'pointer',
  },
  ctaButtonOutline: {
    display: 'inline-block',
    background: 'transparent',
    color: 'var(--sh-brand)',
    padding: '11px 32px',
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 15,
    textDecoration: 'none',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    transition: 'opacity 0.15s',
    cursor: 'pointer',
    border: '1.5px solid var(--sh-brand)',
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
