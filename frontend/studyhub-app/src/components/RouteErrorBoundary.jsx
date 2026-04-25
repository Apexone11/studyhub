/* ═══════════════════════════════════════════════════════════════════════════
 * RouteErrorBoundary.jsx -- Production-grade error boundary for route trees.
 *
 * Uses react-error-boundary (the industry standard used by Vercel, Shopify,
 * Stripe, and every serious React app) instead of a manual class component.
 *
 * Features:
 *   - Automatic reset on route change via resetKeys
 *   - Chunk load error detection (stale deploy) with auto-reload
 *   - Auto-retry with countdown for transient errors (max 2 retries)
 *   - Telemetry integration (Sentry event ID)
 *   - Professional fallback UI with retry + navigation buttons
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ErrorBoundary } from 'react-error-boundary'
import { captureRouteCrash } from '../lib/telemetry'

/* ── Helpers ────────────────────────────────────────────────────────────── */

/** Detect chunk load / dynamic import failures caused by stale deploys. */
function isChunkLoadError(error) {
  if (!error) return false
  const name = error.name || ''
  const msg = (error.message || '').toLowerCase()
  return (
    name === 'ChunkLoadError' ||
    msg.includes('loading chunk') ||
    msg.includes('dynamically imported module') ||
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed')
  )
}

const CHUNK_RELOAD_KEY = 'sh_chunk_reload'
const RETRY_COUNT_KEY = 'sh_error_retries'
const MAX_AUTO_RETRIES = 2
const AUTO_RETRY_DELAY = 3000

/* ── Fallback Component ─────────────────────────────────────────────────
 * Rendered when a crash is caught. Handles:
 *   1. Chunk errors -- prompt a full page reload
 *   2. Transient errors -- auto-retry with countdown (max 2)
 *   3. Persistent errors -- show retry button + "Go to Feed" escape hatch
 * ──────────────────────────────────────────────────────────────────────── */
function ErrorFallback({ error, resetErrorBoundary }) {
  const navigate = useNavigate()
  const countdownRef = useRef(null)
  const retryTimerRef = useRef(null)

  // Compute Sentry event ID once per error (no setState inside effect)
  const eventId = useMemo(() => {
    const id = captureRouteCrash(error, {
      route: window.location.pathname + window.location.search,
      componentStack: '',
    })
    return id || ''
  }, [error])

  // Compute retry state synchronously (avoids setState inside effect)
  const retries = useMemo(
    () => parseInt(sessionStorage.getItem(RETRY_COUNT_KEY) || '0', 10),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-evaluate on each new error
    [error],
  )
  const shouldAutoRetry = retries < MAX_AUTO_RETRIES && !isChunkLoadError(error)
  const initialCountdown = shouldAutoRetry ? Math.ceil(AUTO_RETRY_DELAY / 1000) : 0
  const [countdown, setCountdown] = useState(initialCountdown)

  // On mount: handle chunk errors, schedule auto-retry
  useEffect(() => {
    // Chunk load error: try a one-time full page reload
    if (isChunkLoadError(error)) {
      const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY)
      if (!alreadyReloaded) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
        window.location.reload()
        return
      }
      sessionStorage.removeItem(CHUNK_RELOAD_KEY)
    }

    // Auto-retry for non-chunk errors
    if (shouldAutoRetry) {
      sessionStorage.setItem(RETRY_COUNT_KEY, String(retries + 1))

      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1000)

      retryTimerRef.current = setTimeout(() => {
        resetErrorBoundary()
      }, AUTO_RETRY_DELAY)
    }

    return () => {
      clearInterval(countdownRef.current)
      clearTimeout(retryTimerRef.current)
    }
  }, [error, resetErrorBoundary, shouldAutoRetry, retries])

  const handleRetry = useCallback(() => {
    clearInterval(countdownRef.current)
    clearTimeout(retryTimerRef.current)
    sessionStorage.removeItem(RETRY_COUNT_KEY)
    resetErrorBoundary()
  }, [resetErrorBoundary])

  const handleGoFeed = useCallback(() => {
    sessionStorage.removeItem(RETRY_COUNT_KEY)
    sessionStorage.removeItem(CHUNK_RELOAD_KEY)
    navigate('/feed')
  }, [navigate])

  const isChunk = isChunkLoadError(error)

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background: 'var(--sh-soft, #edf0f5)',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: 'min(92vw, 520px)',
          background: 'var(--sh-surface, #fff)',
          borderRadius: 16,
          border: '1px solid var(--sh-border, #e2e8f0)',
          boxShadow: '0 10px 40px rgba(15, 23, 42, 0.08)',
          padding: '28px',
        }}
      >
        <h1 style={{ margin: '0 0 10px', fontSize: 24, color: 'var(--sh-slate-900, #0f172a)' }}>
          {isChunk ? 'Update available' : 'This page crashed.'}
        </h1>
        <p
          style={{
            margin: '0 0 18px',
            fontSize: 14,
            color: 'var(--sh-slate-500, #64748b)',
            lineHeight: 1.7,
          }}
        >
          {isChunk
            ? 'StudyHub was updated since you last loaded the page. A refresh should fix this.'
            : countdown > 0
              ? `Something went wrong. Automatically retrying in ${countdown} second${countdown !== 1 ? 's' : ''}...`
              : 'StudyHub recovered the app shell, but this route hit a runtime error. You can retry the route or jump back to a stable page.'}
        </p>
        {eventId ? (
          <p
            style={{
              margin: '0 0 18px',
              fontSize: 12,
              color: 'var(--sh-slate-600, #475569)',
              lineHeight: 1.7,
            }}
          >
            Reference ID: <strong>{eventId}</strong>
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isChunk ? (
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem(CHUNK_RELOAD_KEY)
                window.location.reload()
              }}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: 'none',
                background: 'var(--sh-brand)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Refresh Page
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRetry}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: 'none',
                background: 'var(--sh-brand)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Retry Route
            </button>
          )}
          <button
            type="button"
            onClick={handleGoFeed}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: 'var(--sh-surface, #fff)',
              color: 'var(--sh-slate-600, #475569)',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Go To Feed
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main Export ─────────────────────────────────────────────────────────
 * Wraps children in react-error-boundary's ErrorBoundary.
 * resetKeys = [pathname + search] means the boundary auto-resets whenever
 * the user navigates to a different route, which is the behavior major
 * apps (Next.js, Remix) provide out of the box.
 * ──────────────────────────────────────────────────────────────────────── */
export default function RouteErrorBoundary({ children }) {
  const location = useLocation()

  const handleReset = useCallback(() => {
    // Clear retry counter on successful reset so it resets between crashes
    sessionStorage.removeItem(RETRY_COUNT_KEY)
    sessionStorage.removeItem(CHUNK_RELOAD_KEY)
  }, [])

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={handleReset}
      resetKeys={[location.pathname, location.search]}
    >
      {children}
    </ErrorBoundary>
  )
}
