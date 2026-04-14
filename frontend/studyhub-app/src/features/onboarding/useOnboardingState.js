/* ═══════════════════════════════════════════════════════════════════════════
 * useOnboardingState -- Hook for managing onboarding progress state
 *
 * Fetches and syncs onboarding state with the server.
 * Tracks time-on-step for analytics.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useRef, useCallback } from 'react'
import { API } from '../../config'

const FETCH_OPTS = { credentials: 'include', headers: { 'Content-Type': 'application/json' } }

/**
 * @returns {{
 *   state: object|null,
 *   loading: boolean,
 *   error: string|null,
 *   submitting: boolean,
 *   submitStep: (step: number, payload: object) => Promise<void>,
 *   skip: () => Promise<void>,
 *   complete: () => Promise<void>,
 * }}
 */
export function useOnboardingState() {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Track time on each step
  const stepTimerRef = useRef(performance.now())
  const currentStepRef = useRef(null)

  // Reset step timer when currentStep changes
  useEffect(() => {
    if (state && state.currentStep !== currentStepRef.current) {
      currentStepRef.current = state.currentStep
      stepTimerRef.current = performance.now()
    }
  }, [state])

  // Initial fetch
  useEffect(() => {
    let cancelled = false
    async function fetchState() {
      try {
        const res = await fetch(`${API}/api/onboarding/state`, FETCH_OPTS)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Failed to fetch onboarding state (${res.status})`)
        }
        const data = await res.json()
        if (!cancelled) {
          setState(data.state || null)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchState()
    return () => {
      cancelled = true
    }
  }, [])

  const getTimeOnStepMs = useCallback(() => {
    return Math.round(performance.now() - stepTimerRef.current)
  }, [])

  const submitStep = useCallback(
    async (step, payload) => {
      setSubmitting(true)
      setError(null)
      try {
        const body = {
          step,
          payload: { ...payload, timeOnStepMs: getTimeOnStepMs() },
        }
        const res = await fetch(`${API}/api/onboarding/step`, {
          ...FETCH_OPTS,
          method: 'POST',
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `Step submission failed (${res.status})`)
        }
        const data = await res.json()
        setState(data.state || null)
      } catch (err) {
        setError(err.message)
      } finally {
        setSubmitting(false)
      }
    },
    [getTimeOnStepMs],
  )

  const skip = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API}/api/onboarding/skip`, {
        ...FETCH_OPTS,
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Skip failed (${res.status})`)
      }
      const data = await res.json()
      setState(data.state || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }, [])

  const complete = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API}/api/onboarding/complete`, {
        ...FETCH_OPTS,
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Complete failed (${res.status})`)
      }
      const data = await res.json()
      setState(data.state || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }, [])

  return { state, loading, error, submitting, submitStep, skip, complete }
}
