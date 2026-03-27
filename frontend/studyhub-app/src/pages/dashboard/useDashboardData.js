/* ═══════════════════════════════════════════════════════════════════════════
 * useDashboardData.js — Custom hook for Dashboard data fetching and state
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { API } from '../../config'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { useSession } from '../../lib/session-context'
import { useLivePolling } from '../../lib/useLivePolling'
import { countUp, fadeInUp, staggerEntrance } from '../../lib/animations'
import { trackEvent } from '../../lib/telemetry'
import { useRecentlyViewed } from '../../lib/useRecentlyViewed'
import { useAllStudyStatuses } from '../../lib/useStudyStatus'
import { authHeaders, summaryCard } from './dashboardConstants'

const LAST_VISIT_KEY = 'studyhub.dashboard.lastVisit'

function getLastDashboardVisit() {
  try {
    const raw = localStorage.getItem(LAST_VISIT_KEY)
    return raw ? new Date(raw).getTime() : 0
  } catch { return 0 }
}

function markDashboardVisit() {
  try { localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString()) } catch { /* ignore */ }
}

export function useDashboardData() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, signOut } = useSession()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)
  const isWelcome = searchParams.get('welcome') === '1'
  const heroRef = useRef(null)
  const statsRef = useRef(null)
  const contentRef = useRef(null)
  const animatedRef = useRef(false)

  const loadSummary = async ({ signal, startTransition } = {}) => {
    const apply = startTransition || ((fn) => fn())

    try {
      const response = await fetch(`${API}/api/dashboard/summary`, {
        headers: authHeaders(),
        credentials: 'include',
        signal,
      })

      const data = await readJsonSafely(response, {})

      if (response.status === 403) {
        apply(() => {
          setError(getApiErrorMessage(data, 'You do not have permission to view your dashboard.'))
          setLoading(false)
        })
        return
      }

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not load your dashboard.'))
      }

      apply(() => {
        setSummary(data)
        setError('')
        setLoading(false)
      })
    } catch (loadError) {
      if (loadError?.name === 'AbortError') return

      apply(() => {
        setError(loadError.message || 'Could not load your dashboard.')
        setLoading(false)
      })
    }
  }

  useLivePolling(loadSummary, {
    enabled: Boolean(user),
    intervalMs: 45000,
  })

  const cards = useMemo(() => {
    const stats = summary?.stats || {}
    return [
      summaryCard('Courses', stats.courseCount || 0, 'Active enrollments', '#3b82f6', '/settings?tab=courses'),
      summaryCard('Sheets', stats.sheetCount || 0, 'Sheets you uploaded', '#10b981', '/sheets?mine=1'),
      summaryCard('Stars', stats.starCount || 0, 'Saved sheets', '#f59e0b', '/sheets?starred=1'),
    ]
  }, [summary])

  // Animate dashboard sections on first data load and fire one-time page view event
  useEffect(() => {
    if (!summary || animatedRef.current) return
    animatedRef.current = true
    trackEvent('dashboard_viewed', { isNewUser: summary.activation?.isNewUser ?? false })
    if (heroRef.current) fadeInUp(heroRef.current, { duration: 450, y: 16 })
    if (statsRef.current) {
      staggerEntrance(statsRef.current.children, { staggerMs: 80, duration: 450, y: 14 })
      // Count-up stat values
      const statEls = statsRef.current.querySelectorAll('[data-stat-value]')
      statEls.forEach((el) => {
        const end = parseInt(el.getAttribute('data-stat-value'), 10)
        if (!isNaN(end) && end > 0) countUp(el, end, { duration: 700 })
      })
    }
    if (contentRef.current) {
      staggerEntrance(contentRef.current.children, { staggerMs: 100, duration: 450, y: 14 })
    }
  }, [summary])

  const hero = summary?.hero || {}
  const courses = summary?.courses || []
  const recentSheets = useMemo(() => summary?.recentSheets || [], [summary])
  const { recentlyViewed } = useRecentlyViewed()
  const { counts: studyQueueCounts, toReview: studyToReview, studying: studyStudying } = useAllStudyStatuses()

  /* Study activity derived from recently-viewed localStorage data */
  const studyActivity = useMemo(() => {
    if (!recentlyViewed || recentlyViewed.length === 0) return null
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const thisWeek = recentlyViewed.filter((e) => new Date(e.viewedAt).getTime() > weekAgo)
    return { weeklyCount: thisWeek.length, lastStudied: recentlyViewed[0]?.viewedAt || null }
  }, [recentlyViewed])

  /* "What's new" — sheets added since user's last dashboard visit */
  const [lastVisit] = useState(getLastDashboardVisit)
  const newSheetCount = useMemo(() => {
    if (!recentSheets.length || !lastVisit) return recentSheets.length
    return recentSheets.filter((s) => new Date(s.createdAt).getTime() > lastVisit).length
  }, [recentSheets, lastVisit])

  // Mark dashboard visit once data loads
  useEffect(() => { if (summary) markDashboardVisit() }, [summary])

  return {
    user,
    signOut,
    navigate,
    summary,
    loading,
    error,
    setLoading,
    setError,
    loadSummary,
    welcomeDismissed,
    setWelcomeDismissed,
    isWelcome,
    heroRef,
    statsRef,
    contentRef,
    cards,
    hero,
    courses,
    recentSheets,
    recentlyViewed,
    studyActivity,
    newSheetCount,
    studyQueueCounts,
    studyToReview,
    studyStudying,
  }
}
