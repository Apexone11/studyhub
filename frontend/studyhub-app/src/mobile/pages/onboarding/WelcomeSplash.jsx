// src/mobile/pages/onboarding/WelcomeSplash.jsx
// Celebratory welcome screen shown after onboarding completes.
// Animates a checkmark, heading, subtitle, and CTA button.

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import anime from '../../lib/animeCompat'
import GradientMesh from '../../components/GradientMesh'

export default function WelcomeSplash() {
  const navigate = useNavigate()
  const checkRef = useRef(null)
  const headingRef = useRef(null)
  const subRef = useRef(null)
  const btnRef = useRef(null)

  const prefersReduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (prefersReduced) {
      ;[checkRef, headingRef, subRef, btnRef].forEach((ref) => {
        if (ref.current) {
          ref.current.style.opacity = '1'
          ref.current.style.transform = 'none'
        }
      })
      return
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
  }, [prefersReduced])

  const handleStart = () => {
    // Clear onboarding state
    try {
      sessionStorage.removeItem('mob-onboarding-goals')
      sessionStorage.removeItem('mob-onboarding-school')
      sessionStorage.removeItem('mob-onboarding-courses')
      sessionStorage.removeItem('mob-onboarding-notifs')
    } catch {
      /* ignore */
    }
    navigate('/m/home', { replace: true })
  }

  return (
    <div className="mob-welcome">
      <GradientMesh />

      <div
        ref={checkRef}
        className="mob-welcome-check"
        style={{ opacity: 0, transform: 'scale(0)' }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

      <button
        ref={btnRef}
        type="button"
        className="mob-welcome-start"
        onClick={handleStart}
        style={{ opacity: 0, transform: 'translateY(20px)' }}
      >
        Let's go
      </button>
    </div>
  )
}
