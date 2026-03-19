// HomePage renders the public landing experience and routes anonymous users into discovery flows.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../../components/Navbar'
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
  IconStar,
  IconTests,
  IconUsers,
  LogoMark,
} from '../../components/Icons'
import { fadeInOnScroll } from '../../lib/animations'

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
    desc: 'Sign up with email or Google in seconds. Verify your email and you are in.',
    icon: IconUsers,
  },
  {
    n: '02',
    title: 'Pick your school and courses',
    desc: 'Select from 30+ Maryland schools and hundreds of courses, or add your own.',
    icon: IconSchool,
  },
  {
    n: '03',
    title: 'Access everything',
    desc: 'Study sheets, tests, and announcements organized and ready for your courses.',
    icon: IconStar,
  }
]

const TESTIMONIALS = [
  {
    text: 'StudyHub changed how I prepare for exams. The community sheets are so much better than studying alone.',
    name: 'Sarah M.',
    school: 'University of Maryland',
    initial: 'S',
    color: '#3b82f6',
  },
  {
    text: 'Being able to fork and improve study sheets is genius. It is like GitHub but for students.',
    name: 'James K.',
    school: 'Towson University',
    initial: 'J',
    color: '#10b981',
  },
  {
    text: 'The fact that it is completely free with no ads makes it stand out from every other study platform.',
    name: 'Aisha R.',
    school: 'Morgan State University',
    initial: 'A',
    color: '#8b5cf6',
  }
]

export default function HomePage() {
  const currentYear = new Date().getFullYear()
  const navigate = useNavigate()
  const [heroSearch, setHeroSearch] = useState('')
  const featuresRef = useRef(null)
  const stepsRef = useRef(null)
  const testimonialsRef = useRef(null)

  useEffect(() => {
    if (featuresRef.current) {
      fadeInOnScroll(featuresRef.current.querySelectorAll('.home-feature-card'), {
        staggerMs: 60,
        y: 20,
      })
    }
    if (stepsRef.current) {
      fadeInOnScroll(stepsRef.current.querySelectorAll('.home-step-card'), {
        staggerMs: 100,
        y: 20,
      })
    }
    if (testimonialsRef.current) {
      fadeInOnScroll(testimonialsRef.current.querySelectorAll('.home-testimonial-card'), {
        staggerMs: 80,
        y: 20,
      })
    }
  }, [])

  function handleHeroSearch(e) {
    e.preventDefault()
    if (heroSearch.trim()) navigate(`/sheets?search=${encodeURIComponent(heroSearch.trim())}`)
  }

  return (
    <div className="home-page">
      <Navbar variant="landing" />

      <section className="home-hero">
        {/* Enhanced fork-tree SVG */}
        <svg className="home-hero-tree hero-tree-base" viewBox="0 0 56 56" fill="none" aria-hidden="true">
          <line x1="28" y1="48" x2="28" y2="32" stroke="#60a5fa" strokeWidth="2.4" strokeLinecap="round"/>
          <path d="M28 32 Q28 24 16 16" stroke="#60a5fa" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <path d="M28 32 Q28 24 40 16" stroke="#60a5fa" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <path d="M16 16 Q12 11 9 7" stroke="#93c5fd" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
          <path d="M16 16 Q17 11 21 7" stroke="#93c5fd" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
          <path d="M40 16 Q37 11 35 7" stroke="#93c5fd" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
          <path d="M40 16 Q43 11 47 7" stroke="#93c5fd" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
          {/* Extra branches for depth */}
          <path d="M9 7 Q7 4 5 2" stroke="#bfdbfe" strokeWidth="1" fill="none" strokeLinecap="round"/>
          <path d="M9 7 Q11 4 13 3" stroke="#bfdbfe" strokeWidth="1" fill="none" strokeLinecap="round"/>
          <path d="M47 7 Q45 4 43 3" stroke="#bfdbfe" strokeWidth="1" fill="none" strokeLinecap="round"/>
          <path d="M47 7 Q49 4 51 2" stroke="#bfdbfe" strokeWidth="1" fill="none" strokeLinecap="round"/>
          {/* Nodes with gradient-like fills */}
          <circle cx="28" cy="48" r="4" fill="#3b82f6" opacity="0.3"/>
          <circle cx="28" cy="48" r="3" stroke="#60a5fa" strokeWidth="1.6" fill="none"/>
          <circle cx="28" cy="32" r="3" fill="#3b82f6" opacity="0.2"/>
          <circle cx="28" cy="32" r="2.5" stroke="#60a5fa" strokeWidth="1.4" fill="none"/>
          <circle cx="16" cy="16" r="2.8" fill="#60a5fa" opacity="0.15"/>
          <circle cx="16" cy="16" r="2.3" stroke="#60a5fa" strokeWidth="1.3" fill="none"/>
          <circle cx="40" cy="16" r="2.8" fill="#60a5fa" opacity="0.15"/>
          <circle cx="40" cy="16" r="2.3" stroke="#60a5fa" strokeWidth="1.3" fill="none"/>
          <circle cx="9" cy="7" r="2" fill="#93c5fd" opacity="0.2"/>
          <circle cx="9" cy="7" r="1.6" stroke="#93c5fd" strokeWidth="1.1" fill="none"/>
          <circle cx="21" cy="7" r="1.6" stroke="#93c5fd" strokeWidth="1.1" fill="none"/>
          <circle cx="35" cy="7" r="1.6" stroke="#93c5fd" strokeWidth="1.1" fill="none"/>
          <circle cx="47" cy="7" r="2" fill="#93c5fd" opacity="0.2"/>
          <circle cx="47" cy="7" r="1.6" stroke="#93c5fd" strokeWidth="1.1" fill="none"/>
          {/* Leaf nodes */}
          <circle cx="5" cy="2" r="1.1" fill="#bfdbfe" opacity="0.4"/>
          <circle cx="13" cy="3" r="1.1" fill="#bfdbfe" opacity="0.4"/>
          <circle cx="43" cy="3" r="1.1" fill="#bfdbfe" opacity="0.4"/>
          <circle cx="51" cy="2" r="1.1" fill="#bfdbfe" opacity="0.4"/>
        </svg>
        <svg className="home-hero-tree hero-tree-pulse" viewBox="0 0 56 56" fill="none" aria-hidden="true">
          <line x1="28" y1="48" x2="28" y2="32" stroke="#60a5fa" strokeWidth="2.4" strokeLinecap="round"/>
          <path d="M28 32 Q28 24 16 16" stroke="#60a5fa" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <path d="M28 32 Q28 24 40 16" stroke="#60a5fa" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <circle cx="28" cy="48" r="3" stroke="#60a5fa" strokeWidth="1.6" fill="none"/>
          <circle cx="28" cy="32" r="2.5" stroke="#60a5fa" strokeWidth="1.4" fill="none"/>
          <circle cx="16" cy="16" r="2.3" stroke="#60a5fa" strokeWidth="1.3" fill="none"/>
          <circle cx="40" cy="16" r="2.3" stroke="#60a5fa" strokeWidth="1.3" fill="none"/>
        </svg>

        {/* Enhanced orbs */}
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
            Fork study sheets, take practice tests, and collaborate with classmates.
            Everything you need to ace your courses, all in one place.
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

          <form onSubmit={handleHeroSearch} className="home-hero-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginLeft: 14 }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              value={heroSearch}
              onChange={e => setHeroSearch(e.target.value)}
              placeholder="Search sheets, courses, topics..."
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f1f5f9', fontSize: 14, padding: '14px 12px', fontFamily: 'inherit' }}
            />
            <button type="submit" className="home-hero-search-btn">
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

      {/* Social proof banner */}
      <section className="home-proof-banner">
        <div className="home-shell">
          <div className="home-proof-inner">
            <div className="home-proof-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span>No credit card required</span>
            </div>
            <div className="home-proof-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span>No ads, ever</span>
            </div>
            <div className="home-proof-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span>Open source</span>
            </div>
            <div className="home-proof-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span>Sign up in 60 seconds</span>
            </div>
          </div>
        </div>
      </section>

      <section className="home-features-section">
        <div className="home-shell">
          <div className="home-section-header">
            <p className="home-section-kicker">Everything You Need</p>
            <h2 className="home-section-title">Built to Help You Succeed</h2>
            <p className="home-section-subtitle">
              From study sheets to practice tests, every tool is designed to help you learn faster and collaborate better.
            </p>
          </div>

          <div className="home-features-grid" ref={featuresRef}>
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

      {/* How it works with enhanced tree background */}
      <section className="home-steps-section">
        <div className="home-steps-bg-art" aria-hidden="true">
          <svg
            viewBox="0 0 900 460"
            preserveAspectRatio="xMidYMid meet"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: '100%', height: '100%' }}
          >
            {/* Glow layer */}
            <g style={{ filter: 'blur(12px)' }} opacity="0.15">
              <circle cx="450" cy="80" r="22" fill="#3b82f6" />
              <circle cx="290" cy="200" r="16" fill="#60a5fa" />
              <circle cx="610" cy="200" r="16" fill="#60a5fa" />
              <circle cx="450" cy="350" r="14" fill="#3b82f6" />
            </g>

            {/* Main trunk */}
            <line x1="450" y1="420" x2="450" y2="240" stroke="#3b82f6" strokeWidth="3.5" strokeLinecap="round" opacity="0.14" />

            {/* Fork split */}
            <path d="M450 240 Q380 200 290 140" stroke="#3b82f6" strokeWidth="2.8" fill="none" strokeLinecap="round" opacity="0.14" />
            <path d="M450 240 Q520 200 610 140" stroke="#3b82f6" strokeWidth="2.8" fill="none" strokeLinecap="round" opacity="0.14" />

            {/* Left sub-branches */}
            <path d="M290 140 Q250 100 210 60" stroke="#60a5fa" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.12" />
            <path d="M290 140 Q310 100 340 60" stroke="#60a5fa" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.12" />
            <path d="M210 60 Q190 40 175 25" stroke="#93c5fd" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.10" />
            <path d="M210 60 Q225 40 240 30" stroke="#93c5fd" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.10" />

            {/* Right sub-branches */}
            <path d="M610 140 Q580 100 560 60" stroke="#60a5fa" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.12" />
            <path d="M610 140 Q640 100 680 60" stroke="#60a5fa" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.12" />
            <path d="M680 60 Q695 40 710 25" stroke="#93c5fd" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.10" />
            <path d="M680 60 Q665 40 650 30" stroke="#93c5fd" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.10" />

            {/* Center vertical branch */}
            <line x1="450" y1="160" x2="450" y2="80" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" opacity="0.10" />

            {/* Junction and leaf nodes */}
            <circle cx="450" cy="240" r="6" fill="#3b82f6" opacity="0.18" />
            <circle cx="290" cy="140" r="5" fill="#60a5fa" opacity="0.18" />
            <circle cx="610" cy="140" r="5" fill="#60a5fa" opacity="0.18" />
            <circle cx="450" cy="420" r="5" fill="#3b82f6" opacity="0.12" />
            <circle cx="210" cy="60" r="3.5" fill="#93c5fd" opacity="0.18" />
            <circle cx="340" cy="60" r="3.5" fill="#93c5fd" opacity="0.18" />
            <circle cx="560" cy="60" r="3.5" fill="#93c5fd" opacity="0.18" />
            <circle cx="680" cy="60" r="3.5" fill="#93c5fd" opacity="0.18" />
            <circle cx="450" cy="80" r="5" fill="#3b82f6" opacity="0.16" />
            <circle cx="175" cy="25" r="2.5" fill="#bfdbfe" opacity="0.18" />
            <circle cx="240" cy="30" r="2.5" fill="#bfdbfe" opacity="0.18" />
            <circle cx="710" cy="25" r="2.5" fill="#bfdbfe" opacity="0.18" />
            <circle cx="650" cy="30" r="2.5" fill="#bfdbfe" opacity="0.18" />

            {/* Animated pulse rings on key nodes */}
            <circle cx="450" cy="240" r="12" fill="none" stroke="#3b82f6" strokeWidth="0.8" opacity="0.08">
              <animate attributeName="r" values="12;20;12" dur="4s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.08;0.02;0.08" dur="4s" repeatCount="indefinite"/>
            </circle>

            {/* Student figure reaching toward the tree */}
            <ellipse cx="130" cy="390" rx="10" ry="14" fill="none" stroke="#3b82f6" strokeWidth="1.8" opacity="0.14" />
            <circle cx="130" cy="368" r="9" fill="none" stroke="#3b82f6" strokeWidth="1.8" opacity="0.14" />
            <path d="M138,380 Q170,340 210,290" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" opacity="0.16" />
            <path d="M122,382 Q110,390 104,400" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" opacity="0.12" />
            <line x1="126" y1="404" x2="120" y2="424" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" opacity="0.12" />
            <line x1="134" y1="404" x2="138" y2="424" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" opacity="0.12" />
            <rect x="120" y="357" width="20" height="3" rx="1" fill="#f59e0b" opacity="0.20" />
            <line x1="130" y1="360" x2="136" y2="367" stroke="#f59e0b" strokeWidth="1.2" opacity="0.16" />
          </svg>
        </div>

        <div className="home-shell home-shell-narrow" style={{ position: 'relative', zIndex: 1 }}>
          <div className="home-section-header">
            <p className="home-section-kicker">Simple Setup</p>
            <h2 className="home-section-title">Up and Running in 60 Seconds</h2>
          </div>

          <div className="home-steps-grid" ref={stepsRef}>
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

      {/* Testimonials section */}
      <section className="home-testimonials-section">
        <div className="home-shell home-shell-narrow">
          <div className="home-section-header">
            <p className="home-section-kicker">What Students Say</p>
            <h2 className="home-section-title">Loved by Students Across Maryland</h2>
          </div>

          <div className="home-testimonials-grid" ref={testimonialsRef}>
            {TESTIMONIALS.map((t) => (
              <article key={t.name} className="home-testimonial-card">
                <div className="home-testimonial-stars" aria-hidden="true">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" stroke="none">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  ))}
                </div>
                <p className="home-testimonial-text">"{t.text}"</p>
                <div className="home-testimonial-author">
                  <div className="home-testimonial-avatar" style={{ background: t.color }}>
                    {t.initial}
                  </div>
                  <div>
                    <div className="home-testimonial-name">{t.name}</div>
                    <div className="home-testimonial-school">{t.school}</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-cta-section">
        <div className="home-shell home-shell-narrow home-cta-content">
          {/* Decorative elements */}
          <div className="home-cta-glow-orb" aria-hidden="true" />
          <h2 className="home-cta-title">Ready to Study Smarter?</h2>
          <p className="home-cta-subtitle">
            Join thousands of students already using StudyHub. Free forever, no strings attached.
          </p>
          <div className="home-cta-buttons">
            <Link to="/register" className="home-btn home-btn-primary home-btn-large hero-cta-glow">
              Create Your Free Account
              <IconArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link to="/sheets" className="home-btn home-btn-ghost home-btn-large">
              Explore Study Sheets
            </Link>
          </div>
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
            &copy; {currentYear} StudyHub &middot; Built by students, for students &middot; Open Source
          </p>
        </div>
      </footer>
    </div>
  )
}
