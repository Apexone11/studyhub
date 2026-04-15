/**
 * Recovery helper for role-change reload-to-apply (docs §8.6).
 * If a previous tab set the pending flag but didn't consume it (reload
 * interrupted), this runs once more on the next load and re-fires the
 * reload. Stale entries older than 15 seconds are cleared without reload
 * to avoid infinite loops if something goes wrong.
 */

const PENDING_RELOAD_KEY = 'pending_role_reload'
const STALE_MS = 15 * 1000

export function consumePendingRoleReload() {
  let raw
  try {
    raw = localStorage.getItem(PENDING_RELOAD_KEY)
  } catch {
    return
  }
  if (!raw) return

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    payload = null
  }
  try {
    localStorage.removeItem(PENDING_RELOAD_KEY)
  } catch {
    /* ignore */
  }
  const age = payload?.startedAt ? Date.now() - payload.startedAt : Infinity
  if (age > STALE_MS) return
  // Intentionally not calling reload here — the pending flag lifetime ends
  // at first mount after the actual reload. This helper just clears state.
}
