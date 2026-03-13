import Navbar from '../components/Navbar'
function HomePage() {
  return (
    <div style={styles.page}>
      <Navbar />
      {/* ANNOUNCEMENT BANNER */}
      <div style={styles.banner}>
        <i className="fas fa-bullhorn" style={{ marginRight: '8px' }}></i>
        <strong>Announcement:</strong>&nbsp;
        Midterm exam covers Weeks 1–6. Study guide now available!
      </div>

      {/* HERO */}
      <div style={styles.hero}>
        <h1 style={styles.heroTitle}>
          The GitHub of Studying 🎓
        </h1>
        <p style={styles.heroSub}>
          Study sheets, practice tests, announcements, and AI help —
          all in one place. Collaborate, contribute, and learn together.
          No downloads required — but available if you want them.
        </p>
        <div style={styles.heroButtons}>
          <Link to="/register" style={styles.btnPrimary}>
            Get Started
          </Link>
          <Link to="/explore" style={styles.btnOutline}>
            Browse Study Sheets
          </Link>
        </div>

        {/* HERO STATS */}
        <div style={styles.stats}>
          <div style={styles.stat}>
            <span style={styles.statNum}>30+</span>
            <span style={styles.statLabel}>Maryland Schools</span>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.stat}>
            <span style={styles.statNum}>100%</span>
            <span style={styles.statLabel}>Student Built</span>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.stat}>
            <span style={styles.statNum}>Free</span>
            <span style={styles.statLabel}>Always & Forever</span>
          </div>
        </div>
      </div>

      {/* FEATURE CARDS */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Everything You Need to Succeed</h2>
        <p style={styles.sectionSub}>
          Built by students, for students — across every school, every subject, every course.
        </p>
        <div style={styles.grid}>
          {features.map((f, i) => (
            <FeatureCard key={i} {...f} />
          ))}
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div style={styles.howSection}>
        <h2 style={styles.sectionTitle}>How It Works</h2>
        <div style={styles.stepsGrid}>
          {steps.map((s, i) => (
            <div key={i} style={styles.step}>
              <div style={styles.stepNum}>{i + 1}</div>
              <i className={s.icon} style={styles.stepIcon}></i>
              <h3 style={styles.stepTitle}>{s.title}</h3>
              <p style={styles.stepDesc}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA BANNER */}
      <div style={styles.cta}>
        <h2 style={styles.ctaTitle}>Ready to study smarter?</h2>
        <p style={styles.ctaSub}>
          Join thousands of students already using StudyHub.
          No email required. Free forever.
        </p>
        <Link to="/register" style={styles.ctaBtn}>
          Create Your Free Account
        </Link>
      </div>

      {/* FOOTER */}
      <footer style={styles.footer}>
        <div style={styles.footerLinks}>
          <Link to="/terms" style={styles.footerLink}>Terms of Use</Link>
          <span style={styles.footerDot}>·</span>
          <Link to="/privacy" style={styles.footerLink}>Privacy Policy</Link>
          <span style={styles.footerDot}>·</span>
          <Link to="/guidelines" style={styles.footerLink}>Community Guidelines</Link>
          <span style={styles.footerDot}>·</span>
          <a href="https://github.com/Apexone11/studyhub" 
             target="_blank" 
             rel="noopener noreferrer" 
             style={styles.footerLink}>
            GitHub
          </a>
        </div>
        <div style={{ marginTop: '10px' }}>
          Built by students, for students ·{' '}
          <span style={styles.footerSpan}>StudyHub</span> · Open Source
        </div>
      </footer>
    </div>
  )
}

// ---- FEATURE CARD ----
function FeatureCard({ icon, title, desc, badge }) {
  return (
    <div
      style={styles.card}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.08)'
      }}
    >
      {badge && <div style={styles.badge}>{badge}</div>}
      <div style={styles.cardIcon}>
        <i className={icon}></i>
      </div>
      <h3 style={styles.cardTitle}>{title}</h3>
      <p style={styles.cardDesc}>{desc}</p>
    </div>
  )
}

// ---- DATA ----
const features = [
  {
    icon: 'fas fa-book-open',
    title: 'Study Sheets',
    desc: 'View and contribute community study guides directly in your browser. Fork any guide and make it your own.',
    badge: null,
  },
  {
    icon: 'fas fa-clipboard-check',
    title: 'Practice Tests',
    desc: 'Take tests built by students, run safely in your browser. Download them to your computer anytime.',
    badge: null,
  },
  {
    icon: 'fas fa-bullhorn',
    title: 'Announcements',
    desc: 'Real-time course announcements from instructors and admins. Never miss an update.',
    badge: null,
  },
  {
    icon: 'fas fa-robot',
    title: 'AI Assistant',
    desc: 'Stuck on a concept? Ask the AI tutor and get a clear, instant explanation tailored to your course.',
    badge: 'Coming Soon',
  },
  {
    icon: 'fas fa-pen-to-square',
    title: 'Personal Notes',
    desc: 'Add private notes to any topic. Saved securely to your account. Share with classmates optionally.',
    badge: null,
  },
  {
    icon: 'fas fa-code-branch',
    title: 'Fork & Contribute',
    desc: 'Like GitHub — fork any study sheet, improve it, and submit it back. Build on each other\'s work.',
    badge: null,
  },
  {
    icon: 'fas fa-graduation-cap',
    title: 'Multi-School',
    desc: 'Starting with all 30+ Maryland schools. Every subject, every course. Expanding nationwide.',
    badge: null,
  },
  {
    icon: 'fas fa-download',
    title: 'Download Anything',
    desc: 'Want to study offline? Download any study sheet or practice test directly to your computer.',
    badge: null,
  },
  {
    icon: 'fas fa-shield-halved',
    title: 'Secure by Design',
    desc: 'Your account, your data. Enterprise-grade security. No email required to sign up.',
    badge: null,
  },
]

const steps = [
  {
    icon: 'fas fa-user-plus',
    title: 'Create an Account',
    desc: 'Sign up with just a username and password. No email required. Pick your school and courses.',
  },
  {
    icon: 'fas fa-magnifying-glass',
    title: 'Find Your Content',
    desc: 'Browse study sheets, practice tests, and notes for your exact courses at your school.',
  },
  {
    icon: 'fas fa-code-branch',
    title: 'Contribute & Collaborate',
    desc: 'Upload your own study guides, fork others\' work, and help your classmates succeed.',
  },
  {
    icon: 'fas fa-trophy',
    title: 'Succeed Together',
    desc: 'Learn from each other. The best content rises to the top — just like GitHub.',
  },
]

// ---- STYLES ----
const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Arial, sans-serif',
    background: '#f0f4f8',
  },
  banner: {
    background: '#fef9c3',
    borderLeft: '5px solid #eab308',
    padding: '12px 40px',
    fontSize: '14px',
    color: '#713f12',
  },
  hero: {
    background: 'linear-gradient(135deg, #1e3a5f, #2563eb)',
    color: 'white',
    textAlign: 'center',
    padding: '80px 20px 60px',
  },
  heroTitle: {
    fontSize: '52px',
    marginBottom: '16px',
    fontWeight: 'bold',
  },
  heroSub: {
    fontSize: '18px',
    color: '#bfdbfe',
    maxWidth: '620px',
    margin: '0 auto',
    lineHeight: '1.7',
  },
  heroButtons: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
    marginTop: '32px',
    flexWrap: 'wrap',
  },
  btnPrimary: {
    background: '#2563eb',
    color: 'white',
    padding: '14px 32px',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
    textDecoration: 'none',
    border: '2px solid #3b82f6',
  },
  btnOutline: {
    background: 'transparent',
    color: 'white',
    padding: '14px 32px',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
    textDecoration: 'none',
    border: '2px solid white',
  },
  stats: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '32px',
    marginTop: '48px',
    flexWrap: 'wrap',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  statNum: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#ffffff',
  },
  statLabel: {
    fontSize: '13px',
    color: '#93c5fd',
    marginTop: '2px',
  },
  statDivider: {
    width: '1px',
    height: '40px',
    background: 'rgba(255,255,255,0.2)',
  },
  section: {
    padding: '60px 40px',
  },
  sectionTitle: {
    textAlign: 'center',
    fontSize: '32px',
    marginBottom: '12px',
    color: '#1e3a5f',
  },
  sectionSub: {
    textAlign: 'center',
    fontSize: '15px',
    color: '#6b7280',
    marginBottom: '40px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    padding: '28px 24px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    textAlign: 'center',
    transition: 'transform 0.2s, box-shadow 0.2s',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    background: '#eff6ff',
    color: '#2563eb',
    fontSize: '10px',
    fontWeight: 'bold',
    padding: '3px 8px',
    borderRadius: '999px',
    border: '1px solid #bfdbfe',
  },
  cardIcon: {
    fontSize: '36px',
    marginBottom: '14px',
    color: '#2563eb',
  },
  cardTitle: {
    fontSize: '17px',
    marginBottom: '8px',
    color: '#1e3a5f',
    fontWeight: 'bold',
  },
  cardDesc: {
    fontSize: '14px',
    color: '#6b7280',
    lineHeight: '1.6',
  },
  howSection: {
    padding: '60px 40px',
    background: '#1e3a5f',
  },
  stepsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '32px',
    maxWidth: '1000px',
    margin: '0 auto',
  },
  step: {
    textAlign: 'center',
    color: 'white',
  },
  stepNum: {
    width: '36px',
    height: '36px',
    background: '#2563eb',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '16px',
    margin: '0 auto 16px',
  },
  stepIcon: {
    fontSize: '32px',
    color: '#60a5fa',
    marginBottom: '12px',
    display: 'block',
  },
  stepTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '8px',
    color: '#ffffff',
  },
  stepDesc: {
    fontSize: '13px',
    color: '#93c5fd',
    lineHeight: '1.6',
  },
  cta: {
    background: 'linear-gradient(135deg, #2563eb, #1e3a5f)',
    textAlign: 'center',
    padding: '60px 20px',
    color: 'white',
  },
  ctaTitle: {
    fontSize: '32px',
    fontWeight: 'bold',
    marginBottom: '12px',
  },
  ctaSub: {
    fontSize: '16px',
    color: '#bfdbfe',
    marginBottom: '28px',
  },
  ctaBtn: {
    background: 'white',
    color: '#1e3a5f',
    padding: '14px 36px',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
    textDecoration: 'none',
    display: 'inline-block',
  },
  footer: {
    background: '#111827',
    color: '#94a3b8',
    textAlign: 'center',
    padding: '28px 40px',
    fontSize: '14px',
  },
  footerLinks: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '4px',
  },
  footerLink: {
    color: '#60a5fa',
    textDecoration: 'none',
    fontSize: '13px',
  },
  footerDot: {
    color: '#374151',
  },
  footerSpan: {
    color: '#60a5fa',
  },
  
}

export default HomePage