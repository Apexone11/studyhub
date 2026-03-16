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
        {/* Background tree illustration — fork-tree motif scaled up, behind cards */}
        <div className="home-steps-bg-art" aria-hidden="true">
          <svg
            viewBox="0 0 900 460"
            preserveAspectRatio="xMidYMid meet"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: '100%', height: '100%' }}
          >
            {/* Glow layer (blurred duplicate of key nodes) */}
            <g style={{ filter: 'blur(8px)' }} opacity="0.18">
              <circle cx="450" cy="80" r="18" fill="#3b82f6" />
              <circle cx="290" cy="200" r="12" fill="#60a5fa" />
              <circle cx="610" cy="200" r="12" fill="#60a5fa" />
            </g>

            {/* Main trunk — vertical */}
            <line x1="450" y1="420" x2="450" y2="240" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" opacity="0.18" />

            {/* Fork split at y=240 */}
            <line x1="450" y1="240" x2="290" y2="140" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" opacity="0.18" />
            <line x1="450" y1="240" x2="610" y2="140" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" opacity="0.18" />

            {/* Left branch continues up */}
            <line x1="290" y1="140" x2="210" y2="60" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" opacity="0.16" />
            <line x1="290" y1="140" x2="340" y2="60" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" opacity="0.16" />

            {/* Right branch continues up */}
            <line x1="610" y1="140" x2="560" y2="60" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" opacity="0.16" />
            <line x1="610" y1="140" x2="680" y2="60" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" opacity="0.16" />

            {/* Junction nodes */}
            <circle cx="450" cy="240" r="5" fill="#3b82f6" opacity="0.22" />
            <circle cx="290" cy="140" r="4" fill="#60a5fa" opacity="0.22" />
            <circle cx="610" cy="140" r="4" fill="#60a5fa" opacity="0.22" />
            <circle cx="450" cy="420" r="4" fill="#3b82f6" opacity="0.15" />

            {/* Leaf nodes */}
            <circle cx="210" cy="60"  r="3" fill="#93c5fd" opacity="0.22" />
            <circle cx="340" cy="60"  r="3" fill="#93c5fd" opacity="0.22" />
            <circle cx="560" cy="60"  r="3" fill="#93c5fd" opacity="0.22" />
            <circle cx="680" cy="60"  r="3" fill="#93c5fd" opacity="0.22" />

            {/* Center top node */}
            <circle cx="450" cy="80"  r="5" fill="#3b82f6" opacity="0.20" />
            <line x1="450" y1="140"  x2="450" y2="80" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" opacity="0.12" />

            {/* Student figure — lower left, reaching up toward left branch */}
            {/* body */}
            <ellipse cx="130" cy="390" rx="10" ry="14" fill="none" stroke="#3b82f6" strokeWidth="1.8" opacity="0.18" />
            {/* head */}
            <circle cx="130" cy="368" r="9" fill="none" stroke="#3b82f6" strokeWidth="1.8" opacity="0.18" />
            {/* right arm reaching up-right */}
            <path d="M138,380 Q170,340 210,290" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" opacity="0.20" />
            {/* left arm */}
            <path d="M122,382 Q110,390 104,400" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" opacity="0.15" />
            {/* legs */}
            <line x1="126" y1="404" x2="120" y2="424" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" opacity="0.15" />
            <line x1="134" y1="404" x2="138" y2="424" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" opacity="0.15" />
            {/* mortarboard cap — matches LogoMark DNA */}
            <rect x="120" y="357" width="20" height="3" rx="1" fill="#f59e0b" opacity="0.25" />
            <line x1="130" y1="360" x2="136" y2="367" stroke="#f59e0b" strokeWidth="1.2" opacity="0.20" />

            {/* Codex easter egg — tiny brace-shaped node cluster in upper canopy, nearly invisible */}
            <path d="M450,30 Q444,24 444,18 Q444,12 450,12 Q456,12 456,18 Q456,24 450,30" fill="none" stroke="#3b82f6" strokeWidth="0.9" opacity="0.04" />
            <path d="M450,30 Q444,36 444,42 Q444,48 450,48 Q456,48 456,42 Q456,36 450,30" fill="none" stroke="#3b82f6" strokeWidth="0.9" opacity="0.04" />
          </svg>
        </div>

        <div className="home-shell home-shell-narrow" style={{ position: 'relative', zIndex: 1 }}>
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
