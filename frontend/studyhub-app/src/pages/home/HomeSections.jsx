// HomeSections.jsx — Features, Steps, Testimonials, CTA, and Footer sections for the HomePage.
// Default export bundles all below-fold content for React.lazy() code-splitting.
import { forwardRef, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { trackEvent } from '../../lib/telemetry'
import { IconArrowRight, LogoMark } from '../../components/Icons'
import {
  FEATURES,
  HOME_AVATAR_COLORS,
  HOME_TREE_COLORS,
  STEPS,
  TESTIMONIALS,
} from './homeConstants'
import { API } from '../../config'

/* ------------------------------------------------------------------ */
/*  Features                                                           */
/* ------------------------------------------------------------------ */

export const FeaturesSection = forwardRef(function FeaturesSection(_, ref) {
  return (
    <section className="home-features-section">
      <div className="home-shell">
        <div className="home-section-header">
          <p className="home-section-kicker">Everything You Need</p>
          <h2 className="home-section-title">Built to Help You Succeed</h2>
          <p className="home-section-subtitle">
            From study sheets to practice tests, every tool is designed to help you learn faster and
            collaborate better.
          </p>
        </div>

        <div className="home-features-grid" ref={ref}>
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
  )
})

/* ------------------------------------------------------------------ */
/*  Steps (How it works)                                               */
/* ------------------------------------------------------------------ */

export const StepsSection = forwardRef(function StepsSection(_, ref) {
  const { leaf, main, secondary, study, tertiary } = HOME_TREE_COLORS

  return (
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
            <circle cx="450" cy="80" r="22" fill={main} />
            <circle cx="290" cy="200" r="16" fill={secondary} />
            <circle cx="610" cy="200" r="16" fill={secondary} />
            <circle cx="450" cy="350" r="14" fill={main} />
          </g>

          {/* Main trunk */}
          <line
            x1="450"
            y1="420"
            x2="450"
            y2="240"
            stroke={main}
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity="0.14"
          />

          {/* Fork split */}
          <path
            d="M450 240 Q380 200 290 140"
            stroke={main}
            strokeWidth="2.8"
            fill="none"
            strokeLinecap="round"
            opacity="0.14"
          />
          <path
            d="M450 240 Q520 200 610 140"
            stroke={main}
            strokeWidth="2.8"
            fill="none"
            strokeLinecap="round"
            opacity="0.14"
          />

          {/* Left sub-branches */}
          <path
            d="M290 140 Q250 100 210 60"
            stroke={secondary}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            opacity="0.12"
          />
          <path
            d="M290 140 Q310 100 340 60"
            stroke={secondary}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            opacity="0.12"
          />
          <path
            d="M210 60 Q190 40 175 25"
            stroke={tertiary}
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
            opacity="0.10"
          />
          <path
            d="M210 60 Q225 40 240 30"
            stroke={tertiary}
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
            opacity="0.10"
          />

          {/* Right sub-branches */}
          <path
            d="M610 140 Q580 100 560 60"
            stroke={secondary}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            opacity="0.12"
          />
          <path
            d="M610 140 Q640 100 680 60"
            stroke={secondary}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            opacity="0.12"
          />
          <path
            d="M680 60 Q695 40 710 25"
            stroke={tertiary}
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
            opacity="0.10"
          />
          <path
            d="M680 60 Q665 40 650 30"
            stroke={tertiary}
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
            opacity="0.10"
          />

          {/* Center vertical branch */}
          <line
            x1="450"
            y1="160"
            x2="450"
            y2="80"
            stroke={main}
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.10"
          />

          {/* Junction and leaf nodes */}
          <circle cx="450" cy="240" r="6" fill={main} opacity="0.18" />
          <circle cx="290" cy="140" r="5" fill={secondary} opacity="0.18" />
          <circle cx="610" cy="140" r="5" fill={secondary} opacity="0.18" />
          <circle cx="450" cy="420" r="5" fill={main} opacity="0.12" />
          <circle cx="210" cy="60" r="3.5" fill={tertiary} opacity="0.18" />
          <circle cx="340" cy="60" r="3.5" fill={tertiary} opacity="0.18" />
          <circle cx="560" cy="60" r="3.5" fill={tertiary} opacity="0.18" />
          <circle cx="680" cy="60" r="3.5" fill={tertiary} opacity="0.18" />
          <circle cx="450" cy="80" r="5" fill={main} opacity="0.16" />
          <circle cx="175" cy="25" r="2.5" fill={leaf} opacity="0.18" />
          <circle cx="240" cy="30" r="2.5" fill={leaf} opacity="0.18" />
          <circle cx="710" cy="25" r="2.5" fill={leaf} opacity="0.18" />
          <circle cx="650" cy="30" r="2.5" fill={leaf} opacity="0.18" />

          {/* Animated pulse rings on key nodes */}
          <circle
            cx="450"
            cy="240"
            r="12"
            fill="none"
            stroke={main}
            strokeWidth="0.8"
            opacity="0.08"
          >
            <animate attributeName="r" values="12;20;12" dur="4s" repeatCount="indefinite" />
            <animate
              attributeName="opacity"
              values="0.08;0.02;0.08"
              dur="4s"
              repeatCount="indefinite"
            />
          </circle>

          {/* Student figure reaching toward the tree */}
          <ellipse
            cx="130"
            cy="390"
            rx="10"
            ry="14"
            fill="none"
            stroke={main}
            strokeWidth="1.8"
            opacity="0.14"
          />
          <circle
            cx="130"
            cy="368"
            r="9"
            fill="none"
            stroke={main}
            strokeWidth="1.8"
            opacity="0.14"
          />
          <path
            d="M138,380 Q170,340 210,290"
            fill="none"
            stroke={secondary}
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.16"
          />
          <path
            d="M122,382 Q110,390 104,400"
            fill="none"
            stroke={secondary}
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.12"
          />
          <line
            x1="126"
            y1="404"
            x2="120"
            y2="424"
            stroke={main}
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.12"
          />
          <line
            x1="134"
            y1="404"
            x2="138"
            y2="424"
            stroke={main}
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.12"
          />
          <rect x="120" y="357" width="20" height="3" rx="1" fill={study} opacity="0.20" />
          <line
            x1="130"
            y1="360"
            x2="136"
            y2="367"
            stroke={study}
            strokeWidth="1.2"
            opacity="0.16"
          />
        </svg>
      </div>

      <div className="home-shell home-shell-narrow" style={{ position: 'relative', zIndex: 1 }}>
        <div className="home-section-header">
          <p className="home-section-kicker">Simple Setup</p>
          <h2 className="home-section-title">Up and Running in 60 Seconds</h2>
        </div>

        <div className="home-steps-grid" ref={ref}>
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
  )
})

/* ------------------------------------------------------------------ */
/*  Testimonials                                                       */
/* ------------------------------------------------------------------ */

function TestimonialCard({ t, index }) {
  const isDynamic = Boolean(t.user)
  const name = isDynamic ? t.user.username : t.name
  const school = isDynamic ? t.user.school || t.user.accountType || '' : t.school
  const initial = isDynamic ? t.user.username?.[0]?.toUpperCase() || '?' : t.initial
  const avatarColor = isDynamic ? HOME_AVATAR_COLORS[index % HOME_AVATAR_COLORS.length] : t.color
  const starCount = isDynamic ? t.stars || 5 : 5
  const text = isDynamic ? t.text : t.text
  const avatarUrl = isDynamic ? t.user.avatarUrl : null

  return (
    <article className="home-testimonial-card">
      <div className="home-testimonial-stars" aria-hidden="true">
        {[...Array(5)].map((_, i) => (
          <svg
            key={i}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill={i < starCount ? 'var(--sh-warning)' : 'none'}
            stroke={i < starCount ? 'none' : 'var(--sh-border)'}
            strokeWidth="1.5"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        ))}
      </div>
      <p className="home-testimonial-text">"{text}"</p>
      <div className="home-testimonial-author">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              objectFit: 'cover',
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            className="home-testimonial-avatar"
            style={{ '--home-testimonial-avatar-bg': avatarColor }}
          >
            {initial}
          </div>
        )}
        <div>
          <div className="home-testimonial-name">{name}</div>
          {school && <div className="home-testimonial-school">{school}</div>}
        </div>
      </div>
    </article>
  )
}

function TestimonialSkeleton() {
  return (
    <article className="home-testimonial-card" style={{ minHeight: 180 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="sh-skeleton" style={{ width: 16, height: 16, borderRadius: 3 }} />
        ))}
      </div>
      <div
        className="sh-skeleton"
        style={{ width: '90%', height: 14, borderRadius: 6, marginBottom: 8 }}
      />
      <div
        className="sh-skeleton"
        style={{ width: '70%', height: 14, borderRadius: 6, marginBottom: 16 }}
      />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div className="sh-skeleton" style={{ width: 36, height: 36, borderRadius: '50%' }} />
        <div>
          <div
            className="sh-skeleton"
            style={{ width: 80, height: 12, borderRadius: 6, marginBottom: 4 }}
          />
          <div className="sh-skeleton" style={{ width: 120, height: 10, borderRadius: 6 }} />
        </div>
      </div>
    </article>
  )
}

export const TestimonialsSection = forwardRef(function TestimonialsSection(_, ref) {
  const [dynamicReviews, setDynamicReviews] = useState(null)
  const [loadingReviews, setLoadingReviews] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`${API}/api/reviews/public?limit=3`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return
        if (data && Array.isArray(data.reviews) && data.reviews.length > 0) {
          setDynamicReviews(data.reviews)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingReviews(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const testimonials = dynamicReviews || TESTIMONIALS

  return (
    <section className="home-testimonials-section">
      <div className="home-shell home-shell-narrow">
        <div className="home-section-header">
          <p className="home-section-kicker">What Students Say</p>
          <h2 className="home-section-title">Loved by Students Across Maryland</h2>
        </div>

        <div className="home-testimonials-grid" ref={ref}>
          {loadingReviews && !dynamicReviews ? (
            <>
              <TestimonialSkeleton />
              <TestimonialSkeleton />
              <TestimonialSkeleton />
            </>
          ) : (
            testimonials.map((t, i) => (
              <TestimonialCard key={t.id || t.name || i} t={t} index={i} />
            ))
          )}
        </div>
      </div>
    </section>
  )
})

/* ------------------------------------------------------------------ */
/*  Bottom CTA                                                         */
/* ------------------------------------------------------------------ */

export function CtaSection() {
  return (
    <section className="home-cta-section">
      <div className="home-shell home-shell-narrow home-cta-content">
        {/* Decorative elements */}
        <div className="home-cta-glow-orb" aria-hidden="true" />
        <h2 className="home-cta-title">Ready to Study Smarter?</h2>
        <p className="home-cta-subtitle">
          Join thousands of students already using StudyHub. Free forever, no strings attached.
        </p>
        <div className="home-cta-buttons">
          <Link
            to="/register"
            className="home-btn home-btn-primary home-btn-large hero-cta-glow"
            onClick={() =>
              trackEvent('landing_cta_clicked', { target: 'register', location: 'bottom_cta' })
            }
          >
            Create Your Free Account
            <IconArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link to="/sheets" className="home-btn home-btn-ghost home-btn-large">
            Explore Study Sheets
          </Link>
        </div>
        <p className="home-cta-note">
          Love StudyHub?{' '}
          <Link
            to="/supporters"
            className="home-cta-link"
            onClick={() =>
              trackEvent('landing_cta_clicked', { target: 'supporters', location: 'bottom_cta' })
            }
          >
            Support the project
          </Link>{' '}
          or{' '}
          <Link to="/pricing" className="home-cta-link">
            go Pro
          </Link>
          .
        </p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Footer                                                             */
/* ------------------------------------------------------------------ */

export function HomeFooter({ currentYear }) {
  return (
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
          <Link to="/docs">Product docs</Link>
          <Link to="/supporters">Supporters</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/guidelines">Guidelines</Link>
          <a href="https://github.com/Apexone11/studyhub" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </div>

        <p className="home-footer-copy">
          &copy; {currentYear} StudyHub&trade; &middot; Built by students, for students &middot;
          Open Source
        </p>
      </div>
    </footer>
  )
}

/* ------------------------------------------------------------------ */
/*  Default export — all below-fold content bundled for React.lazy()   */
/* ------------------------------------------------------------------ */

export default function HomeSections({
  featuresRef,
  stepsRef,
  testimonialsRef,
  currentYear,
  onReady,
}) {
  // Signal the parent that refs are populated so it can wire up animations.
  useEffect(() => {
    if (onReady) onReady()
  }, [onReady])

  return (
    <>
      <FeaturesSection ref={featuresRef} />
      <StepsSection ref={stepsRef} />
      <TestimonialsSection ref={testimonialsRef} />
      <CtaSection />
      <HomeFooter currentYear={currentYear} />
    </>
  )
}
