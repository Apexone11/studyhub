import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import UserAvatar from '../../components/UserAvatar'
import { API } from '../../config'

// ── Main Component ───────────────────────────────────────────────────────

export default function SupportersPage() {
  const [donors, setDonors] = useState([])
  const [subscribers, setSubscribers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
    return () => { cancelled = true }
  }, [])

  return (
    <div style={s.page}>
      <Navbar />

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
                <EmptyState message="No donations yet. Be the first to support StudyHub!" ctaTo="/pricing" ctaLabel="Donate Now" />
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
              <p style={s.sectionSub}>
                These members support StudyHub with a Pro subscription.
              </p>

              {subscribers.length === 0 ? (
                <EmptyState message="No Pro subscribers yet. Upgrade to Pro and be the first!" ctaTo="/pricing" ctaLabel="See Plans" />
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
              <h2 style={s.ctaTitle}>Want to support StudyHub?</h2>
              <p style={s.ctaSub}>
                Every contribution helps us keep the lights on, improve the platform, and support students worldwide.
              </p>
              <Link to="/pricing" style={s.ctaButton}>
                View Plans and Donate
              </Link>
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
  const rankColors = { 1: '#f59e0b', 2: '#94a3b8', 3: '#cd7f32' }
  const rankColor = rankColors[rank] || 'var(--sh-muted)'

  return (
    <div style={{ ...s.donorCard, ...(isTop3 ? s.donorCardTop : {}) }}>
      <div style={s.donorRank}>
        <span style={{ ...s.rankBadge, borderColor: rankColor, color: rankColor }}>
          #{rank}
        </span>
      </div>
      <Link to={`/users/${donor.username}`} style={s.donorAvatarLink}>
        <UserAvatar
          username={donor.username}
          avatarUrl={donor.avatarUrl}
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

  return (
    <Link to={`/users/${subscriber.username}`} style={s.subCard}>
      <UserAvatar
        username={subscriber.username}
        avatarUrl={subscriber.avatarUrl}
        size={40}
      />
      <div style={s.subInfo}>
        <span style={s.subName}>{subscriber.username}</span>
        <span style={s.subPlan}>Pro {planLabel}</span>
      </div>
    </Link>
  )
}

// ── Empty State ──────────────────────────────────────────────────────────

function EmptyState({ message, ctaTo, ctaLabel }) {
  return (
    <div style={s.emptyState}>
      <p style={s.emptyText}>{message}</p>
      <Link to={ctaTo} style={s.emptyButton}>{ctaLabel}</Link>
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
    background: 'linear-gradient(135deg, #059669 0%, #0d9488 50%, #3b82f6 100%)',
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
    background: 'var(--sh-success-bg)',
    color: '#ffffff',
    padding: '10px 24px',
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 14,
    textDecoration: 'none',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
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
    background: 'var(--sh-info-bg)',
    color: '#ffffff',
    padding: '12px 32px',
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 15,
    textDecoration: 'none',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    transition: 'opacity 0.15s',
    cursor: 'pointer',
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
