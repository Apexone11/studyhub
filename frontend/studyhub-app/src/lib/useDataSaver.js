/**
 * useDataSaver — React hook returning the effective data-saver state.
 *
 * Wave-12.11. Pairs with backend/src/lib/dataSaverNegotiation.js.
 *
 * Resolution order:
 *   1. User preference `UserPreferences.dataSaverMode` (loaded via
 *      session-context → preferences fetch). 'on' / 'off' wins.
 *   2. `auto` → honor `navigator.connection.saveData` when the
 *      Network Information API is available (Chrome, Edge, some
 *      Android browsers).
 *   3. Fallback when neither signal is available → false.
 *
 * Behaviors that should consume this hook (consumers wire themselves;
 * the hook is just a boolean source):
 *   - Skip autoplay on video posts.
 *   - Force loading="lazy" decoding="async" on all <img>.
 *   - Request the `?lite=1` variant of feed list endpoints.
 *   - Raise SWR cache TTLs.
 *   - Disable Hub AI SSE streaming.
 *   - Suppress non-critical Socket.io events.
 *
 * The hook returns `{ enabled, mode, source }`:
 *   - enabled: boolean — should the consumer trigger lighter behavior?
 *   - mode: 'on' | 'off' | 'auto' — the stored user preference.
 *   - source: 'user' | 'platform' | 'none' — why enabled is the value
 *     it is (useful for telemetry + the "Saved X MB" footer copy).
 */
import { useEffect, useState } from 'react'

const LOCAL_STORAGE_KEY = 'studyhub.prefs.dataSaver'

function readPlatformSignal() {
  if (typeof navigator === 'undefined') return false
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  return Boolean(connection && connection.saveData)
}

function readStoredMode() {
  if (typeof localStorage === 'undefined') return 'auto'
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (raw === 'on' || raw === 'off' || raw === 'auto') return raw
  } catch {
    /* private mode / quota */
  }
  return 'auto'
}

export function setStoredDataSaverMode(mode) {
  if (typeof localStorage === 'undefined') return
  try {
    if (mode === 'on' || mode === 'off' || mode === 'auto') {
      localStorage.setItem(LOCAL_STORAGE_KEY, mode)
    }
  } catch {
    /* ignore quota / private-mode */
  }
}

function deriveState(mode) {
  if (mode === 'on') return { enabled: true, mode, source: 'user' }
  if (mode === 'off') return { enabled: false, mode, source: 'user' }
  // auto
  const platform = readPlatformSignal()
  return { enabled: platform, mode: 'auto', source: platform ? 'platform' : 'none' }
}

export default function useDataSaver({ serverMode } = {}) {
  // Optimistic localStorage read so first paint can already gate
  // autoplay etc. The server preference (when it arrives via the
  // session context) overrides via the `serverMode` arg.
  const initialMode = serverMode || readStoredMode()
  const [state, setState] = useState(() => deriveState(initialMode))

  // Listen for platform connection changes (cellular flip,
  // user toggles Data Saver in OS settings).
  useEffect(() => {
    if (typeof navigator === 'undefined') return undefined
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (!connection || typeof connection.addEventListener !== 'function') return undefined
    const handler = () => {
      // Re-derive only if mode is auto — explicit on/off doesn't
      // care about platform changes.
      setState((current) => (current.mode === 'auto' ? deriveState('auto') : current))
    }
    connection.addEventListener('change', handler)
    return () => connection.removeEventListener('change', handler)
  }, [])

  // Re-derive when serverMode changes (e.g. user toggles in Settings).
  useEffect(() => {
    if (!serverMode) return
    setStoredDataSaverMode(serverMode)
    setState(deriveState(serverMode))
  }, [serverMode])

  return state
}
