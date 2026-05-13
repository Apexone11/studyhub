/* ═══════════════════════════════════════════════════════════════════════════
 * SlowNetworkNotice.jsx — One-time toast when a slow connection is detected
 *
 * Hooks the `useSlowNetwork` reactive boolean and fires a single toast
 * notification per session when the user transitions onto a 2g/slow-2g
 * link or has data-saver mode on. The notice tells the user what we're
 * doing for them (suppressing video autoplay) so they don't think videos
 * are broken — they're throttled on purpose.
 *
 * Mounted once globally in App.jsx alongside ToastContainer. Renders no
 * DOM of its own; it's a side-effect component that lives in the React
 * tree purely for lifecycle correctness.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from 'react'
import { useSlowNetwork } from '../lib/networkStatus'
import { showToast } from '../lib/toast'

export default function SlowNetworkNotice() {
  const slow = useSlowNetwork()
  // Only fire the toast once per session — repeated slow/fast oscillation
  // (tunnels, elevators) would otherwise spam the user.
  const firedRef = useRef(false)

  useEffect(() => {
    if (!slow) return
    if (firedRef.current) return
    firedRef.current = true
    showToast('Slow connection detected — videos will not autoplay.', 'info', 5000)
  }, [slow])

  return null
}
