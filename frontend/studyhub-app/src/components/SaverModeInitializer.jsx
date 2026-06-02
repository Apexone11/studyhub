/**
 * SaverModeInitializer — invisible mount-once component that activates
 * the Data Saver + Battery Saver hooks at the app root.
 *
 * Mounted from App.jsx inside the authenticated tree (the
 * preferences load only resolves once the user is signed in). The
 * hooks themselves are responsible for:
 *   - useBatterySaver: writes `data-battery-saver="on"` on <body>
 *     when active. CSS rules in index.css consume the attribute to
 *     disable animations / transitions / will-change.
 *   - useDataSaver: re-derives state on platform signal changes
 *     (e.g. cellular flip). Component-level consumers import the
 *     hook themselves; this initializer just keeps the global
 *     subscription alive so the localStorage cache and platform
 *     listener stay warm even if no page-level consumer mounts.
 *
 * No DOM output (returns null) — pure effect surface.
 */
import useDataSaver from '../lib/useDataSaver'
import useBatterySaver from '../lib/useBatterySaver'
import { useSession } from '../lib/session-context'

export default function SaverModeInitializer() {
  const { user } = useSession()
  const serverData = user?.preferences?.dataSaverMode
  const serverBattery = user?.preferences?.batterySaverMode

  useDataSaver({ serverMode: serverData })
  useBatterySaver({ serverMode: serverBattery })

  return null
}
