// src/mobile/pages/onboarding/OnboardingPeople.jsx
// Step 2 of 3: Find your people — school and course selection.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import anime from '../../lib/animeCompat'
import { API } from '../../../config'

export default function OnboardingPeople() {
  const navigate = useNavigate()
  const containerRef = useRef(null)

  const [schools, setSchools] = useState([])
  const [selectedSchool, setSelectedSchool] = useState('')
  const [courses, setCourses] = useState([])
  const [selectedCourses, setSelectedCourses] = useState(new Set())
  const [loadingSchools, setLoadingSchools] = useState(true)
  const [coursesFetched, setCoursesFetched] = useState(false)

  const prefersReduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (prefersReduced || !containerRef.current) return
    anime({
      targets: containerRef.current,
      translateY: [16, 0],
      opacity: [0, 1],
      duration: 400,
      easing: 'easeOutCubic',
    })
  }, [prefersReduced])

  // Fetch schools
  useEffect(() => {
    let active = true
    fetch(`${API}/api/schools`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (active) setSchools(Array.isArray(data) ? data : data.schools || [])
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingSchools(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Derive loading: school is selected but courses haven't arrived yet
  const loadingCourses = Boolean(selectedSchool) && !coursesFetched

  // Fetch courses when school changes
  useEffect(() => {
    if (!selectedSchool) return
    let active = true
    const controller = new AbortController()
    setCoursesFetched(false) // eslint-disable-line react-hooks/set-state-in-effect

    fetch(`${API}/api/courses?schoolId=${selectedSchool}&limit=50`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((raw) => {
        if (active) {
          const arr = Array.isArray(raw) ? raw : raw.courses || []
          setCourses(arr)
          setCoursesFetched(true)
        }
      })
      .catch(() => {
        if (active) {
          setCourses([])
          setCoursesFetched(true)
        }
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [selectedSchool])

  // Clear courses when school deselected (derived state)
  const displayedCourses = selectedSchool ? courses : []

  const toggleCourse = useCallback((id) => {
    setSelectedCourses((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleNext = () => {
    try {
      sessionStorage.setItem('mob-onboarding-school', selectedSchool)
      sessionStorage.setItem('mob-onboarding-courses', JSON.stringify([...selectedCourses]))
    } catch {
      /* ignore */
    }
    navigate('/m/onboarding/notifications')
  }

  return (
    <div className="mob-onboarding">
      <div className="mob-onboarding-progress">
        <div className="mob-onboarding-dot mob-onboarding-dot--done" />
        <div className="mob-onboarding-dot mob-onboarding-dot--active" />
        <div className="mob-onboarding-dot" />
      </div>

      <div className="mob-onboarding-icon" style={{ background: 'var(--sh-accent-purple-bg)' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="9" cy="8" r="3.5" stroke="var(--sh-accent-purple)" strokeWidth="2" />
          <path
            d="M2 20c0-3 3-5.5 7-5.5s7 2.5 7 5.5"
            stroke="var(--sh-accent-purple)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="17" cy="8" r="2.5" stroke="var(--sh-accent-purple)" strokeWidth="1.8" />
          <path
            d="M17 14.5c2.5 0 5 1.5 5 3.5"
            stroke="var(--sh-accent-purple)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <h2 className="mob-onboarding-heading">Find your people</h2>
      <p className="mob-onboarding-description">
        Select your school and courses to connect with classmates.
      </p>

      <div ref={containerRef} style={{ flex: 1 }}>
        {/* School selector */}
        <div className="mob-auth-field">
          <label className="mob-auth-label" htmlFor="mob-ob-school">
            Your School
          </label>
          <select
            id="mob-ob-school"
            className="mob-auth-input"
            value={selectedSchool}
            onChange={(e) => setSelectedSchool(e.target.value)}
            style={{ appearance: 'none' }}
          >
            <option value="">{loadingSchools ? 'Loading schools...' : 'Select your school'}</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Course list */}
        {selectedSchool && (
          <div className="mob-onboarding-options" style={{ maxHeight: 280, overflowY: 'auto' }}>
            {loadingCourses ? (
              <p
                style={{
                  color: 'var(--sh-muted)',
                  fontSize: 'var(--type-sm)',
                  textAlign: 'center',
                  padding: 'var(--space-6)',
                }}
              >
                Loading courses...
              </p>
            ) : displayedCourses.length === 0 ? (
              <p
                style={{
                  color: 'var(--sh-muted)',
                  fontSize: 'var(--type-sm)',
                  textAlign: 'center',
                  padding: 'var(--space-6)',
                }}
              >
                No courses found for this school yet.
              </p>
            ) : (
              displayedCourses.map((c) => {
                const isSelected = selectedCourses.has(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`mob-onboarding-option ${isSelected ? 'mob-onboarding-option--selected' : ''}`}
                    onClick={() => toggleCourse(c.id)}
                  >
                    <div style={{ flex: 1 }}>
                      <div className="mob-onboarding-option-text">{c.code || c.name}</div>
                      {c.code && c.name !== c.code && (
                        <div className="mob-onboarding-option-desc">{c.name}</div>
                      )}
                    </div>
                    <div className="mob-onboarding-check">
                      {isSelected && (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
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
              })
            )}
          </div>
        )}
      </div>

      <div className="mob-onboarding-footer">
        <button type="button" className="mob-onboarding-next" onClick={handleNext}>
          Continue
        </button>
        <button
          type="button"
          className="mob-onboarding-skip"
          onClick={() => navigate('/m/onboarding/notifications')}
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
