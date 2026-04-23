import { useEffect, useState } from 'react'
import Navbar from '../../components/navbar/Navbar'
import { Link } from 'react-router-dom'
import { API } from '../../config'

const ROADMAP_V20 = [
  'Hub AI assistant with streaming chat and context awareness',
  'Video uploads with chunked upload to R2',
  'Stripe subscriptions and donations',
  'Real-time messaging (DMs and group chats)',
  'Study groups with sessions and discussions',
  'Comment reactions and nested replies',
  'Fork, contribute, and merge workflow',
  'Block and mute system for user safety',
]

const ROADMAP_V25 = [
  'Flashcard mode -- auto-generate from study sheets',
  'Study session timer with Pomodoro integration',
  'Sheet templates library for common formats',
  'Push notifications for web',
  'Advanced search filters (date, rating, type)',
]

const ROADMAP_V30 = [
  'AI study plan generator from your courses and history',
  'Practice test engine with auto-scoring and spaced repetition',
  'Real-time collaborative sheet editing',
  'LMS integration (Canvas, Blackboard)',
  'Mobile PWA enhancements with offline reading',
  'Campus ambassador program and cross-campus discovery',
]

const HOW_STEPS = [
  {
    step: '01',
    title: 'Create your account',
    desc: 'Sign up in seconds. Pick your school and courses to get a personalized feed.',
  },
  {
    step: '02',
    title: 'Browse & fork sheets',
    desc: 'Find study sheets from classmates. Fork them to make your own version — like GitHub for notes.',
  },
  {
    step: '03',
    title: 'Study together',
    desc: 'Star the best sheets, leave comments, and build a shared knowledge base for your class.',
  },
]

const GOAL_TONES = {
  access: {
    background: 'var(--sh-info-bg)',
    border: 'var(--sh-info-border)',
    color: 'var(--sh-info)',
  },
  collaboration: {
    background: 'var(--sh-accent-purple-bg)',
    border: 'var(--sh-accent-purple-border)',
    color: 'var(--sh-accent-purple)',
  },
  expansion: {
    background: 'var(--sh-accent-cyan-bg)',
    border: 'var(--sh-accent-cyan-border)',
    color: 'var(--sh-accent-cyan)',
  },
  privacy: {
    background: 'var(--sh-success-bg)',
    border: 'var(--sh-success-border)',
    color: 'var(--sh-success)',
  },
}

const ROADMAP_TONES = {
  current: 'var(--sh-success)',
  next: 'var(--sh-warning)',
  future: 'var(--sh-info)',
}

export default function AboutPage() {
  return (
    <div style={s.page}>
      <Navbar />

      {/* ── HERO ─────────────────────────────────────── */}
      <section style={s.hero}>
        <div style={s.heroInner}>
          <div style={s.heroBadge}>For Every Learner · Open Source · Community Driven</div>
          <h1 style={s.heroH1}>
            Knowledge Belongs
            <br />
            to Everyone
          </h1>
          <p style={s.heroSub}>
            StudyHub is a home for every idea, every lesson, and every story worth remembering. A
            place where the notes of a freshman, the wisdom of a grandparent, and the craft of a
            retired teacher can sit side by side, because learning never graduates, and no
            one&apos;s knowledge should be lost to time.
          </p>
          <p
            style={{
              fontSize: 15,
              fontStyle: 'italic',
              color: 'var(--sh-on-dark-faint)',
              maxWidth: 560,
              margin: '0 auto 32px',
              lineHeight: 1.75,
            }}
          >
            &ldquo;Live as if you were to die tomorrow. Learn as if you were to live forever.&rdquo;
            <span style={{ display: 'block', fontSize: 12, marginTop: 6, opacity: 0.85 }}>
              Mahatma Gandhi
            </span>
          </p>
          <div style={s.heroCtas}>
            <Link to="/register" style={s.ctaPrimary}>
              Get Started Free
            </Link>
            <Link to="/feed" style={s.ctaSecondary}>
              Browse Sheets
            </Link>
          </div>
        </div>
      </section>

      {/* ── WHY WE BUILT THIS ────────────────────────── */}
      <section style={s.section}>
        <div style={s.sectionInner}>
          <h2 style={s.sectionH2}>Why We Built This</h2>
          <div className="about-story-grid">
            <div style={s.storyText}>
              <p style={s.p}>
                It began with a simple frustration. Every semester, students scrambled to find good
                study materials. Notes vanished into Discord servers, Google Drive folders no one
                could find, and group chats that went quiet the day after finals.
              </p>
              <p style={s.p}>
                But somewhere along the way, we realized the problem was bigger than a missing PDF.
                People carry so much inside them, lessons from their classes, lessons from their
                jobs, lessons from raising children, from losing people they loved, from mistakes
                they hope no one else has to make. And most of it disappears. Quietly. Without
                anyone noticing that a whole world of knowledge just walked out of the room.
              </p>
              <p style={s.p}>
                So we built StudyHub to be a place where that does not have to happen. A place where
                your notes are <strong>organized and easy to find</strong>, where your ideas can be
                forked and improved by strangers who become friends, and where what you know
                matters, whether you are studying for midterms, passing down a recipe, or writing
                down the things your father taught you before they fade.
              </p>
              <p style={s.p}>
                You do not need a diploma to teach here. You do not need to be young to learn here.
                Life itself is the oldest classroom there is, and every single person walking around
                on this earth is, quietly, a student of it.
              </p>
            </div>
            <div style={s.storyStats}>
              <StatCard value="∞" label="Study sheets you can create" />
              <StatCard value="30+" label="Maryland schools supported" />
              <StatCard value="100%" label="Open source" />
            </div>
          </div>
        </div>
      </section>

      {/* ── OUR GOALS ───────────────────────────────── */}
      <section style={{ ...s.section, background: 'var(--sh-bg)' }}>
        <div style={s.sectionInner}>
          <h2 style={s.sectionH2}>Our Goals</h2>
          <div style={s.goalsGrid}>
            <GoalCard
              faIcon="fa-book-open"
              tone={GOAL_TONES.access}
              title="Open Access"
              desc="Core study tools are free to use. Share, discover, and collaborate without barriers."
            />
            <GoalCard
              faIcon="fa-users"
              tone={GOAL_TONES.collaboration}
              title="Student Collaboration"
              desc="Notes improve when many minds work on them. Fork, edit, and build on each other's work."
            />
            <GoalCard
              faIcon="fa-map-location-dot"
              tone={GOAL_TONES.expansion}
              title="Start Local, Go National"
              desc="Maryland first. Then every university. Students everywhere deserve better study tools."
            />
            <GoalCard
              faIcon="fa-shield-halved"
              tone={GOAL_TONES.privacy}
              title="Privacy First"
              desc="We collect only what we need. Your data stays yours."
            />
          </div>
        </div>
      </section>

      {/* ── FOR EVERYONE ────────────────────────────── */}
      <section style={s.section}>
        <div style={s.sectionInner}>
          <h2 style={s.sectionH2}>This Is for Everyone</h2>
          <p style={{ ...s.p, textAlign: 'center', maxWidth: 720, margin: '0 auto 40px' }}>
            StudyHub is not only for students in a lecture hall. It is for the eighty year old who
            remembers how things used to be made, the single parent studying at 2am after the kids
            are asleep, the mechanic who can fix anything but was told they were not smart, the
            retired nurse whose hands have held more lives than any textbook, and the kid in a small
            town with nothing but a library card and a dream. It is for every color, every age,
            every gender, every income, every faith. If you have ever learned something the world
            would be poorer without, this place was built for you.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 20,
              marginTop: 16,
            }}
          >
            {[
              { q: 'Wherever you go, go with all your heart.', a: 'Confucius' },
              { q: 'An investment in knowledge pays the best interest.', a: 'Benjamin Franklin' },
              {
                q: 'The beautiful thing about learning is that nobody can take it away from you.',
                a: 'B.B. King',
              },
              {
                q: 'We do not learn from experience. We learn from reflecting on experience.',
                a: 'John Dewey',
              },
              {
                q: 'Tell me and I forget. Teach me and I remember. Involve me and I learn.',
                a: 'Benjamin Franklin',
              },
              {
                q: 'The mind is not a vessel to be filled, but a fire to be kindled.',
                a: 'Plutarch',
              },
            ].map((item, i) => (
              <figure
                key={i}
                style={{
                  background: 'var(--sh-soft)',
                  border: '1px solid var(--sh-border)',
                  borderRadius: 14,
                  padding: '24px 22px',
                  margin: 0,
                }}
              >
                <blockquote
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontStyle: 'italic',
                    color: 'var(--sh-text)',
                    lineHeight: 1.7,
                  }}
                >
                  &ldquo;{item.q}&rdquo;
                </blockquote>
                <figcaption
                  style={{
                    marginTop: 12,
                    fontSize: 13,
                    fontWeight: 'bold',
                    color: 'var(--sh-brand)',
                  }}
                >
                  {item.a}
                </figcaption>
              </figure>
            ))}
          </div>

          <p
            style={{
              ...s.p,
              textAlign: 'center',
              maxWidth: 680,
              margin: '40px auto 0',
              fontSize: 15,
            }}
          >
            School is one classroom. Life is another. Both deserve a place to keep what they teach
            us, so the next person who needs it can find it waiting, written down with care, by
            someone who was once exactly where they are now.
          </p>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────── */}
      <section style={s.section}>
        <div style={s.sectionInner}>
          <h2 style={s.sectionH2}>How It Works</h2>
          <div style={s.stepsRow}>
            {HOW_STEPS.map((step, i) => (
              <div key={i} style={s.stepCard}>
                <div style={s.stepNum}>{step.step}</div>
                <h3 style={s.stepTitle}>{step.title}</h3>
                <p style={s.stepDesc}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ROADMAP ─────────────────────────────────── */}
      <section style={{ ...s.section, background: 'var(--sh-bg)' }}>
        <div style={s.sectionInner}>
          <h2 style={s.sectionH2}>Roadmap</h2>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--sh-muted)', fontWeight: 'bold' }}>
              Current Release: V2.0.0
            </span>
          </div>
          <div style={{ ...s.roadmapGrid, gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <RoadmapColumn
              title="V2.0.0 — Current"
              color={ROADMAP_TONES.current}
              items={ROADMAP_V20}
            />
            <RoadmapColumn title="V2.5 — Next Up" color={ROADMAP_TONES.next} items={ROADMAP_V25} />
            <RoadmapColumn title="V3.0 — Future" color={ROADMAP_TONES.future} items={ROADMAP_V30} />
          </div>
        </div>
      </section>

      {/* ── TEAM ────────────────────────────────────── */}
      <section style={s.section}>
        <div style={s.sectionInner}>
          <h2 style={s.sectionH2}>The Team</h2>
          <div className="about-team-card" style={s.teamCard}>
            <div style={s.teamAvatar}>A</div>
            <div>
              <div style={s.teamName}>Abdul Rahman Fornah</div>
              <div style={s.teamRole}>Founder & Lead Developer</div>
              <p style={s.teamBio}>
                Student developer who got tired of losing study notes. Built StudyHub to solve the
                problem for everyone at UMD and beyond.
              </p>
            </div>
          </div>
          <p style={s.openSourceNote}>
            StudyHub is open source and welcomes contributors.{' '}
            <a
              href="https://github.com/Apexone11"
              style={s.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub →
            </a>
          </p>
        </div>
      </section>

      {/* ── PUBLIC REVIEWS ────────────────────────────── */}
      <PublicReviews />

      {/* ── FOOTER ──────────────────────────────────── */}
      <footer style={s.footer}>
        <div style={s.footerLinks}>
          <Link to="/" style={s.footerLink}>
            Home
          </Link>
          <Link to="/feed" style={s.footerLink}>
            Browse
          </Link>
          <Link to="/privacy" style={s.footerLink}>
            Privacy
          </Link>
          <Link to="/terms" style={s.footerLink}>
            Terms
          </Link>
          <Link to="/guidelines" style={s.footerLink}>
            Guidelines
          </Link>
        </div>
        <p style={s.footerCopy}>Built by students, for students · StudyHub · Open Source</p>
      </footer>
    </div>
  )
}

function StatCard({ value, label }) {
  return (
    <div style={s.statCard}>
      <div style={s.statValue}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  )
}

function GoalCard({ faIcon, tone, title, desc }) {
  return (
    <div style={s.goalCard}>
      <div
        style={{
          ...s.goalIconWrap,
          background: tone.background,
          border: `1px solid ${tone.border}`,
        }}
      >
        <i className={`fas ${faIcon}`} style={{ color: tone.color, fontSize: 18 }}></i>
      </div>
      <h3 style={s.goalTitle}>{title}</h3>
      <p style={s.goalDesc}>{desc}</p>
    </div>
  )
}

function RoadmapColumn({ title, color, items }) {
  return (
    <div style={s.roadmapCol}>
      <h3 style={{ ...s.roadmapTitle, color }}>{title}</h3>
      <ul style={s.roadmapList}>
        {items.map((item, i) => (
          <li key={i} style={s.roadmapItem}>
            <i
              className="fas fa-check"
              style={{ color, fontSize: 11, marginRight: 10, marginTop: 3, flexShrink: 0 }}
            ></i>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * PublicReviews — fetches approved reviews from GET /api/reviews/public
 * and renders them as a card grid with star ratings and first names.
 */
function PublicReviews() {
  const [reviews, setReviews] = useState([])

  useEffect(() => {
    fetch(`${API}/api/reviews/public`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setReviews(data.reviews || []))
      .catch(() => {})
  }, [])

  if (reviews.length === 0) return null

  // Average rating
  const avg = reviews.reduce((sum, r) => sum + r.stars, 0) / reviews.length

  return (
    <section style={s.reviewsSection}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <h2
          style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800, color: 'var(--sh-heading)' }}
        >
          What students say
        </h2>
        <div style={{ fontSize: 14, color: 'var(--sh-muted)' }}>
          {avg.toFixed(1)} average from {reviews.length} review{reviews.length !== 1 ? 's' : ''}
        </div>
      </div>
      <div style={s.reviewsGrid}>
        {reviews.map((r) => (
          <div key={r.id} style={s.reviewCard}>
            <div style={{ display: 'flex', gap: 2 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <svg
                  key={n}
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill={n <= r.stars ? 'var(--sh-warning, #f59e0b)' : 'var(--sh-border)'}
                  aria-hidden="true"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
                </svg>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--sh-heading)' }}>
              {r.text}
            </p>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)', fontWeight: 600 }}>
              {r.user?.username || 'Student'}
            </div>
          </div>
        ))}
      </div>
    </section>
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
    background: 'var(--sh-hero-gradient-primary)',
    padding: '120px 20px 80px',
  },
  heroInner: { maxWidth: 720, margin: '0 auto', textAlign: 'center' },
  heroBadge: {
    display: 'inline-block',
    background: 'var(--sh-brand-soft-bg)',
    color: 'var(--sh-brand)',
    fontSize: 12,
    fontWeight: 'bold',
    padding: '6px 16px',
    borderRadius: 20,
    border: '1px solid var(--sh-brand-border)',
    marginBottom: 24,
    letterSpacing: 1,
  },
  heroH1: {
    fontSize: 'clamp(32px, 5vw, 54px)',
    fontWeight: 'bold',
    color: 'var(--sh-on-dark)',
    margin: '0 0 20px',
    lineHeight: 1.15,
  },
  heroSub: { fontSize: 18, color: 'var(--sh-on-dark-faint)', margin: '0 0 36px', lineHeight: 1.7 },
  heroCtas: { display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' },
  ctaPrimary: {
    background: 'var(--sh-brand)',
    color: 'var(--sh-btn-primary-text)',
    textDecoration: 'none',
    padding: '14px 32px',
    borderRadius: 10,
    fontWeight: 'bold',
    fontSize: 15,
  },
  ctaSecondary: {
    background: 'var(--sh-glass-bg-soft)',
    color: 'var(--sh-on-dark-faint)',
    textDecoration: 'none',
    padding: '14px 32px',
    borderRadius: 10,
    fontWeight: 'bold',
    fontSize: 15,
    border: '1px solid var(--sh-glass-border)',
  },
  section: { padding: '80px 20px' },
  sectionInner: { maxWidth: 1000, margin: '0 auto' },
  sectionH2: {
    fontSize: 'clamp(24px, 3vw, 36px)',
    fontWeight: 'bold',
    color: 'var(--sh-heading)',
    margin: '0 0 40px',
    textAlign: 'center',
  },
  storyGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0,1fr) minmax(200px, 280px)',
    gap: 48,
    alignItems: 'start',
  },
  storyText: {},
  p: { fontSize: 16, color: 'var(--sh-subtext)', lineHeight: 1.8, margin: '0 0 16px' },
  storyStats: { display: 'flex', flexDirection: 'column', gap: 16 },
  statCard: {
    background: 'var(--sh-soft)',
    borderRadius: 14,
    padding: '24px 28px',
    textAlign: 'center',
  },
  statValue: { fontSize: 42, fontWeight: 'bold', color: 'var(--sh-brand)', marginBottom: 4 },
  statLabel: { fontSize: 13, color: 'var(--sh-muted)' },
  goalsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 20,
  },
  goalCard: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 14,
    padding: '28px 24px',
  },
  goalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  goalTitle: { fontSize: 16, fontWeight: 'bold', color: 'var(--sh-heading)', margin: '0 0 8px' },
  goalDesc: { fontSize: 14, color: 'var(--sh-muted)', margin: 0, lineHeight: 1.6 },
  stepsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: 24,
  },
  stepCard: {
    background: 'var(--sh-soft)',
    borderRadius: 14,
    padding: '32px 24px',
    textAlign: 'center',
  },
  stepNum: { fontSize: 40, fontWeight: 'bold', color: 'var(--sh-border)', marginBottom: 16 },
  stepTitle: { fontSize: 18, fontWeight: 'bold', color: 'var(--sh-heading)', margin: '0 0 12px' },
  stepDesc: { fontSize: 14, color: 'var(--sh-muted)', margin: 0, lineHeight: 1.7 },
  roadmapGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: 32,
  },
  roadmapCol: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 14,
    padding: '28px 24px',
  },
  roadmapTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    margin: '0 0 20px',
    color: 'var(--sh-heading)',
  },
  roadmapList: { listStyle: 'none', padding: 0, margin: 0 },
  roadmapItem: {
    fontSize: 14,
    color: 'var(--sh-subtext)',
    padding: '8px 0',
    borderBottom: '1px solid var(--sh-border)',
    display: 'flex',
    alignItems: 'flex-start',
  },
  teamCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 20,
    background: 'var(--sh-soft)',
    borderRadius: 16,
    padding: '28px 32px',
    marginBottom: 20,
  },
  teamAvatar: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: 'var(--sh-brand)',
    color: 'var(--sh-nav-text)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 24,
    fontWeight: 'bold',
    flexShrink: 0,
  },
  teamName: { fontSize: 18, fontWeight: 'bold', color: 'var(--sh-heading)', marginBottom: 4 },
  teamRole: { fontSize: 13, color: 'var(--sh-muted)', marginBottom: 10 },
  teamBio: { fontSize: 14, color: 'var(--sh-subtext)', margin: 0, lineHeight: 1.7 },
  openSourceNote: { fontSize: 14, color: 'var(--sh-muted)', textAlign: 'center' },
  link: { color: 'var(--sh-brand)', fontWeight: 'bold' },
  reviewsSection: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '60px 20px',
  },
  reviewsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 16,
    marginTop: 24,
  },
  reviewCard: {
    padding: '18px 20px',
    borderRadius: 14,
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    display: 'grid',
    gap: 8,
  },
  footer: { background: 'var(--sh-footer-dark-bg)', padding: '40px 20px', textAlign: 'center' },
  footerLinks: {
    display: 'flex',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  footerLink: { color: 'var(--sh-footer-dark-muted)', textDecoration: 'none', fontSize: 14 },
  footerCopy: { color: 'var(--sh-footer-dark-copy)', fontSize: 12, margin: 0 },
}
