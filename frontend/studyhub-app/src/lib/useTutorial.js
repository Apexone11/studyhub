/* ═══════════════════════════════════════════════════════════════════════════
 * useTutorial.js — Shared hook for react-joyride tutorial popups
 *
 * Each page gets a tutorial with 3-5 steps max.
 * Triggered: First visit to the page OR click the tutorial re-trigger button.
 * Storage: localStorage key per page (e.g., `tutorial_feed_seen`).
 *
 * Usage:
 *   const tutorial = useTutorial('feed', FEED_STEPS)
 *   // In render:
 *   <Joyride {...tutorial.joyrideProps} />
 *   <button onClick={tutorial.restart}>Show Tutorial</button>
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from 'react'

const STORAGE_PREFIX = 'tutorial_'

/**
 * @param {string} pageKey — unique key for localStorage (e.g., 'feed', 'sheets')
 * @param {Array} steps — react-joyride step definitions
 * @param {object} [options]
 * @param {number} [options.delayMs=800] — delay before showing tutorial on first visit
 * @returns {{ joyrideProps: object, restart: () => void, seen: boolean }}
 */
export function useTutorial(pageKey, steps, options = {}) {
  const { delayMs = 800 } = options
  const storageKey = `${STORAGE_PREFIX}${pageKey}_seen`

  const [run, setRun] = useState(false)
  const [seen, setSeen] = useState(() => {
    try { return localStorage.getItem(storageKey) === '1' }
    catch { return false }
  })

  /* Auto-start on first visit after a short delay */
  useEffect(() => {
    if (seen || steps.length === 0) return undefined

    const timer = setTimeout(() => setRun(true), delayMs)
    return () => clearTimeout(timer)
  }, [seen, steps.length, delayMs])

  /* Mark as seen when tutorial completes or is skipped */
  const handleCallback = useCallback((data) => {
    const { status } = data
    const finishedStatuses = ['finished', 'skipped']
    if (finishedStatuses.includes(status)) {
      setRun(false)
      setSeen(true)
      try { localStorage.setItem(storageKey, '1') } catch { /* ignore */ }
    }
  }, [storageKey])

  /* Re-trigger button handler */
  const restart = useCallback(() => {
    setRun(true)
  }, [])

  /* Shared joyride props — spread onto <Joyride /> */
  const joyrideProps = {
    steps,
    run,
    continuous: true,
    showSkipButton: true,
    showProgress: true,
    disableOverlayClose: false,
    callback: handleCallback,
    locale: {
      back: 'Back',
      close: 'Got it',
      last: 'Done',
      next: 'Next',
      skip: 'Skip tour',
    },
    styles: {
      options: {
        zIndex: 10000,
        primaryColor: '#3b82f6',
        textColor: '#0f172a',
        backgroundColor: '#fff',
        arrowColor: '#fff',
        overlayColor: 'rgba(15, 23, 42, 0.4)',
      },
      tooltip: {
        borderRadius: 14,
        padding: '20px 22px',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        boxShadow: '0 12px 40px rgba(15, 23, 42, 0.15)',
      },
      tooltipTitle: {
        fontSize: 16,
        fontWeight: 800,
        marginBottom: 8,
      },
      tooltipContent: {
        fontSize: 13,
        lineHeight: 1.7,
        color: '#475569',
      },
      buttonNext: {
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 700,
        padding: '8px 16px',
      },
      buttonBack: {
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        color: '#64748b',
      },
      buttonSkip: {
        borderRadius: 8,
        fontSize: 12,
        color: '#94a3b8',
      },
      spotlight: {
        borderRadius: 12,
      },
    },
  }

  return { joyrideProps, restart, seen }
}
