// HomePage renders the public landing experience and routes anonymous users into discovery flows.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API } from '../../config'
import { trackEvent } from '../../lib/telemetry'
import { usePageTitle } from '../../lib/usePageTitle'
import { fadeInOnScroll } from '../../lib/animations'
import Navbar from '../../components/Navbar'
import { HeroSection, ProofBanner } from './HomeHero'
import {
  FeaturesSection,
  StepsSection,
  TestimonialsSection,
  CtaSection,
  HomeFooter,
} from './HomeSections'

export default function HomePage() {
  usePageTitle('The GitHub of Studying')
  const currentYear = new Date().getFullYear()
  const navigate = useNavigate()
  const [heroSearch, setHeroSearch] = useState('')
  const [platformStats, setPlatformStats] = useState(null)
  const featuresRef = useRef(null)
  const stepsRef = useRef(null)
  const testimonialsRef = useRef(null)

  useEffect(() => {
    fetch(`${API}/api/public/platform-stats`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data) setPlatformStats(data) })
      .catch(() => {})
  }, [])

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
        <FeaturesSection ref={featuresRef} />
        <StepsSection ref={stepsRef} />
        <TestimonialsSection ref={testimonialsRef} />
        <CtaSection />
      </main>

      <HomeFooter currentYear={currentYear} />
    </div>
  )
}
