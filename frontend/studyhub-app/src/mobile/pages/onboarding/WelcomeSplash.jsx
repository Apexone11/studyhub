// src/mobile/pages/onboarding/WelcomeSplash.jsx
// Celebratory welcome screen shown after onboarding completes.
// v3 refresh: confetti burst, check stroke-draw, haptic success.

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import anime from '../../lib/animeCompat'
import GradientMesh from '../../components/GradientMesh'
import MobileButton from '../../components/MobileButton'
import haptics from '../../lib/haptics'
import { confettiBurst, prefersReducedMotion, strokeDraw } from '../../lib/motion'

export default function WelcomeSplash() {
  const navigate = useNavigate()
  const checkRef = useRef(null)
  const checkSvgRef = useRef(null)
  const headingRef = useRef(null)
  const subRef = useRef(null)
  const btnRef = useRef(null)
  const confettiHostRef = useRef(null)

  useEffect(() => {
    const reduced = prefersReducedMotion()

    if (reduced) {
      ;[checkRef, headingRef, subRef, btnRef].forEach((ref) => {
        if (ref.current) {
          ref.current.style.opacity = '1'
          ref.current.style.transform = 'none'
        }
      })
      return undefined
    }

    const tl = anime.timeline({ easing: 'easeOutCubic' })

    tl.add({
      targets: checkRef.current,
      scale: [0, 1],
      opacity: [0, 1],
      duration: 500,
      easing: 'easeOutElastic(1, 0.5)',
    })
      .add(
        {
          targets: headingRef.current,
          translateY: [20, 0],
          opacity: [0, 1],
          duration: 450,
        },
        '-=200',
      )
      .add(
        {
          targets: subRef.current,
          translateY: [20, 0],
          opacity: [0, 1],
          duration: 450,
        },
        '-=300',
      )
      .add(
        {
          targets: btnRef.current,
          translateY: [20, 0],
          opacity: [0, 1],
          duration: 450,
        },
        '-=300',
      )

    // Stroke-draw the checkmark path.
    if (checkSvgRef.current) {
      strokeDraw(checkSvgRef.current, 650)
    }

    // Confetti + success haptic when the check snaps in (~320ms after mount).
    const confettiTimer = setTimeout(() => {
      haptics.success()
      if (confettiHostRef.current && checkRef.current) {
        const hostRect = confettiHostRef.current.getBoundingClientRect()
        const checkRect = checkRef.current.getBoundingClientRect()
        const origin = {
          x: checkRect.left - hostRect.left + checkRect.width / 2,
          y: checkRect.top - hostRect.top + checkRect.height / 2,
        }
        confettiBurst(confettiHostRef.current, origin, 28)
      }
    }, 320)

    return () => clearTimeout(confettiTimer)
  }, [])

  const handleStart = () => {
    // Clear onboarding draft state.
    try {
      sessionStorage.removeItem('mob-onboarding-goals')
      sessionStorage.removeItem('mob-onboarding-school')
      sessionStorage.removeItem('mob-onboarding-courses')
      sessionStorage.removeItem('mob-onboarding-notifs')
    } catch {
      /* storage unavailable is fine */
    }
    navigate('/m/home', { replace: true })
  }

  return (
    <div className="mob-welcome">
      <GradientMesh />

      <div ref={confettiHostRef} className="sh-m-welcome-confetti-host" aria-hidden="true" />

      <div
        ref={checkRef}
        className="mob-welcome-check"
        style={{ opacity: 0, transform: 'scale(0)' }}
      >
        <svg
          ref={checkSvgRef}
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M5 12l5 5L20 7"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h1
        ref={headingRef}
        className="mob-welcome-heading"
        style={{ opacity: 0, transform: 'translateY(20px)' }}
      >
        You are all set!
      </h1>

      <p
        ref={subRef}
        className="mob-welcome-subtitle"
        style={{ opacity: 0, transform: 'translateY(20px)' }}
      >
        Your study hub is ready. Discover sheets, connect with classmates, and start studying
        smarter.
      </p>

      <div
        ref={btnRef}
        style={{ opacity: 0, transform: 'translateY(20px)', width: '100%', maxWidth: 320 }}
      >
        <MobileButton block size="l" onClick={handleStart} hapticsKind="tap">
          Let's go
        </MobileButton>
      </div>
    </div>
  )
}
