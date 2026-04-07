import Navbar from '../../components/navbar/Navbar'
import { Link } from 'react-router-dom'

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
          <div style={s.heroBadge}>Open Source · Student Built · Community Driven</div>
          <h1 style={s.heroH1}>
            Built by Students,
            <br />
            for Students
          </h1>
          <p style={s.heroSub}>
            StudyHub is a collaborative study platform where you can create, share, and build on
            each other&apos;s notes — GitHub-style, but for studying.
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
                Every semester, students at the University of Maryland scramble to find good study
                materials. Notes get lost in Discord servers, Google Drive folders no one can find,
                and group chats that die after finals.
              </p>
              <p style={s.p}>
                We wanted something better — a place where study materials are{' '}
                <strong>organized by course</strong>, easy to discover, and built collaboratively.
                The same way developers share and improve code on GitHub, students should be able to
                share and improve notes.
              </p>
              <p style={s.p}>
                That&apos;s StudyHub Version 1. Start at Maryland. Scale to every campus.
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
            <RoadmapColumn title="V2.0.0 — Current" color={ROADMAP_TONES.current} items={ROADMAP_V20} />
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
      <div style={{ ...s.goalIconWrap, background: tone.background, border: `1px solid ${tone.border}` }}>
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
  roadmapGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 32 },
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
