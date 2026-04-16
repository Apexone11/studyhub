// src/mobile/pages/MobileLandingPage.jsx
// Immersive landing page with glowing fork-tree logo, floating feature
// cards, animated gradient mesh, and staggered content reveal.
// Design is intentionally distinct from the web — mobile-first, bold, visual.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import anime from '../lib/animeCompat'
import GradientMesh from '../components/GradientMesh'
import BottomSheet from '../components/BottomSheet'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'
import { CURRENT_LEGAL_VERSION } from '../../lib/legalVersions'
import SignupBottomSheet from './SignupBottomSheet'
import SigninBottomSheet from './SigninBottomSheet'

/* ── StudyHub fork-tree logo (matching the actual website logo SVG) ── */
function AppLogo() {
  return (
    <svg width="72" height="72" viewBox="0 0 56 56" fill="none" aria-hidden="true">
      {/* Background circle */}
      <circle
        cx="28"
        cy="28"
        r="26"
        fill="rgba(15, 23, 42, 0.6)"
        stroke="rgba(30, 58, 95, 0.5)"
        strokeWidth="1"
      />
      {/* Trunk */}
      <line
        x1="28"
        x2="28"
        y1="46"
        y2="32"
        stroke="#3b82f6"
        strokeLinecap="round"
        strokeWidth="2.8"
      />
      {/* Main branches */}
      <path
        fill="none"
        stroke="#3b82f6"
        strokeLinecap="round"
        strokeWidth="2.4"
        d="M28 32 Q28 24 18 17"
      />
      <path
        fill="none"
        stroke="#3b82f6"
        strokeLinecap="round"
        strokeWidth="2.4"
        d="M28 32 Q28 24 38 17"
      />
      {/* Sub-branches */}
      <path
        fill="none"
        stroke="#60a5fa"
        strokeLinecap="round"
        strokeWidth="1.6"
        d="M18 17 Q14 12 11 9"
      />
      <path
        fill="none"
        stroke="#60a5fa"
        strokeLinecap="round"
        strokeWidth="1.6"
        d="M18 17 Q18 12 21 9"
      />
      <path
        fill="none"
        stroke="#60a5fa"
        strokeLinecap="round"
        strokeWidth="1.6"
        d="M38 17 Q35 12 35 9"
      />
      <path
        fill="none"
        stroke="#60a5fa"
        strokeLinecap="round"
        strokeWidth="1.6"
        d="M38 17 Q41 12 45 9"
      />
      {/* Nodes */}
      <circle cx="28" cy="46" r="4" fill="#1d4ed8" stroke="#3b82f6" strokeWidth="1.5" />
      <circle cx="28" cy="32" r="3.2" fill="#3b82f6" />
      <circle cx="18" cy="17" r="3.2" fill="#3b82f6" />
      <circle cx="38" cy="17" r="3.2" fill="#3b82f6" />
      <circle cx="11" cy="9" r="2.2" fill="#60a5fa" />
      <circle cx="21" cy="9" r="2.2" fill="#60a5fa" />
      <circle cx="35" cy="9" r="2.2" fill="#60a5fa" />
      <circle cx="45" cy="9" r="2.2" fill="#60a5fa" />
      {/* Seedling base */}
      <rect width="16" height="3" x="20" y="48.5" fill="#f59e0b" rx="1.5" />
      <rect width="3" height="4" x="26.5" y="45.5" fill="#f59e0b" rx="1" />
      <circle cx="28" cy="45" r="1.5" fill="#fbbf24" />
    </svg>
  )
}

/* ── Floating feature cards behind the hero ─────────────────────── */
const FEATURE_CARDS = [
  { icon: 'sheets', label: 'Study Sheets', x: '4%', y: '10%', delay: 800 },
  { icon: 'ai', label: 'Hub AI', x: '66%', y: '6%', delay: 1000 },
  { icon: 'messages', label: 'Messages', x: '64%', y: '32%', delay: 1200 },
  { icon: 'groups', label: 'Study Groups', x: '6%', y: '36%', delay: 1400 },
]

function FeatureCardIcon({ type }) {
  const paths = {
    sheets: (
      <path
        d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm8 0v6h6M9 13h6M9 17h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    ai: (
      <path
        d="M12 2L9.5 8.5 3 12l6.5 3.5L12 22l2.5-6.5L21 12l-6.5-3.5L12 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    messages: (
      <path
        d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    groups: (
      <>
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M2 20c0-2.5 2.5-4.5 7-4.5s7 2 7 4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="17" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M17 14.5c2 0 4 1 4 2.5"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </>
    ),
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {paths[type]}
    </svg>
  )
}

function FloatingFeatureCards() {
  const cardsRef = useRef([])

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return

    // Gentle floating animation on each card
    cardsRef.current.forEach((card, i) => {
      if (!card) return
      anime({
        targets: card,
        translateY: [0, -8, 0],
        duration: 3000 + i * 500,
        easing: 'easeInOutSine',
        loop: true,
        delay: i * 200,
      })
    })
  }, [])

  return (
    <>
      {FEATURE_CARDS.map((card, i) => (
        <div
          key={card.icon}
          ref={(el) => {
            cardsRef.current[i] = el
          }}
          className="mob-landing-feature-card"
          style={{ left: card.x, top: card.y }}
        >
          <FeatureCardIcon type={card.icon} />
          <span>{card.label}</span>
        </div>
      ))}
    </>
  )
}

/* ── Stats row for social proof ─────────────────────────────────── */
function StatsRow({ statsRef }) {
  return (
    <div ref={statsRef} className="mob-landing-stats" style={{ opacity: 0 }}>
      <div className="mob-landing-stat">
        <span className="mob-landing-stat-num">10K+</span>
        <span className="mob-landing-stat-label">Students</span>
      </div>
      <div className="mob-landing-stat-divider" />
      <div className="mob-landing-stat">
        <span className="mob-landing-stat-num">50K+</span>
        <span className="mob-landing-stat-label">Sheets</span>
      </div>
      <div className="mob-landing-stat-divider" />
      <div className="mob-landing-stat">
        <span className="mob-landing-stat-num">200+</span>
        <span className="mob-landing-stat-label">Schools</span>
      </div>
    </div>
  )
}

export default function MobileLandingPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { completeAuthentication } = useSession()

  const [showSignup, setShowSignup] = useState(false)
  const [showSignin, setShowSignin] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleError, setGoogleError] = useState('')

  // Google role picker state (for new Google users)
  const [showRolePicker, setShowRolePicker] = useState(false)
  const [pendingGoogle, setPendingGoogle] = useState(null)

  const logoRef = useRef(null)
  const glowRef = useRef(null)
  const nameRef = useRef(null)
  const taglineRef = useRef(null)
  const subtitleRef = useRef(null)
  const statsRef = useRef(null)
  const actionsRef = useRef(null)

  // ── Google OAuth callback handler ──
  // When Google redirects back with ?code=, exchange it for auth
  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) return

    // Clear ?code= from URL immediately
    setSearchParams({}, { replace: true })

    setGoogleLoading(true)
    setGoogleError('')

    const redirectUri = `${window.location.origin}/m/landing`

    fetch(`${API}/api/auth/google/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code, redirectUri }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setGoogleError(data.error || 'Google sign-in failed.')
          return
        }

        // Existing user -- signed in directly
        if (data.user) {
          completeAuthentication(data.user)
          navigate(data.user.onboardingCompleted ? '/m/home' : '/m/onboarding/goals', {
            replace: true,
          })
          return
        }

        // New user -- needs to pick a role
        if (data.status === 'needs_role' && data.tempToken) {
          setPendingGoogle({
            tempToken: data.tempToken,
            email: data.email,
            name: data.name,
            avatarUrl: data.avatarUrl,
          })
          setShowRolePicker(true)
        }
      })
      .catch(() => {
        setGoogleError('Connection error during Google sign-in.')
      })
      .finally(() => {
        setGoogleLoading(false)
      })
  }, [searchParams, setSearchParams, completeAuthentication, navigate])

  // ── Complete Google signup (role selection) ──
  const handleGoogleRoleComplete = useCallback(
    async (accountType) => {
      if (!pendingGoogle?.tempToken) return
      setGoogleLoading(true)

      try {
        const res = await fetch(`${API}/api/auth/google/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            tempToken: pendingGoogle.tempToken,
            accountType,
            legalAccepted: true,
            legalVersion: CURRENT_LEGAL_VERSION,
          }),
        })
        const data = await res.json()

        if (!res.ok) {
          setGoogleError(data.error || 'Could not complete registration.')
          return
        }

        completeAuthentication(data.user)
        setShowRolePicker(false)
        navigate('/m/onboarding/goals', { replace: true })
      } catch {
        setGoogleError('Connection error. Please try again.')
      } finally {
        setGoogleLoading(false)
      }
    },
    [pendingGoogle, completeAuthentication, navigate],
  )

  const prefersReduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const allRefs = [logoRef, glowRef, nameRef, taglineRef, subtitleRef, statsRef, actionsRef]
    if (prefersReduced) {
      allRefs.forEach((ref) => {
        if (ref.current) {
          ref.current.style.opacity = '1'
          ref.current.style.transform = 'none'
        }
      })
      return
    }

    const tl = anime.timeline({ easing: 'easeOutCubic' })

    // Glow pulse behind logo
    tl.add({
      targets: glowRef.current,
      scale: [0.5, 1.2],
      opacity: [0, 0.6],
      duration: 800,
      easing: 'easeOutExpo',
    })

    // Logo entrance — elastic bounce
    tl.add(
      {
        targets: logoRef.current,
        scale: [0.6, 1],
        opacity: [0, 1],
        duration: 700,
        easing: 'easeOutElastic(1, 0.5)',
      },
      '-=500',
    )

    // App name
    tl.add(
      {
        targets: nameRef.current,
        translateY: [16, 0],
        opacity: [0, 1],
        duration: 450,
      },
      '-=300',
    )

    // Tagline
    tl.add(
      {
        targets: taglineRef.current,
        translateY: [16, 0],
        opacity: [0, 1],
        duration: 450,
      },
      '-=300',
    )

    // Subtitle
    tl.add(
      {
        targets: subtitleRef.current,
        translateY: [16, 0],
        opacity: [0, 1],
        duration: 450,
      },
      '-=300',
    )

    // Stats row
    tl.add(
      {
        targets: statsRef.current,
        translateY: [12, 0],
        opacity: [0, 1],
        duration: 400,
      },
      '-=250',
    )

    // Action buttons
    tl.add(
      {
        targets: actionsRef.current,
        translateY: [20, 0],
        opacity: [0, 1],
        duration: 500,
      },
      '-=250',
    )
  }, [prefersReduced])

  const switchToSignup = () => {
    setShowSignin(false)
    setTimeout(() => setShowSignup(true), 150)
  }

  const switchToSignin = () => {
    setShowSignup(false)
    setTimeout(() => setShowSignin(true), 150)
  }

  return (
    <div className="mob-landing">
      <GradientMesh />
      <FloatingFeatureCards />

      <div className="mob-landing-content">
        {/* ── Logo zone ────────────────────────────────────────── */}
        <div className="mob-landing-hero-zone">
          <div
            ref={glowRef}
            className="mob-landing-logo-glow"
            style={{ opacity: 0, transform: 'scale(0.5)' }}
          />
          <div
            ref={logoRef}
            className="mob-landing-logo-mark"
            style={{ opacity: 0, transform: 'scale(0.6)' }}
          >
            <AppLogo />
          </div>
        </div>

        {/* ── Text zone ────────────────────────────────────────── */}
        <h1
          ref={nameRef}
          className="mob-landing-app-name"
          style={{ opacity: 0, transform: 'translateY(16px)' }}
        >
          <span className="mob-landing-app-name-study">Study</span>
          <span className="mob-landing-app-name-hub">Hub</span>
        </h1>

        <p
          ref={taglineRef}
          className="mob-landing-tagline"
          style={{ opacity: 0, transform: 'translateY(16px)' }}
        >
          The GitHub of Studying
        </p>

        <p
          ref={subtitleRef}
          className="mob-landing-subtitle"
          style={{ opacity: 0, transform: 'translateY(16px)' }}
        >
          Share notes, fork study sheets, message classmates, and get AI help — all in one place.
        </p>

        <StatsRow statsRef={statsRef} />

        {/* ── Action zone ──────────────────────────────────────── */}
        <div
          ref={actionsRef}
          className="mob-landing-actions"
          style={{ opacity: 0, transform: 'translateY(20px)' }}
        >
          <button
            type="button"
            className="mob-landing-btn mob-landing-btn--primary"
            onClick={() => setShowSignup(true)}
          >
            Get Started — it's free
          </button>
          <button
            type="button"
            className="mob-landing-btn mob-landing-btn--secondary"
            onClick={() => setShowSignin(true)}
          >
            I already have an account
          </button>
        </div>
      </div>

      <footer className="mob-landing-footer">
        <p className="mob-landing-footer-text">
          By continuing you agree to our{' '}
          <button
            type="button"
            className="mob-landing-footer-link"
            onClick={() => navigate('/m/terms')}
          >
            Terms
          </button>{' '}
          and{' '}
          <button
            type="button"
            className="mob-landing-footer-link"
            onClick={() => navigate('/m/privacy')}
          >
            Privacy Policy
          </button>
        </p>
      </footer>

      {/* ── Google loading overlay ──────────────────────────── */}
      {googleLoading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: '3px solid rgba(255,255,255,0.2)',
              borderTopColor: '#ffffff',
              animation: 'mob-spin 0.7s linear infinite',
            }}
          />
          <span style={{ color: '#ffffff', fontSize: 14, fontWeight: 600 }}>
            Signing in with Google...
          </span>
        </div>
      )}

      {/* ── Google error toast ─────────────────────────────── */}
      {googleError && (
        <div
          style={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'var(--sh-danger-bg)',
            border: '1px solid var(--sh-danger-border)',
            color: 'var(--sh-danger-text)',
            padding: '12px 20px',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            maxWidth: 'calc(100vw - 48px)',
            textAlign: 'center',
          }}
          onClick={() => setGoogleError('')}
          role="alert"
        >
          {googleError}
        </div>
      )}

      {/* ── Google role picker (new users) ─────────────────── */}
      <GoogleRolePicker
        open={showRolePicker}
        onClose={() => setShowRolePicker(false)}
        pendingGoogle={pendingGoogle}
        loading={googleLoading}
        onSelect={handleGoogleRoleComplete}
      />

      <SignupBottomSheet
        open={showSignup}
        onClose={() => setShowSignup(false)}
        onSwitchToSignin={switchToSignin}
      />
      <SigninBottomSheet
        open={showSignin}
        onClose={() => setShowSignin(false)}
        onSwitchToSignup={switchToSignup}
      />
    </div>
  )
}

/* ── Google role picker bottom sheet ──────────────────────────── */
function GoogleRolePicker({ open, onClose, pendingGoogle, loading, onSelect }) {
  const [selected, setSelected] = useState('student')

  const roles = [
    { value: 'student', label: 'Student', desc: 'I am enrolled in a school or university' },
    { value: 'teacher', label: 'Teacher / Professor', desc: 'I teach or manage courses' },
    { value: 'other', label: 'Other', desc: 'Self-learner, tutor, or professional' },
  ]

  return (
    <BottomSheet open={open} onClose={onClose} title="One more step">
      {pendingGoogle?.name && (
        <p
          style={{
            color: 'var(--sh-subtext)',
            fontSize: 'var(--type-sm)',
            marginBottom: 'var(--space-5)',
            lineHeight: 1.5,
          }}
        >
          Welcome, <strong style={{ color: 'var(--sh-text)' }}>{pendingGoogle.name}</strong>. Pick
          your role to get started.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {roles.map((role) => (
          <button
            key={role.value}
            type="button"
            className={`mob-onboarding-option${selected === role.value ? ' mob-onboarding-option--selected' : ''}`}
            onClick={() => setSelected(role.value)}
          >
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div className="mob-onboarding-option-text">{role.label}</div>
              <div className="mob-onboarding-option-desc">{role.desc}</div>
            </div>
            <div className="mob-onboarding-check">
              {selected === role.value && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12l5 5L20 7"
                    stroke="#fff"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="mob-auth-submit"
        style={{ marginTop: 'var(--space-6)' }}
        disabled={loading}
        onClick={() => onSelect(selected)}
      >
        {loading ? 'Creating account...' : 'Continue'}
      </button>
    </BottomSheet>
  )
}
