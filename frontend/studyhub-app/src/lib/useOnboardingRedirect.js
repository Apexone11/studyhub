/* ═══════════════════════════════════════════════════════════════════════════
 * useOnboardingRedirect -- Checks if user should be redirected to onboarding
 *
 * Used by FeedPage to redirect new users and show "Resume setup" banner.
 * Fetches onboarding state and feature flag once, caches results.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { API } from '../config'
import { useFeatureFlag } from './featureFlags'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/** Module-level cache so we only fetch once per session. */
let cachedFetchResult = undefined // undefined = not fetched

/**
 * Computes banner + redirect eligibility from the raw state.
 * Called inside effects where Date.now() is allowed.
 */
function evaluateState(raw) {
  if (!raw) return { state: null, needsRedirect: false, bannerEligible: false }
  const now = Date.now()
  const needsRedirect = !raw.completed && !raw.skipped
  let bannerEligible = false
  if (!raw.completed && raw.skipped && raw.skippedAt) {
    const skippedAt = new Date(raw.skippedAt).getTime()
    bannerEligible = now - skippedAt <= SEVEN_DAYS_MS
  }
  return { state: raw, needsRedirect, bannerEligible }
}

/**
 * Lightweight hook that fetches onboarding state once per session.
 */
function useOnboardingStateFetch(user) {
  const alreadyCached = cachedFetchResult !== undefined
  const [result, setResult] = useState(() =>
    alreadyCached
      ? { ...cachedFetchResult, done: true }
      : { state: null, needsRedirect: false, bannerEligible: false, done: false },
  )

  useEffect(() => {
    if (!user || alreadyCached) return
    let cancelled = false
    fetch(`${API}/api/onboarding/state`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        const evaluated = evaluateState(data?.state || null)
        cachedFetchResult = evaluated
        setResult({ ...evaluated, done: true })
      })
      .catch(() => {
        if (!cancelled) {
          const evaluated = evaluateState(null)
          cachedFetchResult = evaluated
          setResult({ ...evaluated, done: true })
        }
      })
    return () => {
      cancelled = true
    }
  }, [user, alreadyCached])

  return result
}

/**
 * @param {{ user: object|null }} opts
 * @returns {{
 *   checking: boolean,
 *   showBanner: boolean,
 *   dismissBanner: () => void,
 * }}
 */
export function useOnboardingRedirect({ user }) {
  const navigate = useNavigate()
  const { enabled: flagEnabled, loading: flagLoading } = useFeatureFlag('ONBOARDING_ENABLED')
  const {
    state: onboardingState,
    needsRedirect,
    bannerEligible,
    done: stateFetched,
  } = useOnboardingStateFetch(user)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const redirectedRef = useRef(false)

  // Redirect check: new user with incomplete, non-skipped onboarding
  useEffect(() => {
    if (!user || !stateFetched || flagLoading || redirectedRef.current) return
    if (!flagEnabled || !needsRedirect || !onboardingState) return

    // Only redirect users created in the last 30 days
    const createdAt = new Date(user.createdAt).getTime()
    if (Date.now() - createdAt > THIRTY_DAYS_MS) return

    redirectedRef.current = true
    navigate('/onboarding', { replace: true })
  }, [user, stateFetched, flagLoading, flagEnabled, needsRedirect, onboardingState, navigate])

  // Banner: derived purely from pre-computed flags (no impure calls during render)
  const showBanner = useMemo(() => {
    if (!user || !stateFetched || !flagEnabled || flagLoading) return false
    return bannerEligible && !bannerDismissed
  }, [user, stateFetched, flagEnabled, flagLoading, bannerEligible, bannerDismissed])

  const dismissBanner = useCallback(() => setBannerDismissed(true), [])

  const checking = !stateFetched || flagLoading

  return { checking, showBanner, dismissBanner }
}
