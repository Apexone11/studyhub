/* ═══════════════════════════════════════════════════════════════════════════
 * AiSuggestionCard.jsx — Phase 3 of v2 design refresh.
 *
 * Inline study-coach card for the UserProfilePage Overview tab. Shows
 * one AI-generated suggestion at a time with Refresh + Dismiss actions
 * and a primary CTA into Hub AI. Self-contained: gates on the flag,
 * fetches its own state, manages all 5 states internally.
 *
 * State matrix (`status` local state):
 *   - 'loading'           Initial fetch in flight → <SkeletonCard />.
 *   - 'happy'             Suggestion present → render text + CTA + actions.
 *   - 'empty'             API returned suggestion=null + quota intact.
 *   - 'quota_exhausted'   API returned quotaExhausted=true.
 *   - 'error'             Fetch threw or non-OK status.
 *
 * Flag-gating: returns null when the design_v2_ai_card flag is off.
 * Fail-closed semantics per CLAUDE.md §12 (decision #20) — the
 * useDesignV2Flags hook is what enforces this; we just check it.
 *
 * Quota burn protection: the parent gates dismiss + refresh via separate
 * server-side rate limiters (5/hour refresh, 20/hour dismiss). Optimistic
 * dismiss hides the card immediately and only re-shows on a server error.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API } from '../../config'
import { Button, Card, CardBody, Chip, SkeletonCard } from '../../components/ui'
import { useDesignV2Flags } from '../../lib/designV2Flags'
import { readJsonSafely } from '../../lib/http'
import styles from './AiSuggestionCard.module.css'

const SUGGESTIONS_URL = `${API}/api/ai/suggestions`

/** Inline refresh icon. Kept local rather than adding to the
 *  components/ui Icons barrel — Phase 3 explicitly does not add new
 *  primitives, and a refresh icon outside of this card has no
 *  consumer yet. If a second feature needs it, promote then. */
function RefreshIcon({ size = 16 }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <polyline points="21 4 21 10 15 10" />
    </svg>
  )
}

/** Map an action token from the backend to a route. The backend's
 *  validateModelOutput pins the allowlist to these three; anything
 *  else is treated as 'open_chat' for safety. */
function actionToRoute(action) {
  switch (action) {
    case 'create_sheet':
      return '/sheets/upload'
    case 'review_sheet':
      return '/sheets'
    case 'open_chat':
    default:
      return '/ai'
  }
}

export default function AiSuggestionCard() {
  const flags = useDesignV2Flags()
  const navigate = useNavigate()

  // While the flag-evaluate fetch is in flight we render nothing.
  // Fail-closed default keeps the card invisible during the brief
  // flicker between mount and the flag landing.
  const flagOn = !flags.loading && flags.aiCard

  const [status, setStatus] = useState('loading')
  const [suggestion, setSuggestion] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshDisabled, setRefreshDisabled] = useState(false)

  const applyResponseShape = useCallback((data) => {
    if (data?.quotaExhausted) {
      setSuggestion(null)
      setStatus('quota_exhausted')
      return
    }
    if (data?.suggestion) {
      setSuggestion(data.suggestion)
      setStatus('happy')
      return
    }
    setSuggestion(null)
    setStatus('empty')
  }, [])

  // Initial fetch on mount once the flag is known to be on.
  useEffect(() => {
    if (!flagOn) return
    let cancelled = false
    const controller = new AbortController()
    setStatus('loading')
    fetch(SUGGESTIONS_URL, { credentials: 'include', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load suggestion.')
        return readJsonSafely(res, {})
      })
      .then((data) => {
        if (cancelled) return
        applyResponseShape(data)
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return
        setStatus('error')
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [flagOn, applyResponseShape])

  const handleRefresh = useCallback(async () => {
    if (refreshing || refreshDisabled) return
    setRefreshing(true)
    try {
      const res = await fetch(`${SUGGESTIONS_URL}/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (res.status === 429) {
        // Hourly refresh cap hit. Disable the button for the rest of
        // the page lifecycle — the limiter window is an hour and the
        // user almost certainly doesn't need to refresh five times in
        // an hour anyway.
        setRefreshDisabled(true)
        return
      }
      if (!res.ok) {
        setStatus('error')
        return
      }
      const data = await readJsonSafely(res, {})
      applyResponseShape(data)
    } catch {
      setStatus('error')
    } finally {
      setRefreshing(false)
    }
  }, [refreshing, refreshDisabled, applyResponseShape])

  const handleDismiss = useCallback(async () => {
    if (!suggestion?.id) return
    // Optimistic: hide the card immediately. If the server rejects, we
    // re-show it (rare — the only legitimate error is rate-limit or
    // network failure).
    const previous = suggestion
    setSuggestion(null)
    setStatus('empty')
    try {
      const res = await fetch(`${SUGGESTIONS_URL}/${previous.id}/dismiss`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok && res.status !== 404) {
        // 404 means it was already dismissed (e.g. another tab). That's
        // fine — leave the optimistic empty state. Anything else is a
        // real failure; reconcile by re-showing.
        setSuggestion(previous)
        setStatus('happy')
      }
    } catch {
      setSuggestion(previous)
      setStatus('happy')
    }
  }, [suggestion])

  const handleCtaClick = useCallback(() => {
    if (!suggestion) return
    navigate(actionToRoute(suggestion.ctaAction))
  }, [navigate, suggestion])

  // Flag-off → render nothing. Loading the flag itself also returns
  // nothing so the fail-closed default doesn't briefly flash a card.
  if (!flagOn) return null

  if (status === 'loading') {
    return <SkeletonCard data-testid="ai-suggestion-skeleton" />
  }

  return (
    <Card
      padding="md"
      aria-labelledby="ai-suggestion-heading"
      className={styles.card}
      data-testid="ai-suggestion-card"
    >
      <CardBody>
        <header className={styles.header}>
          <Chip variant="eyebrow" tone="brand-accent" size="sm">
            STUDY SUGGESTION
          </Chip>
          {/* Refresh is hidden in the empty / quota states because
              spamming it can't help the user there and would just
              burn the hourly limiter. */}
          {status === 'happy' ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRefresh}
              disabled={refreshDisabled}
              loading={refreshing}
              aria-label="Refresh suggestion"
              data-testid="ai-suggestion-refresh"
            >
              <RefreshIcon />
            </Button>
          ) : null}
        </header>

        {status === 'happy' ? (
          <>
            <p id="ai-suggestion-heading" className={styles.text} data-testid="ai-suggestion-text">
              {suggestion.text}
            </p>
            <footer className={styles.footer}>
              <Button variant="primary" size="sm" onClick={handleCtaClick}>
                {suggestion.ctaLabel}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                aria-label="Dismiss suggestion"
                data-testid="ai-suggestion-dismiss"
              >
                Dismiss
              </Button>
            </footer>
          </>
        ) : null}

        {status === 'empty' ? (
          <>
            <p id="ai-suggestion-heading" className={styles.text}>
              No suggestions right now.
            </p>
            <p className={styles.subtext}>Check back later.</p>
            <footer className={styles.footer}>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRefresh}
                disabled={refreshDisabled}
                loading={refreshing}
                aria-label="Refresh suggestion"
              >
                Refresh
              </Button>
            </footer>
          </>
        ) : null}

        {status === 'quota_exhausted' ? (
          <p id="ai-suggestion-heading" className={styles.text} data-testid="ai-suggestion-quota">
            You&rsquo;ve used today&rsquo;s AI budget. Resets at midnight.
          </p>
        ) : null}

        {status === 'error' ? (
          <>
            <p id="ai-suggestion-heading" className={styles.text}>
              Couldn&rsquo;t load right now.
            </p>
            <footer className={styles.footer}>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRefresh}
                loading={refreshing}
                aria-label="Retry"
              >
                Try again
              </Button>
            </footer>
          </>
        ) : null}
      </CardBody>
    </Card>
  )
}
