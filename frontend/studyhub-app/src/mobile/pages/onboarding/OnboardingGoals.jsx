// src/mobile/pages/onboarding/OnboardingGoals.jsx
// Step 1 of 3: What are your study goals?

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as _animeModule from 'animejs'
const anime = _animeModule.default || _animeModule

const GOALS = [
  { id: 'share', label: 'Share study materials', desc: 'Upload and collaborate on study sheets' },
  { id: 'discover', label: 'Discover resources', desc: 'Find sheets and notes for your courses' },
  { id: 'connect', label: 'Connect with classmates', desc: 'Message and form study groups' },
  { id: 'ai', label: 'AI-powered studying', desc: 'Generate sheets and get answers from Hub AI' },
]

export default function OnboardingGoals() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState(new Set())
  const containerRef = useRef(null)

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

  const toggle = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleNext = () => {
    // Store goals in sessionStorage for later API call
    try {
      sessionStorage.setItem('mob-onboarding-goals', JSON.stringify([...selected]))
    } catch {
      /* ignore */
    }
    navigate('/m/onboarding/people')
  }

  return (
    <div className="mob-onboarding">
      <div className="mob-onboarding-progress">
        <div className="mob-onboarding-dot mob-onboarding-dot--active" />
        <div className="mob-onboarding-dot" />
        <div className="mob-onboarding-dot" />
      </div>

      <div className="mob-onboarding-icon" style={{ background: 'var(--sh-brand-soft-bg)' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 2L9.5 8.5 3 12l6.5 3.5L12 22l2.5-6.5L21 12l-6.5-3.5L12 2z"
            stroke="var(--sh-brand)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h2 className="mob-onboarding-heading">What brings you here?</h2>
      <p className="mob-onboarding-description">
        Pick as many as you like. This helps us personalize your experience.
      </p>

      <div className="mob-onboarding-options" ref={containerRef}>
        {GOALS.map((goal) => {
          const isSelected = selected.has(goal.id)
          return (
            <button
              key={goal.id}
              type="button"
              className={`mob-onboarding-option ${isSelected ? 'mob-onboarding-option--selected' : ''}`}
              onClick={() => toggle(goal.id)}
            >
              <div style={{ flex: 1 }}>
                <div className="mob-onboarding-option-text">{goal.label}</div>
                <div className="mob-onboarding-option-desc">{goal.desc}</div>
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
        <button type="button" className="mob-onboarding-next" onClick={handleNext}>
          Continue
        </button>
        <button
          type="button"
          className="mob-onboarding-skip"
          onClick={() => navigate('/m/onboarding/people')}
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
