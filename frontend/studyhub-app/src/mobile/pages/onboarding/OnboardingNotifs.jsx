// src/mobile/pages/onboarding/OnboardingNotifs.jsx
// Step 3 of 3: Notification preferences.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as _animeModule from 'animejs'
const anime = _animeModule.default || _animeModule

const NOTIF_OPTIONS = [
  { id: 'messages', label: 'Messages', desc: 'When someone sends you a direct message' },
  { id: 'mentions', label: 'Mentions', desc: 'When someone mentions you in a discussion' },
  { id: 'updates', label: 'Course updates', desc: 'New sheets and notes in your courses' },
  { id: 'announcements', label: 'Announcements', desc: 'Platform news and feature releases' },
]

export default function OnboardingNotifs() {
  const navigate = useNavigate()
  const containerRef = useRef(null)
  const [enabled, setEnabled] = useState(new Set(['messages', 'mentions', 'updates']))

  const prefersReduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (prefersReduced || !containerRef.current) return
    anime({
      targets: containerRef.current.children,
      translateY: [20, 0],
      opacity: [0, 1],
      duration: 400,
      delay: anime.stagger(80),
      easing: 'easeOutCubic',
    })
  }, [prefersReduced])

  const toggle = (id) => {
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleFinish = () => {
    try {
      sessionStorage.setItem('mob-onboarding-notifs', JSON.stringify([...enabled]))
    } catch {
      /* ignore */
    }
    navigate('/m/onboarding/welcome')
  }

  return (
    <div className="mob-onboarding">
      <div className="mob-onboarding-progress">
        <div className="mob-onboarding-dot mob-onboarding-dot--done" />
        <div className="mob-onboarding-dot mob-onboarding-dot--done" />
        <div className="mob-onboarding-dot mob-onboarding-dot--active" />
      </div>

      <div className="mob-onboarding-icon" style={{ background: 'var(--sh-success-bg)' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9z"
            stroke="var(--sh-success)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M13.73 21a2 2 0 01-3.46 0"
            stroke="var(--sh-success)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h2 className="mob-onboarding-heading">Stay in the loop</h2>
      <p className="mob-onboarding-description">
        Choose which notifications matter to you. You can change these later in Settings.
      </p>

      <div className="mob-onboarding-options" ref={containerRef}>
        {NOTIF_OPTIONS.map((opt) => {
          const isSelected = enabled.has(opt.id)
          return (
            <button
              key={opt.id}
              type="button"
              className={`mob-onboarding-option ${isSelected ? 'mob-onboarding-option--selected' : ''}`}
              onClick={() => toggle(opt.id)}
            >
              <div style={{ flex: 1 }}>
                <div className="mob-onboarding-option-text">{opt.label}</div>
                <div className="mob-onboarding-option-desc">{opt.desc}</div>
              </div>
              <div className="mob-onboarding-check">
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M5 12l5 5L20 7"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="mob-onboarding-footer">
        <button type="button" className="mob-onboarding-next" onClick={handleFinish}>
          Finish Setup
        </button>
        <button
          type="button"
          className="mob-onboarding-skip"
          onClick={() => navigate('/m/onboarding/welcome')}
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
