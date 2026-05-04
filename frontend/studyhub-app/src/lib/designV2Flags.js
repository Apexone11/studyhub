import { useEffect, useState } from 'react'
import { API } from '../config'

/**
 * Design Refresh v2 feature-flag wrapper.
 *
 * See docs/internal/web-master-plan.md for the 8-phase rollout. Each
 * phase ships behind a shared `design_v2_*` flag so web and mobile
 * light up together. Evaluation uses the existing
 * `/api/flags/evaluate/:name` endpoint with an in-memory cache.
 *
 * Fail-CLOSED semantics (decision #20, 2026-04-24, CLAUDE.md §12).
 * Only an explicit `enabled: true` response enables a flag. Missing
 * rows, network errors, and non-200 responses all return DISABLED.
 * This trades a "works on my machine" failure mode for a visible one:
 * if a shipped feature's row is missing in prod the feature silently
 * disappears (user ticket, 30-second fix — run `seed:flags`), rather
 * than an in-flight WIP surface quietly leaking to real users.
 *
 * Flag-row provisioning lives in `backend/scripts/seedFeatureFlags.js`
 * and runs via `npm --prefix backend run seed:flags`. Local dev
 * inherits it through `seed:beta`.
 *
 * Only flag names with a live consumer ship in this enum. Phases 5-8
 * (auth_split / onboarding / feed_polish / home_hero) were reserved
 * but never built — re-add them here when their UI lands so the same
 * name lookup pattern continues to work for new components.
 *
 * Flags covered:
 *   - design_v2_phase1_dashboard   — Phase 1: welcome hero, sectioned sidebar,
 *                                    top contributors mini-widget. SHIPPED 2026-04-23.
 *   - design_v2_upcoming_exams     — Phase 2: Upcoming Exams card + /api/exams.
 *                                    SHIPPED 2026-04-24.
 *   - design_v2_ai_card            — Phase 3: Inline Hub AI suggestion card.
 *   - design_v2_sheets_grid        — Phase 4: Sheets Grid/List toggle + preview.
 *   - design_v2_teach_materials    — W2: TeachMaterials index page.
 *   - design_v2_docs_public        — W2: public docs surface.
 *   - design_v2_groups_polish      — W2: study-groups polish.
 *   - design_v2_role_checklist     — W2: role-aware checklist on profile.
 *   - design_v2_weekly_focus       — W2: weekly focus widget.
 *   - design_v2_teach_sections     — W3: section-aware publishing.
 *   - design_v2_creator_audit      — W5: Creator Audit consent + audit UI.
 */

const FLAG_NAMES = {
  phase1Dashboard: 'design_v2_phase1_dashboard',
  upcomingExams: 'design_v2_upcoming_exams',
  aiCard: 'design_v2_ai_card',
  sheetsGrid: 'design_v2_sheets_grid',
  // Week 2 of v2 refresh — see
  // docs/internal/design-refresh-v2-week2-to-week5-execution.md
  //
  // Removed 2026-05-03: teachMaterials, docsPublic, groupsPolish,
  // roleChecklist, weeklyFocus. They had no UI consumers in the app
  // (verified by grep) and no seed rows in scripts/seedFeatureFlags.js,
  // so each one fired an HTTP fetch on every page load with zero effect.
  // Re-add only when a real consumer ships AND the flag is added to
  // SHIPPED_DESIGN_V2_FLAGS in the seed script.
  // Week 3 — Section-aware publishing (Sections + Materials + bulk assign).
  // See docs/internal/design-refresh-v2-week2-to-week5-execution.md §W3.
  teachSections: 'design_v2_teach_sections',
  creatorAudit: 'design_v2_creator_audit',
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
          // Fail-closed contract (decision #20, CLAUDE.md §12):
          //   - non-200 / non-JSON → disabled.
          //   - missing enabled boolean → disabled.
          //   - FLAG_NOT_FOUND (no DB row) → disabled. Shipped flags
          //     get explicit rows via `seed:flags`; in-flight flags
          //     have no row and stay off until they ship.
          //   - Any other response: honor `data.enabled` verbatim.
          if (!data || typeof data.enabled !== 'boolean') return false
          return data.enabled === true
        })
        .catch(() => false),
    )
  }
  return cache.get(name)
}

export function clearDesignV2FlagCache() {
  cache.clear()
}

// Fail-closed defaults. Every gated surface stays hidden until the
// server returns an explicit `enabled: true`. Consumers render against
// `loading: true` as the initial state so gated UI doesn't flash on
// mount before the fetch resolves.
const DEFAULTS = {
  phase1Dashboard: false,
  upcomingExams: false,
  aiCard: false,
  sheetsGrid: false,
  teachMaterials: false,
  docsPublic: false,
  groupsPolish: false,
  roleChecklist: false,
  weeklyFocus: false,
  teachSections: false,
  creatorAudit: false,
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
      fetchFlag(FLAG_NAMES.teachMaterials),
      fetchFlag(FLAG_NAMES.docsPublic),
      fetchFlag(FLAG_NAMES.groupsPolish),
      fetchFlag(FLAG_NAMES.roleChecklist),
      fetchFlag(FLAG_NAMES.weeklyFocus),
      fetchFlag(FLAG_NAMES.teachSections),
      fetchFlag(FLAG_NAMES.creatorAudit),
    ])
      .then(
        ([
          phase1Dashboard,
          upcomingExams,
          aiCard,
          sheetsGrid,
          teachMaterials,
          docsPublic,
          groupsPolish,
          roleChecklist,
          weeklyFocus,
          teachSections,
          creatorAudit,
        ]) => {
          if (cancelled) return
          setFlags({
            phase1Dashboard,
            upcomingExams,
            aiCard,
            sheetsGrid,
            teachMaterials,
            docsPublic,
            groupsPolish,
            roleChecklist,
            weeklyFocus,
            teachSections,
            creatorAudit,
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
