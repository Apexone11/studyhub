import Navbar from '../../components/navbar/Navbar'
import { Link } from 'react-router-dom'

const ROADMAP_VERSION_1 = [
  'Study sheet creation, uploads, and sharing',
  'Forks, stars, downloads, comments, and public profiles',
  'Per-course organization with school directories',
  'Private markdown notes linked to your courses',
  'Verified email, password reset, and 2-step verification',
  'Account settings, course management, and team announcements',
]

const ROADMAP_VERSION_2 = [
  'AI Tutor — ask questions about your study materials',
  'Practice Tests with auto-scoring',
  'Mobile App (iOS & Android)',
  'Study groups & real-time collaboration',
  'Smarter recommendations and campus expansion',
]

const HOW_STEPS = [
  { step: '01', title: 'Create your account', desc: 'Sign up in seconds. Pick your school and courses to get a personalized feed.' },
  { step: '02', title: 'Browse & fork sheets', desc: 'Find study sheets from classmates. Fork them to make your own version — like GitHub for notes.' },
  { step: '03', title: 'Study together', desc: 'Star the best sheets, leave comments, and build a shared knowledge base for your class.' },
]

export default function AboutPage() {
  return (
    <div style={s.page}>
      <Navbar />

      {/* ── HERO ─────────────────────────────────────── */}
      <section style={s.hero}>
        <div style={s.heroInner}>
          <div style={s.heroBadge}>Open Source · Student Built · Free Forever</div>
          <h1 style={s.heroH1}>Built by Students,<br />for Students</h1>
          <p style={s.heroSub}>
            StudyHub is a collaborative study platform where you can create, share, and build on
            each other&apos;s notes — GitHub-style, but for studying.
          </p>
          <div style={s.heroCtas}>
            <Link to="/register" style={s.ctaPrimary}>Get Started Free</Link>
            <Link to="/feed" style={s.ctaSecondary}>Browse Sheets</Link>
          </div>
        </div>
      </section>

      {/* ── WHY WE BUILT THIS ────────────────────────── */}
      <section style={s.section}>
        <div style={s.sectionInner}>
          <h2 style={s.sectionH2}>Why We Built This</h2>
          <div style={s.storyGrid}>
            <div style={s.storyText}>
              <p style={s.p}>
                Every semester, students at the University of Maryland scramble to find good study
                materials. Notes get lost in Discord servers, Google Drive folders no one can find, and
                group chats that die after finals.
              </p>
              <p style={s.p}>
                We wanted something better — a place where study materials are <strong>organized by
                course</strong>, easy to discover, and built collaboratively. The same way developers
                share and improve code on GitHub, students should be able to share and improve notes.
              </p>
              <p style={s.p}>
                That&apos;s StudyHub Version 1. Start at Maryland. Scale to every campus.
              </p>
            </div>
            <div style={s.storyStats}>
              <StatCard value="∞" label="Study sheets you can create" />
              <StatCard value="0" label="Dollars it costs" />
              <StatCard value="100%" label="Open source" />
            </div>
          </div>
        </div>
      </section>

      {/* ── OUR GOALS ───────────────────────────────── */}
      <section style={{ ...s.section, background: '#f8fafc' }}>
        <div style={s.sectionInner}>
          <h2 style={s.sectionH2}>Our Goals</h2>
          <div style={s.goalsGrid}>
            <GoalCard faIcon="fa-book-open"    color="#2563eb" title="Open Access"            desc="All study materials are free. No paywalls, no subscriptions, no premium tiers." />
            <GoalCard faIcon="fa-users"         color="#7c3aed" title="Student Collaboration"  desc="Notes improve when many minds work on them. Fork, edit, and build on each other's work." />
            <GoalCard faIcon="fa-map-location-dot" color="#0891b2" title="Start Local, Go National" desc="Maryland first. Then every university. Students everywhere deserve better study tools." />
            <GoalCard faIcon="fa-shield-halved" color="#16a34a" title="Privacy First"          desc="We collect only what we need. No selling data. No third-party ads." />
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
      <section style={{ ...s.section, background: '#f8fafc' }}>
        <div style={s.sectionInner}>
          <h2 style={s.sectionH2}>Roadmap</h2>
          <div style={s.roadmapGrid}>
            <RoadmapColumn title="Version 1 — Live Now" color="#16a34a" items={ROADMAP_VERSION_1} />
            <RoadmapColumn title="Version 2 — Coming Soon" color="#2563eb" items={ROADMAP_VERSION_2} />
          </div>
        </div>
      </section>

      {/* ── TEAM ────────────────────────────────────── */}
      <section style={s.section}>
        <div style={s.sectionInner}>
          <h2 style={s.sectionH2}>The Team</h2>
          <div style={s.teamCard}>
            <div style={s.teamAvatar}>A</div>
            <div>
              <div style={s.teamName}>Abdul Rahman Fornah</div>
              <div style={s.teamRole}>Founder & Lead Developer</div>
              <p style={s.teamBio}>
                Student developer who got tired of losing study notes. Built StudyHub to solve the problem
                for everyone at UMD and beyond.
              </p>
            </div>
          </div>
          <p style={s.openSourceNote}>
            StudyHub is open source and welcomes contributors.{' '}
            <a href="https://github.com/Apexone11" style={s.link} target="_blank" rel="noopener noreferrer">
              View on GitHub →
            </a>
          </p>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────── */}
      <footer style={s.footer}>
        <div style={s.footerLinks}>
          <Link to="/" style={s.footerLink}>Home</Link>
          <Link to="/feed" style={s.footerLink}>Browse</Link>
          <Link to="/privacy" style={s.footerLink}>Privacy</Link>
          <Link to="/terms" style={s.footerLink}>Terms</Link>
          <Link to="/guidelines" style={s.footerLink}>Guidelines</Link>
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

function GoalCard({ faIcon, color, title, desc }) {
  return (
    <div style={s.goalCard}>
      <div style={{ ...s.goalIconWrap, background: color + '18', border: `1px solid ${color}33` }}>
        <i className={`fas ${faIcon}`} style={{ color, fontSize: 18 }}></i>
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
            <i className="fas fa-check" style={{ color, fontSize: 11, marginRight: 10, marginTop: 3, flexShrink: 0 }}></i>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', fontFamily: "'Plus Jakarta Sans', sans-serif", background: 'var(--sh-surface)', color: 'var(--sh-text)' },
  hero: { background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', padding: '120px 20px 80px' },
  heroInner: { maxWidth: 720, margin: '0 auto', textAlign: 'center' },
  heroBadge: { display: 'inline-block', background: 'rgba(59,130,246,0.2)', color: '#60a5fa', fontSize: 12, fontWeight: 'bold', padding: '6px 16px', borderRadius: 20, border: '1px solid rgba(59,130,246,0.4)', marginBottom: 24, letterSpacing: 1 },
  heroH1: { fontSize: 'clamp(32px, 5vw, 54px)', fontWeight: 'bold', color: '#f8fafc', margin: '0 0 20px', lineHeight: 1.15 },
  heroSub: { fontSize: 18, color: '#94a3b8', margin: '0 0 36px', lineHeight: 1.7 },
  heroCtas: { display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' },
  ctaPrimary: { background: 'var(--sh-brand)', color: '#fff', textDecoration: 'none', padding: '14px 32px', borderRadius: 10, fontWeight: 'bold', fontSize: 15 },
  ctaSecondary: { background: 'transparent', color: '#94a3b8', textDecoration: 'none', padding: '14px 32px', borderRadius: 10, fontWeight: 'bold', fontSize: 15, border: '1px solid rgba(148,163,184,0.4)' },
  section: { padding: '80px 20px' },
  sectionInner: { maxWidth: 1000, margin: '0 auto' },
  sectionH2: { fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 'bold', color: 'var(--sh-heading)', margin: '0 0 40px', textAlign: 'center' },
  storyGrid: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 48, alignItems: 'start' },
  storyText: {},
  p: { fontSize: 16, color: 'var(--sh-subtext)', lineHeight: 1.8, margin: '0 0 16px' },
  storyStats: { display: 'flex', flexDirection: 'column', gap: 16 },
  statCard: { background: 'var(--sh-soft)', borderRadius: 14, padding: '24px 28px', textAlign: 'center' },
  statValue: { fontSize: 42, fontWeight: 'bold', color: 'var(--sh-brand)', marginBottom: 4 },
  statLabel: { fontSize: 13, color: 'var(--sh-muted)' },
  goalsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 },
  goalCard: { background: 'var(--sh-surface)', border: '1px solid var(--sh-border)', borderRadius: 14, padding: '28px 24px' },
  goalIconWrap: { width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  goalTitle: { fontSize: 16, fontWeight: 'bold', color: 'var(--sh-heading)', margin: '0 0 8px' },
  goalDesc: { fontSize: 14, color: 'var(--sh-muted)', margin: 0, lineHeight: 1.6 },
  stepsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24 },
  stepCard: { background: 'var(--sh-soft)', borderRadius: 14, padding: '32px 24px', textAlign: 'center' },
  stepNum: { fontSize: 40, fontWeight: 'bold', color: 'var(--sh-border)', marginBottom: 16 },
  stepTitle: { fontSize: 18, fontWeight: 'bold', color: 'var(--sh-heading)', margin: '0 0 12px' },
  stepDesc: { fontSize: 14, color: 'var(--sh-muted)', margin: 0, lineHeight: 1.7 },
  roadmapGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 },
  roadmapCol: { background: 'var(--sh-surface)', border: '1px solid var(--sh-border)', borderRadius: 14, padding: '28px 24px' },
  roadmapTitle: { fontSize: 18, fontWeight: 'bold', margin: '0 0 20px', color: 'var(--sh-heading)' },
  roadmapList: { listStyle: 'none', padding: 0, margin: 0 },
  roadmapItem: { fontSize: 14, color: 'var(--sh-subtext)', padding: '8px 0', borderBottom: '1px solid var(--sh-border)', display: 'flex', alignItems: 'flex-start' },
  teamCard: { display: 'flex', alignItems: 'flex-start', gap: 20, background: 'var(--sh-soft)', borderRadius: 16, padding: '28px 32px', marginBottom: 20 },
  teamAvatar: { width: 56, height: 56, borderRadius: '50%', background: 'var(--sh-brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 'bold', flexShrink: 0 },
  teamName: { fontSize: 18, fontWeight: 'bold', color: 'var(--sh-heading)', marginBottom: 4 },
  teamRole: { fontSize: 13, color: 'var(--sh-muted)', marginBottom: 10 },
  teamBio: { fontSize: 14, color: 'var(--sh-subtext)', margin: 0, lineHeight: 1.7 },
  openSourceNote: { fontSize: 14, color: 'var(--sh-muted)', textAlign: 'center' },
  link: { color: 'var(--sh-brand)', fontWeight: 'bold' },
  footer: { background: '#0f172a', padding: '40px 20px', textAlign: 'center' },
  footerLinks: { display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 16, flexWrap: 'wrap' },
  footerLink: { color: '#94a3b8', textDecoration: 'none', fontSize: 14 },
  footerCopy: { color: '#475569', fontSize: 12, margin: 0 },
}
