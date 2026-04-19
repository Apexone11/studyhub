import { useEffect, useState } from 'react'
import { API } from '../config'

/**
 * Roles v2 feature-flag wrapper (docs/internal/roles-and-permissions-plan.md §13).
 *
 * Each flag is evaluated via the existing `/api/flags/evaluate/:name` endpoint
 * and cached in-memory. Evaluation failures (network, missing flag row) are
 * fail-open: behaviour defaults to enabled so the rollout doesn't regress
 * when a flag hasn't been seeded yet.
 *
 * Flags:
 *   - flag_roles_v2                  — Self-learner feed redesign + sidebar topics.
 *   - flag_roles_v2_oauth_picker     — Google OAuth role picker at /signup/role.
 *   - flag_roles_v2_revert_window    — Settings RoleTile with 2-day revert flow.
 */

const FLAG_NAMES = {
  core: 'flag_roles_v2',
  oauthPicker: 'flag_roles_v2_oauth_picker',
  revertWindow: 'flag_roles_v2_revert_window',
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
          // Fail-open: treat unknown or missing flag as enabled.
          if (!data || typeof data.enabled !== 'boolean') return true
          return data.enabled
        })
        .catch(() => true),
    )
  }
  return cache.get(name)
}

export function clearRolesV2FlagCache() {
  cache.clear()
}

const DEFAULTS = { core: true, oauthPicker: true, revertWindow: true, loading: true }

export function useRolesV2Flags() {
  const [flags, setFlags] = useState(DEFAULTS)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchFlag(FLAG_NAMES.core),
      fetchFlag(FLAG_NAMES.oauthPicker),
      fetchFlag(FLAG_NAMES.revertWindow),
    ])
      .then(([core, oauthPicker, revertWindow]) => {
        if (cancelled) return
        setFlags({ core, oauthPicker, revertWindow, loading: false })
      })
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
