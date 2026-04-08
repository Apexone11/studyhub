// HomePage renders the public landing experience and routes anonymous users into discovery flows.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API } from '../../config'
import { trackEvent } from '../../lib/telemetry'
import { usePageTitle } from '../../lib/usePageTitle'
import { fadeInOnScroll } from '../../lib/animations'
import Navbar from '../../components/Navbar'
import { HeroSection, ProofBanner } from './HomeHero'

// Below-fold sections are lazy-loaded so the hero paints without waiting for
// their JS. Vite will code-split HomeSections + homeConstants into a separate chunk.
const HomeSections = lazy(() => import('./HomeSections'))

// Minimal inline fallback — keeps layout stable while the chunk loads.
function BelowFoldFallback() {
  return <div style={{ minHeight: 600 }} aria-hidden="true" />
}

// Schedule work after first paint when possible.
const scheduleIdle = typeof requestIdleCallback === 'function'
  ? requestIdleCallback
  : (cb) => setTimeout(cb, 1)

export default function HomePage() {
  usePageTitle('The GitHub of Studying')
  const currentYear = new Date().getFullYear()
  const navigate = useNavigate()
  const [heroSearch, setHeroSearch] = useState('')
  const [platformStats, setPlatformStats] = useState(null)
  const featuresRef = useRef(null)
  const stepsRef = useRef(null)
  const testimonialsRef = useRef(null)

  // Defer stats fetch so the hero renders instantly with fallback values.
  useEffect(() => {
    const id = scheduleIdle(() => {
      fetch(`${API}/api/public/platform-stats`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => { if (data) setPlatformStats(data) })
        .catch(() => {})
    })
    return () => {
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id)
    }
  }, [])

  // Wire up scroll-triggered entrance animations after the lazy chunk has loaded
  // and the section refs are populated.
  const setupAnimations = useCallback(() => {
    scheduleIdle(() => {
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
    })
  }, [])

  function handleHeroSearch(e) {
    e.preventDefault()
    if (heroSearch.trim()) {
      trackEvent('landing_search_used', { query: heroSearch.trim() })
      navigate(`/sheets?search=${encodeURIComponent(heroSearch.trim())}`)
    }
  }

  return (
    <div className="home-page">
      <Navbar variant="landing" />

      <main id="main-content">
        <HeroSection
          heroSearch={heroSearch}
          setHeroSearch={setHeroSearch}
          onSearch={handleHeroSearch}
          platformStats={platformStats}
        />
        <ProofBanner />
        <Suspense fallback={<BelowFoldFallback />}>
          <HomeSections
            featuresRef={featuresRef}
            stepsRef={stepsRef}
            testimonialsRef={testimonialsRef}
            currentYear={currentYear}
            onReady={setupAnimations}
          />
        </Suspense>
      </main>
    </div>
  )
}
