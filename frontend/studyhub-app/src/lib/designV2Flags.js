import { useEffect, useState } from 'react'
import { API } from '../config'

/**
 * Design Refresh v2 feature-flag wrapper.
 *
 * See docs/internal/design-refresh-v2-master-plan.md and
 * docs/internal/design-refresh-v2-mobile-plan.md for the 8-phase rollout.
 * Each phase ships behind a shared `design_v2_*` flag so web and mobile
 * light up together. Evaluation uses the existing
 * `/api/flags/evaluate/:name` endpoint with an in-memory cache.
 *
 * Fail-open semantics (matches the existing `rolesV2Flags` pattern):
 * if the flag row is missing or the network errors, we treat the flag
 * as ENABLED. Staged cohort rollout is handled server-side; this client
 * never hides functionality on a transient failure.
 *
 * Flags covered:
 *   - design_v2_phase1_dashboard   — Phase 1: welcome hero, sectioned sidebar,
 *                                    top contributors mini-widget.
 *   - design_v2_upcoming_exams     — Phase 2: Upcoming Exams card + /api/exams.
 *   - design_v2_ai_card            — Phase 3: Inline Hub AI suggestion card.
 *   - design_v2_sheets_grid        — Phase 4: Sheets Grid/List toggle + preview.
 *   - design_v2_auth_split         — Phase 5: Auth split layout + referral banner.
 *   - design_v2_onboarding         — Phase 6: Onboarding polish (skips + tour).
 *   - design_v2_feed_polish        — Phase 7: Feed density + swipe gestures.
 *   - design_v2_home_hero          — Phase 8: Public home hero + for-role cards.
 */

const FLAG_NAMES = {
  phase1Dashboard: 'design_v2_phase1_dashboard',
  upcomingExams: 'design_v2_upcoming_exams',
  aiCard: 'design_v2_ai_card',
  sheetsGrid: 'design_v2_sheets_grid',
  authSplit: 'design_v2_auth_split',
  onboarding: 'design_v2_onboarding',
  feedPolish: 'design_v2_feed_polish',
  homeHero: 'design_v2_home_hero',
}

// Module-level cache keyed by flag name → Promise<boolean>. Shared across
// hook consumers so we don't refetch on every mount.
const cache = new Map()

async function fetchFlag(name) {
  if (!cache.has(name)) {
    cache.set(
      name,
      fetch(`${API}/api/flags/evaluate/${name}`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data || typeof data.enabled !== 'boolean') return true
          return data.enabled
        })
        .catch(() => true),
    )
  }
  return cache.get(name)
}

export function clearDesignV2FlagCache() {
  cache.clear()
}

const DEFAULTS = {
  phase1Dashboard: true,
  upcomingExams: true,
  aiCard: true,
  sheetsGrid: true,
  authSplit: true,
  onboarding: true,
  feedPolish: true,
  homeHero: true,
  loading: true,
}

export function useDesignV2Flags() {
  const [flags, setFlags] = useState(DEFAULTS)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchFlag(FLAG_NAMES.phase1Dashboard),
      fetchFlag(FLAG_NAMES.upcomingExams),
      fetchFlag(FLAG_NAMES.aiCard),
      fetchFlag(FLAG_NAMES.sheetsGrid),
      fetchFlag(FLAG_NAMES.authSplit),
      fetchFlag(FLAG_NAMES.onboarding),
      fetchFlag(FLAG_NAMES.feedPolish),
      fetchFlag(FLAG_NAMES.homeHero),
    ])
      .then(
        ([
          phase1Dashboard,
          upcomingExams,
          aiCard,
          sheetsGrid,
          authSplit,
          onboarding,
          feedPolish,
          homeHero,
        ]) => {
          if (cancelled) return
          setFlags({
            phase1Dashboard,
            upcomingExams,
            aiCard,
            sheetsGrid,
            authSplit,
            onboarding,
            feedPolish,
            homeHero,
            loading: false,
          })
        },
      )
      .catch(() => {
        if (!cancelled) setFlags({ ...DEFAULTS, loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return flags
}

export { FLAG_NAMES }
