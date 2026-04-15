import { useFeatureFlag, getFlagSync } from '../../lib/featureFlags.js'

const FLAG_NAME = 'flag_notes_hardening_v2'
const LS_KEY = 'flag_notes_hardening_v2'

function readLocalOverride() {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage?.getItem(LS_KEY)
    if (v === '1' || v === 'true') return true
    if (v === '0' || v === 'false') return false
  } catch {
    /* private-mode */
  }
  return null
}

/**
 * React hook: returns whether Notes Hardening v2 is enabled for the current user.
 * Reads backend-driven flag via useFeatureFlag; a localStorage override
 * (`flag_notes_hardening_v2` = "1"/"0") wins for dev/QA.
 */
export function useNotesHardeningEnabled() {
  const { enabled } = useFeatureFlag(FLAG_NAME)
  const override = readLocalOverride()
  if (override !== null) return override
  return Boolean(enabled)
}

/**
 * Non-hook read for module-level callers that cannot use hooks (e.g. the
 * guard inside useNotesData.js's legacy autosave).
 *
 * Known limitation: this cannot call the backend without a React render,
 * so it can only consult the cached flag value populated by a prior
 * useFeatureFlag mount. For the initial page load before any component
 * has read the flag, it falls back to the localStorage override (null if
 * unset) and returns false. Once NoteEditor mounts, the cache is warm
 * and subsequent module-level checks see the real value.
 */
export function isNotesHardeningEnabled() {
  const override = readLocalOverride()
  if (override !== null) return override
  const sync = getFlagSync(FLAG_NAME)
  return sync === true
}
