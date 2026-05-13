/**
 * useDeviceClass — classify the current browser visitor as phone, tablet,
 * or desktop and expose the viewport metrics + touch signal that drive
 * responsive decisions higher in the tree.
 *
 * Why a dedicated hook (vs. the existing `useResponsiveAppLayout` in
 * `lib/ui.js`):
 *   - `useResponsiveAppLayout` only looks at `window.innerWidth`. That
 *     is the right signal for "what layout columns should I render?"
 *     but it is the wrong signal for "is this person on a touch device
 *     that lacks a hardware keyboard?" A 1024px-wide Chrome window on
 *     a laptop and a 1024px iPad in landscape need the same column
 *     count, but only the iPad user should see the desktop-only
 *     feature banner. Keeping the two hooks separate lets each answer
 *     the question it is good at.
 *
 * Detection rules (decision sticks to the task spec — do NOT widen
 * without an explicit founder note; every false-positive promotes the
 * "feature works best on desktop" banner to a paying user):
 *   - `phone`:   userAgent matches /Mobi|Android|iPhone|iPod/i AND
 *                viewport width <= 768.
 *   - `tablet`:  userAgent matches /iPad|Android(?!.*Mobile)|Tablet/i
 *                OR (isTouch AND viewport in [600, 1180]).
 *   - `desktop`: everything else (this is the default — keyboard +
 *                mouse + wide viewport).
 *
 * `isTouch` is `('ontouchstart' in window) || navigator.maxTouchPoints
 * > 0`. That catches detachable laptops in touch mode AND modern iPad
 * Safari, which since iPadOS 13 reports a Macintosh-style UA string;
 * the "isTouch AND viewport 600-1180" branch is what actually
 * classifies those iPads.
 *
 * Lazy initialiser — no setState-in-effect, no flash of wrong state on
 * first paint. Resize + orientationchange listeners keep the snapshot
 * fresh through rotation, zoom, and dev-tools docking. SSR-safe:
 * returns desktop defaults when `window` is undefined.
 *
 * Backward-compatibility surface:
 *   - `useDeviceClass()` now returns the rich object documented above.
 *   - The legacy string-returning form (used by the old DesktopOnlyGate
 *     stub) is exposed as `useDeviceClassString()` so any historical
 *     consumer that depended on the bare string can opt in.
 *   - `DEVICE_CLASS_PHONE` / `_TABLET` / `_DESKTOP` and
 *     `resolveDeviceClass(width)` are preserved for callers that only
 *     need the viewport-width bucket.
 *
 * Loop M1 (2026-05-13). Replaces the Loop M2 stub.
 */
import { useEffect, useState } from 'react'

export const DEVICE_CLASS_PHONE = 'phone'
export const DEVICE_CLASS_TABLET = 'tablet'
export const DEVICE_CLASS_DESKTOP = 'desktop'

// UA regexes — kept in sync with the task spec verbatim. Do not relax.
const PHONE_UA = /Mobi|Android|iPhone|iPod/i
// `Android(?!.*Mobile)` — Android tablets historically drop the
// "Mobile" token from the UA. The negative lookahead keeps Android
// phones out of the tablet bucket.
const TABLET_UA = /iPad|Android(?!.*Mobile)|Tablet/i

const PHONE_VIEWPORT_MAX = 768
const TABLET_VIEWPORT_MIN = 600
const TABLET_VIEWPORT_MAX = 1180

// Viewport-only bucket boundaries kept for `resolveDeviceClass(width)`
// so callers that already use the legacy width-only API (Loop M2 stub)
// keep working without churn.
const LEGACY_PHONE_MAX = 767
const LEGACY_TABLET_MAX = 1179

/**
 * Width-only classifier kept for backward compatibility with the Loop
 * M2 stub. Prefer the full `useDeviceClass()` for new code.
 */
export function resolveDeviceClass(width) {
  const safeWidth = Number.isFinite(width) ? width : 1440
  if (safeWidth <= LEGACY_PHONE_MAX) return DEVICE_CLASS_PHONE
  if (safeWidth <= LEGACY_TABLET_MAX) return DEVICE_CLASS_TABLET
  return DEVICE_CLASS_DESKTOP
}

function safeUserAgent() {
  if (typeof navigator === 'undefined') return ''
  return typeof navigator.userAgent === 'string' ? navigator.userAgent : ''
}

function detectIsTouch() {
  if (typeof window === 'undefined') return false
  try {
    if ('ontouchstart' in window) return true
    if (typeof navigator !== 'undefined') {
      const max = Number(navigator.maxTouchPoints)
      if (Number.isFinite(max) && max > 0) return true
    }
  } catch {
    /* hostile environment — fall through to false */
  }
  return false
}

/**
 * Classify a device given its UA, viewport width, and touch capability.
 * Pure function so unit tests can exercise the rules without rendering.
 */
export function classifyDevice(userAgent, viewportWidth, isTouch) {
  // Phone gate is conjunctive (UA + narrow viewport) so a desktop user
  // who has Chrome devtools resized below 768px does NOT get tagged as
  // a phone — the UA stays a desktop UA. This matches the task spec.
  if (PHONE_UA.test(userAgent) && viewportWidth <= PHONE_VIEWPORT_MAX) {
    return DEVICE_CLASS_PHONE
  }
  if (TABLET_UA.test(userAgent)) return DEVICE_CLASS_TABLET
  if (isTouch && viewportWidth >= TABLET_VIEWPORT_MIN && viewportWidth <= TABLET_VIEWPORT_MAX) {
    return DEVICE_CLASS_TABLET
  }
  return DEVICE_CLASS_DESKTOP
}

function readSnapshot() {
  if (typeof window === 'undefined') {
    // SSR default — assume desktop. The client-side re-render runs the
    // real detection so there is no flash of banner on hydration for
    // genuine desktop users.
    return {
      deviceClass: DEVICE_CLASS_DESKTOP,
      isTouch: false,
      viewportWidth: 1440,
      viewportHeight: 900,
      isLandscape: true,
      userAgent: '',
    }
  }
  const viewportWidth = Number(window.innerWidth) || 0
  const viewportHeight = Number(window.innerHeight) || 0
  const isTouch = detectIsTouch()
  const userAgent = safeUserAgent()
  const deviceClass = classifyDevice(userAgent, viewportWidth, isTouch)
  return {
    deviceClass,
    isTouch,
    viewportWidth,
    viewportHeight,
    isLandscape: viewportWidth >= viewportHeight,
    userAgent,
  }
}

/**
 * React hook — returns the live device-class snapshot. Re-renders on
 * resize / orientationchange so consumers stay in sync with the user
 * rotating their tablet or docking a laptop into a monitor.
 *
 * @returns {{
 *   deviceClass: 'phone' | 'tablet' | 'desktop',
 *   isTouch: boolean,
 *   viewportWidth: number,
 *   viewportHeight: number,
 *   isLandscape: boolean,
 *   userAgent: string,
 * }}
 */
export function useDeviceClass() {
  const [snapshot, setSnapshot] = useState(readSnapshot)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    function recompute() {
      setSnapshot(readSnapshot())
    }

    window.addEventListener('resize', recompute)
    // `orientationchange` is technically deprecated, but iOS Safari
    // still emits it earlier than the matching `resize` on rotation;
    // listening to both keeps the banner from lagging the rotation
    // gesture by ~250ms.
    window.addEventListener('orientationchange', recompute)
    return () => {
      window.removeEventListener('resize', recompute)
      window.removeEventListener('orientationchange', recompute)
    }
  }, [])

  return snapshot
}

/**
 * Legacy string-returning hook kept for any historical caller that
 * expected `useDeviceClass()` to return a plain `'phone' | 'tablet' |
 * 'desktop'` string. New code should use `useDeviceClass()` and
 * destructure `.deviceClass`.
 */
export function useDeviceClassString() {
  return useDeviceClass().deviceClass
}

export { PHONE_UA, TABLET_UA, PHONE_VIEWPORT_MAX, TABLET_VIEWPORT_MIN, TABLET_VIEWPORT_MAX }

export default useDeviceClass
