import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import {
  IconAnnouncements,
  IconArrowRight,
  IconCheck,
  IconDownload,
  IconFork,
  IconPen,
  IconSchool,
  IconSheets,
  IconSpark,
  IconTests,
  LogoMark,
} from '../components/Icons'

const FEATURES = [
  {
    Icon: IconSheets,
    title: 'Study Sheets',
    desc: 'Community-built guides for every course. Fork any sheet and make it your own.',
    toneClass: 'home-feature--blue'
  },
  {
    Icon: IconTests,
    title: 'Practice Tests',
    desc: 'Take student-made tests right in your browser. Download anytime for offline use.',
    toneClass: 'home-feature--green'
  },
  {
    Icon: IconAnnouncements,
    title: 'Announcements',
    desc: 'Real-time course updates from instructors. Never miss a deadline or change.',
    toneClass: 'home-feature--amber'
  },
  {
    Icon: IconSpark,
    title: 'AI Tutor',
    desc: 'Stuck on a concept? Get instant explanations tailored to your exact course.',
    toneClass: 'home-feature--purple',
    badge: 'Coming Soon'
  },
  {
    Icon: IconPen,
    title: 'Personal Notes',
    desc: 'Keep private notes tied to any course. Share with classmates when you are ready.',
    toneClass: 'home-feature--rose'
  },
  {
    Icon: IconFork,
    title: 'Fork and Contribute',
    desc: 'Like GitHub: fork any study sheet, improve it, and contribute it back.',
    toneClass: 'home-feature--teal'
  },
  {
    Icon: IconSchool,
    title: 'Multi-School',
    desc: 'All 30+ Maryland schools. Every subject, every course. Expanding nationwide.',
    toneClass: 'home-feature--orange'
  },
  {
    Icon: IconDownload,
    title: 'Download Anything',
    desc: 'Save any study material to your device. Works offline when you need it.',
    toneClass: 'home-feature--slate'
  },
  {
    Icon: IconCheck,
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
  const navigate = useNavigate()
  const [heroSearch, setHeroSearch] = useState('')

  function handleHeroSearch(e) {
    e.preventDefault()
    if (heroSearch.trim()) navigate(`/sheets?q=${encodeURIComponent(heroSearch.trim())}`)
  }

  return (
    <div className="home-page">
      <Navbar variant="landing" />

      <section className="home-hero">
        {/* Decorative animated fork-tree */}
        <svg className="home-hero-tree hero-tree-base" viewBox="0 0 56 56" fill="none" aria-hidden="true">
          <line x1="28" y1="46" x2="28" y2="32" stroke="#60a5fa" strokeWidth="2.2" strokeLinecap="round"/>
          <path d="M28 32 Q28 24 18 17" stroke="#60a5fa" strokeWidth="1.9" fill="none" strokeLinecap="round"/>
          <path d="M28 32 Q28 24 38 17" stroke="#60a5fa" strokeWidth="1.9" fill="none" strokeLinecap="round"/>
          <path d="M18 17 Q14 12 11 9" stroke="#93c5fd" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
          <path d="M18 17 Q18 12 21 9" stroke="#93c5fd" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
          <path d="M38 17 Q35 12 35 9" stroke="#93c5fd" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
          <path d="M38 17 Q41 12 45 9" stroke="#93c5fd" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
          <circle cx="28" cy="46" r="3.5" stroke="#60a5fa" strokeWidth="1.6" fill="none"/>
          <circle cx="28" cy="32" r="2.6" stroke="#60a5fa" strokeWidth="1.4" fill="none"/>
          <circle cx="18" cy="17" r="2.6" stroke="#60a5fa" strokeWidth="1.4" fill="none"/>
          <circle cx="38" cy="17" r="2.6" stroke="#60a5fa" strokeWidth="1.4" fill="none"/>
          <circle cx="11" cy="9"  r="1.8" stroke="#93c5fd" strokeWidth="1.2" fill="none"/>
          <circle cx="21" cy="9"  r="1.8" stroke="#93c5fd" strokeWidth="1.2" fill="none"/>
          <circle cx="35" cy="9"  r="1.8" stroke="#93c5fd" strokeWidth="1.2" fill="none"/>
          <circle cx="45" cy="9"  r="1.8" stroke="#93c5fd" strokeWidth="1.2" fill="none"/>
        </svg>
        <svg className="home-hero-tree hero-tree-pulse" viewBox="0 0 56 56" fill="none" aria-hidden="true">
          <line x1="28" y1="46" x2="28" y2="32" stroke="#60a5fa" strokeWidth="2.2" strokeLinecap="round"/>
          <path d="M28 32 Q28 24 18 17" stroke="#60a5fa" strokeWidth="1.9" fill="none" strokeLinecap="round"/>
          <path d="M28 32 Q28 24 38 17" stroke="#60a5fa" strokeWidth="1.9" fill="none" strokeLinecap="round"/>
          <path d="M18 17 Q14 12 11 9" stroke="#93c5fd" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
          <path d="M18 17 Q18 12 21 9" stroke="#93c5fd" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
          <path d="M38 17 Q35 12 35 9" stroke="#93c5fd" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
          <path d="M38 17 Q41 12 45 9" stroke="#93c5fd" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
          <circle cx="28" cy="46" r="3.5" stroke="#60a5fa" strokeWidth="1.6" fill="none"/>
          <circle cx="28" cy="32" r="2.6" stroke="#60a5fa" strokeWidth="1.4" fill="none"/>
          <circle cx="18" cy="17" r="2.6" stroke="#60a5fa" strokeWidth="1.4" fill="none"/>
          <circle cx="38" cy="17" r="2.6" stroke="#60a5fa" strokeWidth="1.4" fill="none"/>
          <circle cx="11" cy="9"  r="1.8" stroke="#93c5fd" strokeWidth="1.2" fill="none"/>
          <circle cx="21" cy="9"  r="1.8" stroke="#93c5fd" strokeWidth="1.2" fill="none"/>
          <circle cx="35" cy="9"  r="1.8" stroke="#93c5fd" strokeWidth="1.2" fill="none"/>
          <circle cx="45" cy="9"  r="1.8" stroke="#93c5fd" strokeWidth="1.2" fill="none"/>
        </svg>
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
            <Link to="/register" className="home-btn home-btn-primary hero-cta-glow">
              Get Started Free
              <IconArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link to="/sheets" className="home-btn home-btn-ghost">
              Browse Study Sheets
            </Link>
          </div>

          <form onSubmit={handleHeroSearch} style={{ display: 'flex', alignItems: 'center', gap: 0, maxWidth: 480, width: '100%', margin: '24px auto 0', background: 'rgba(255,255,255,0.06)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden' }}>
            <i className="fas fa-search" style={{ padding: '0 12px', color: '#64748b', fontSize: 14, flexShrink: 0 }}></i>
            <input
              type="text"
              value={heroSearch}
              onChange={e => setHeroSearch(e.target.value)}
              placeholder="Search sheets, courses, topics..."
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f1f5f9', fontSize: 14, padding: '12px 0', fontFamily: 'inherit' }}
            />
            <button type="submit" style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '12px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
              Search
            </button>
          </form>

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
                  <feature.Icon className="home-icon home-icon-lg" size={22} />
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
          <Link to="/register" className="home-btn home-btn-primary home-btn-large hero-cta-glow">
            Create Your Free Account
            <IconArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="home-footer">
        <div className="home-shell">
          <div className="home-footer-logo-row">
            <div className="home-footer-logo-icon" aria-hidden="true">
              <LogoMark size={28} />
            </div>
            <span className="home-footer-logo-text">
              Study<span>Hub</span>
            </span>
          </div>

          <div className="home-footer-links">
            <Link to="/about">About</Link>
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
