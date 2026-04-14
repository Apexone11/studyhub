/* ═══════════════════════════════════════════════════════════════════════════
 * useTutorial.js — Shared hook for react-joyride tutorial popups
 *
 * Each page gets a tutorial with 3-5 steps max.
 * Triggered: First visit to the page OR click the tutorial re-trigger button.
 * Storage: Versioned localStorage key per page (e.g., `tutorial_feed_v1_seen`).
 *
 * Usage:
 *   import { useTutorial } from '../../lib/useTutorial'
 *   import { TUTORIAL_VERSIONS, FEED_STEPS } from '../../lib/tutorialSteps'
 *   const tutorial = useTutorial('feed', FEED_STEPS, { version: TUTORIAL_VERSIONS.feed })
 *   // In render:
 *   <Joyride {...tutorial.joyrideProps} />
 *   <button onClick={tutorial.restart}>Show Tutorial</button>
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback, useMemo } from 'react'

/**
 * @param {string} pageKey — unique key for localStorage (e.g., 'feed', 'sheets')
 * @param {Array} steps — react-joyride step definitions
 * @param {object} [options]
 * @param {number} [options.delayMs=800] — delay before showing tutorial on first visit
 * @param {number} [options.version=1] — increment to reset seen state for all users
 * @returns {{ joyrideProps: object, restart: () => void, seen: boolean }}
 */
/** Check if tutorials are globally disabled via user preference */
function areTutorialsDisabled() {
  try {
    return localStorage.getItem('studyhub_tutorials_disabled') === '1'
  } catch {
    return false
  }
}

export function useTutorial(pageKey, steps, options = {}) {
  const { delayMs = 800, version = 1 } = options
  const storageKey = `tutorial_${pageKey}_v${version}_seen`
  const globallyDisabled = useMemo(() => areTutorialsDisabled(), [])

  const alreadySeen = useMemo(() => {
    if (globallyDisabled) return true
    try {
      return localStorage.getItem(storageKey) === '1'
    } catch {
      return true
    }
  }, [storageKey, globallyDisabled])

  const [run, setRun] = useState(false)
  const [hasTriggered, setHasTriggered] = useState(false)
  const [resolvedSteps, setResolvedSteps] = useState([])

  const resolveSteps = useCallback(() => {
    if (typeof document === 'undefined') {
      setResolvedSteps(steps)
      return steps
    }

    const nextSteps = steps.filter((step) => {
      if (!step?.target || typeof step.target !== 'string') return true
      return Boolean(document.querySelector(step.target))
    })

    setResolvedSteps(nextSteps)
    return nextSteps
  }, [steps])

  useEffect(() => {
    const timer = setTimeout(() => {
      resolveSteps()
    }, 0)

    return () => clearTimeout(timer)
  }, [resolveSteps])

  // Auto-trigger once after delay, only if not seen
  useEffect(() => {
    if (alreadySeen || hasTriggered || resolvedSteps.length === 0) return undefined
    const timer = setTimeout(() => {
      setRun(true)
      setHasTriggered(true)
    }, delayMs)
    return () => clearTimeout(timer)
  }, [alreadySeen, hasTriggered, delayMs, resolvedSteps.length])

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(storageKey, '1')
    } catch {
      // localStorage unavailable
    }
  }, [storageKey])

  const handleCallback = useCallback(
    (data) => {
      const { status } = data
      if (status === 'finished' || status === 'skipped') {
        setRun(false)
        markSeen()
      }
    },
    [markSeen],
  )

  const restart = useCallback(() => {
    const nextSteps = resolveSteps()
    if (nextSteps.length === 0) return
    setRun(true)
  }, [resolveSteps])

  const joyrideProps = useMemo(
    () => ({
      steps: resolvedSteps,
      run: run && resolvedSteps.length > 0,
      continuous: true,
      showSkipButton: true,
      showProgress: true,
      disableOverlayClose: false,
      callback: handleCallback,
      locale: {
        back: 'Back',
        close: 'Close',
        last: 'Done',
        next: 'Next',
        skip: 'Skip',
      },
      styles: {
        options: {
          zIndex: 10000,
          primaryColor: 'var(--sh-brand, #3b82f6)',
          textColor: 'var(--sh-text, #0f172a)',
          backgroundColor: 'var(--sh-surface, #fff)',
          arrowColor: 'var(--sh-surface, #fff)',
          overlayColor: 'rgba(15, 23, 42, 0.4)',
        },
        tooltip: {
          borderRadius: 14,
          padding: '20px 22px',
          boxShadow: '0 12px 40px rgba(15, 23, 42, 0.15)',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        },
        spotlight: { borderRadius: 12 },
        buttonNext: {
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 600,
          borderRadius: 8,
          fontSize: 14,
        },
        buttonBack: {
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 500,
          fontSize: 14,
          color: 'var(--sh-subtext, #475569)',
        },
        buttonSkip: {
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 500,
          fontSize: 13,
          color: 'var(--sh-muted, #94a3b8)',
        },
      },
    }),
    [resolvedSteps, run, handleCallback],
  )

  return { joyrideProps, restart, seen: alreadySeen }
}

export default useTutorial
