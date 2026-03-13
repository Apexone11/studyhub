import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'

const FEATURES = [
  {
    iconClass: 'fa-regular fa-file-lines',
    title: 'Study Sheets',
    desc: 'Community-built guides for every course. Fork any sheet and make it your own.',
    toneClass: 'home-feature--blue'
  },
  {
    iconClass: 'fa-solid fa-pen-to-square',
    title: 'Practice Tests',
    desc: 'Take student-made tests right in your browser. Download anytime for offline use.',
    toneClass: 'home-feature--green'
  },
  {
    iconClass: 'fa-solid fa-bullhorn',
    title: 'Announcements',
    desc: 'Real-time course updates from instructors. Never miss a deadline or change.',
    toneClass: 'home-feature--amber'
  },
  {
    iconClass: 'fa-solid fa-robot',
    title: 'AI Tutor',
    desc: 'Stuck on a concept? Get instant explanations tailored to your exact course.',
    toneClass: 'home-feature--purple',
    badge: 'Coming Soon'
  },
  {
    iconClass: 'fa-solid fa-pencil',
    title: 'Personal Notes',
    desc: 'Keep private notes tied to any course. Share with classmates when you are ready.',
    toneClass: 'home-feature--rose'
  },
  {
    iconClass: 'fa-solid fa-code-branch',
    title: 'Fork and Contribute',
    desc: 'Like GitHub: fork any study sheet, improve it, and contribute it back.',
    toneClass: 'home-feature--teal'
  },
  {
    iconClass: 'fa-solid fa-school',
    title: 'Multi-School',
    desc: 'All 30+ Maryland schools. Every subject, every course. Expanding nationwide.',
    toneClass: 'home-feature--orange'
  },
  {
    iconClass: 'fa-solid fa-download',
    title: 'Download Anything',
    desc: 'Save any study material to your device. Works offline when you need it.',
    toneClass: 'home-feature--slate'
  },
  {
    iconClass: 'fa-solid fa-lock',
    title: 'Always Free',
    desc: 'No paywalls, no subscriptions, no ads. StudyHub is free forever.',
    toneClass: 'home-feature--green'
  }
]

const STEPS = [
  {
    n: '01',
    title: 'Create your account',
    desc: 'No email needed. Just a username and password.'
  },
  {
    n: '02',
    title: 'Pick your school and courses',
    desc: 'Select from 30+ Maryland schools and hundreds of courses.'
  },
  {
    n: '03',
    title: 'Access everything',
    desc: 'Study sheets, tests, and announcements organized for your courses.'
  }
]

export default function HomePage() {
  const currentYear = new Date().getFullYear()

  return (
    <div className="home-page">
      <Navbar />

      <section className="home-hero">
        <div className="home-hero-orb home-hero-orb--one" aria-hidden="true" />
        <div className="home-hero-orb home-hero-orb--two" aria-hidden="true" />
        <div className="home-hero-orb home-hero-orb--three" aria-hidden="true" />

        <div className="home-hero-content animate-fadeUp">
          <div className="home-pill">
            <span className="home-pill-dot" aria-hidden="true" />
            <span>Built by students · Free forever</span>
          </div>

          <h1 className="home-hero-title">
            The GitHub of
            <span className="home-hero-title-accent"> Studying</span>
          </h1>

          <p className="home-hero-subtitle">
            Study sheets, practice tests, announcements, and AI help. Collaborate, contribute,
            and learn together in one place.
          </p>

          <div className="home-hero-actions">
            <Link to="/register" className="home-btn home-btn-primary">
              Get Started Free
              <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </Link>
            <Link to="/sheets" className="home-btn home-btn-ghost">
              Browse Study Sheets
            </Link>
          </div>

          <div className="home-stats-row">
            {[
              { value: '30+', label: 'Maryland Schools' },
              { value: '100%', label: 'Student Built' },
              { value: 'Free', label: 'Always and Forever' }
            ].map((stat) => (
              <div key={stat.label} className="home-stat-item">
                <div className="home-stat-value">{stat.value}</div>
                <div className="home-stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="home-features-section">
        <div className="home-shell">
          <div className="home-section-header">
            <p className="home-section-kicker">Everything You Need</p>
            <h2 className="home-section-title">Built to Help You Succeed</h2>
          </div>

          <div className="home-features-grid">
            {FEATURES.map((feature) => (
              <article key={feature.title} className={`home-feature-card ${feature.toneClass}`}>
                {feature.badge && <span className="home-feature-badge">{feature.badge}</span>}
                <div className="home-feature-icon-wrap" aria-hidden="true">
                  <i className={`${feature.iconClass} home-icon home-icon-lg`} />
                </div>
                <h3 className="home-feature-title">{feature.title}</h3>
                <p className="home-feature-desc">{feature.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-steps-section">
        <div className="home-shell home-shell-narrow">
          <div className="home-section-header">
            <p className="home-section-kicker">Simple Setup</p>
            <h2 className="home-section-title">Up and Running in 60 Seconds</h2>
          </div>

          <div className="home-steps-grid">
            {STEPS.map((step) => (
              <article key={step.n} className="home-step-card">
                <div className="home-step-number">{step.n}</div>
                <h3 className="home-step-title">{step.title}</h3>
                <p className="home-step-desc">{step.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-cta-section">
        <div className="home-shell home-shell-narrow home-cta-content">
          <h2 className="home-cta-title">Ready to Study Smarter?</h2>
          <p className="home-cta-subtitle">
            Join thousands of students already using StudyHub. It is free.
          </p>
          <Link to="/register" className="home-btn home-btn-primary home-btn-large">
            Create Your Free Account
            <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="home-footer">
        <div className="home-shell">
          <div className="home-footer-logo-row">
            <div className="home-footer-logo-icon" aria-hidden="true">
              <i className="fa-solid fa-book-open home-icon" />
            </div>
            <span className="home-footer-logo-text">
              Study<span>Hub</span>
            </span>
          </div>

          <div className="home-footer-links">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/guidelines">Guidelines</Link>
            <a
              href="https://github.com/Apexone11/studyhub"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </div>

          <p className="home-footer-copy">
            © {currentYear} StudyHub · Built by students, for students · Open Source
          </p>
        </div>
      </footer>
    </div>
  )
}
