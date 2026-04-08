// HomeHero.jsx — Hero section and social-proof banner for the HomePage.
import { Link } from 'react-router-dom'
import { trackEvent } from '../../lib/telemetry'
import { IconArrowRight } from '../../components/Icons'
import { HOME_TREE_COLORS, PROOF_ITEMS } from './homeConstants'

/* ------------------------------------------------------------------ */
/*  Hero                                                               */
/* ------------------------------------------------------------------ */

export function HeroSection({ platformStats }) {
  const { leaf, main, secondary, tertiary } = HOME_TREE_COLORS

  return (
    <section className="home-hero">
      {/* Radial color-cycling glow behind the tree */}
      <div className="hero-tree-glow" aria-hidden="true" />

      {/* Enhanced fork-tree SVG with twinkling nodes */}
      <svg className="home-hero-tree hero-tree-base" viewBox="0 0 56 56" fill="none" aria-hidden="true">
        <line x1="28" y1="48" x2="28" y2="32" stroke={secondary} strokeWidth="2.4" strokeLinecap="round"/>
        <path d="M28 32 Q28 24 16 16" stroke={secondary} strokeWidth="2" fill="none" strokeLinecap="round"/>
        <path d="M28 32 Q28 24 40 16" stroke={secondary} strokeWidth="2" fill="none" strokeLinecap="round"/>
        <path d="M16 16 Q12 11 9 7" stroke={tertiary} strokeWidth="1.4" fill="none" strokeLinecap="round"/>
        <path d="M16 16 Q17 11 21 7" stroke={tertiary} strokeWidth="1.4" fill="none" strokeLinecap="round"/>
        <path d="M40 16 Q37 11 35 7" stroke={tertiary} strokeWidth="1.4" fill="none" strokeLinecap="round"/>
        <path d="M40 16 Q43 11 47 7" stroke={tertiary} strokeWidth="1.4" fill="none" strokeLinecap="round"/>
        {/* Extra branches for depth */}
        <path d="M9 7 Q7 4 5 2" stroke={leaf} strokeWidth="1" fill="none" strokeLinecap="round"/>
        <path d="M9 7 Q11 4 13 3" stroke={leaf} strokeWidth="1" fill="none" strokeLinecap="round"/>
        <path d="M47 7 Q45 4 43 3" stroke={leaf} strokeWidth="1" fill="none" strokeLinecap="round"/>
        <path d="M47 7 Q49 4 51 2" stroke={leaf} strokeWidth="1" fill="none" strokeLinecap="round"/>
        {/* Nodes with twinkling glow */}
        <circle className="tree-node-glow" cx="28" cy="48" r="4" fill={main} opacity="0.3"/>
        <circle cx="28" cy="48" r="3" stroke={secondary} strokeWidth="1.6" fill="none"/>
        <circle className="tree-node-glow" cx="28" cy="32" r="3" fill={main} opacity="0.2"/>
        <circle cx="28" cy="32" r="2.5" stroke={secondary} strokeWidth="1.4" fill="none"/>
        <circle className="tree-node-glow" cx="16" cy="16" r="2.8" fill={secondary} opacity="0.15"/>
        <circle cx="16" cy="16" r="2.3" stroke={secondary} strokeWidth="1.3" fill="none"/>
        <circle className="tree-node-glow" cx="40" cy="16" r="2.8" fill={secondary} opacity="0.15"/>
        <circle cx="40" cy="16" r="2.3" stroke={secondary} strokeWidth="1.3" fill="none"/>
        <circle className="tree-node-glow" cx="9" cy="7" r="2" fill={tertiary} opacity="0.2"/>
        <circle cx="9" cy="7" r="1.6" stroke={tertiary} strokeWidth="1.1" fill="none"/>
        <circle cx="21" cy="7" r="1.6" stroke={tertiary} strokeWidth="1.1" fill="none"/>
        <circle cx="35" cy="7" r="1.6" stroke={tertiary} strokeWidth="1.1" fill="none"/>
        <circle className="tree-node-glow" cx="47" cy="7" r="2" fill={tertiary} opacity="0.2"/>
        <circle cx="47" cy="7" r="1.6" stroke={tertiary} strokeWidth="1.1" fill="none"/>
        {/* Leaf nodes */}
        <circle className="tree-node-glow" cx="5" cy="2" r="1.1" fill={leaf} opacity="0.4"/>
        <circle className="tree-node-glow" cx="13" cy="3" r="1.1" fill={leaf} opacity="0.4"/>
        <circle className="tree-node-glow" cx="43" cy="3" r="1.1" fill={leaf} opacity="0.4"/>
        <circle className="tree-node-glow" cx="51" cy="2" r="1.1" fill={leaf} opacity="0.4"/>
      </svg>
      <svg className="home-hero-tree hero-tree-pulse" viewBox="0 0 56 56" fill="none" aria-hidden="true">
        <line x1="28" y1="48" x2="28" y2="32" stroke={secondary} strokeWidth="2.4" strokeLinecap="round"/>
        <path d="M28 32 Q28 24 16 16" stroke={secondary} strokeWidth="2" fill="none" strokeLinecap="round"/>
        <path d="M28 32 Q28 24 40 16" stroke={secondary} strokeWidth="2" fill="none" strokeLinecap="round"/>
        <circle cx="28" cy="48" r="3" stroke={secondary} strokeWidth="1.6" fill="none"/>
        <circle cx="28" cy="32" r="2.5" stroke={secondary} strokeWidth="1.4" fill="none"/>
        <circle cx="16" cy="16" r="2.3" stroke={secondary} strokeWidth="1.3" fill="none"/>
        <circle cx="40" cy="16" r="2.3" stroke={secondary} strokeWidth="1.3" fill="none"/>
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
          <Link to="/register" className="home-btn home-btn-primary hero-cta-glow" onClick={() => trackEvent('landing_cta_clicked', { target: 'register', location: 'hero' })}>
            Get Started Free
            <IconArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link to="/sheets" className="home-btn home-btn-ghost">
            Browse Study Sheets
          </Link>
        </div>

        <div className="home-stats-row">
          {[
            {
              value: platformStats?.sheetCount != null ? `${platformStats.sheetCount}+` : '30+',
              label: platformStats?.sheetCount != null ? 'Study Sheets' : 'Maryland Schools',
            },
            {
              value: platformStats?.courseCount != null ? `${platformStats.courseCount}+` : '100%',
              label: platformStats?.courseCount != null ? 'Courses Covered' : 'Student Built',
            },
            { value: 'Free', label: 'Always and Forever' },
          ].map((stat) => (
            <div key={stat.label} className="home-stat-item">
              <div className="home-stat-value">{stat.value}</div>
              <div className="home-stat-label">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Social proof banner                                                */
/* ------------------------------------------------------------------ */

export function ProofBanner() {
  return (
    <section className="home-proof-banner">
      <div className="home-shell">
        <div className="home-proof-inner">
          {PROOF_ITEMS.map((item) => (
            <div key={item.label} className="home-proof-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={item.stroke} strokeWidth="2.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
