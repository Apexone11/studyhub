/**
 * deviceFeatureMatrix — central list of "this feature works best on
 * desktop" annotations.
 *
 * The matrix is intentionally a constant module rather than a hook
 * because the answer never depends on runtime state — a feature either
 * is or isn't well-served by a touch keyboard. Consumers (e.g.
 * `DesktopOnlyNoticeBanner`, `DesktopOnlyGate`, doc tooltips) read
 * these flags + copy without re-implementing the rules.
 *
 * Each entry:
 *   - `key`            stable id; used in localStorage namespaces and
 *                      analytics breadcrumbs.
 *   - `label`          short title shown to the user.
 *   - `recommendation` 'desktop' | 'tablet-or-desktop' | 'all'.
 *     'desktop'           = best on a laptop / desktop. Tablet works
 *                           in a pinch but is cramped.
 *     'tablet-or-desktop' = works on tablet, cramped or unusable on
 *                           phone.
 *     'all'               = works fine on every device class. Listed
 *                           here so consumers can confidently skip the
 *                           recommendation banner for these surfaces.
 *   - `reason`         single-sentence explanation, suitable for
 *                      inline rendering inside a banner or tooltip.
 *
 * Updating this matrix:
 *   - Adding a new entry: pick a stable kebab-case key, write a
 *     concrete one-sentence reason, run frontend lint. No need to
 *     ship a migration — this is client-side metadata only.
 *   - Removing an entry: search the codebase for the key first. The
 *     banner doesn't enumerate every key by id today, but future
 *     analytics or per-surface inline notices may.
 *
 * Loop M1 (2026-05-13).
 */

export const RECOMMENDATION_DESKTOP = 'desktop'
export const RECOMMENDATION_TABLET_OR_DESKTOP = 'tablet-or-desktop'
export const RECOMMENDATION_ALL = 'all'

export const DEVICE_FEATURE_MATRIX = Object.freeze([
  Object.freeze({
    key: 'sheet-lab-html-editor',
    label: 'SheetLab HTML editor',
    recommendation: RECOMMENDATION_DESKTOP,
    reason:
      'Typing HTML / CSS on a touch keyboard is slow, and the editor needs side-by-side panels.',
  }),
  Object.freeze({
    key: 'sheet-lab-diff-compare',
    label: 'SheetLab Diff Compare',
    recommendation: RECOMMENDATION_DESKTOP,
    reason: 'Side-by-side diff panels need a wide viewport to stay readable.',
  }),
  Object.freeze({
    key: 'admin-pages',
    label: 'Admin pages',
    recommendation: RECOMMENDATION_DESKTOP,
    reason:
      'Moderation and analytics tables are wide and assume a hardware keyboard for filtering.',
  }),
  Object.freeze({
    key: 'note-rich-text-editor',
    label: 'Note rich-text editor',
    recommendation: RECOMMENDATION_TABLET_OR_DESKTOP,
    reason: 'The formatting toolbar fits on tablet but is cramped on a phone-width screen.',
  }),
  Object.freeze({
    key: 'library-book-reader',
    label: 'Library book reader',
    recommendation: RECOMMENDATION_ALL,
    reason: 'The reader reflows for every screen size.',
  }),
  Object.freeze({
    key: 'ai-bubble',
    label: 'Hub AI bubble',
    recommendation: RECOMMENDATION_ALL,
    reason: 'The AI bubble is already mobile-aware and works on every device.',
  }),
])

/**
 * Lookup helper — returns the matrix entry for a given key, or null.
 * Mostly useful for inline notice components that want to show the
 * recommendation reason next to a specific surface.
 */
export function getDeviceFeatureEntry(key) {
  if (typeof key !== 'string' || !key) return null
  return DEVICE_FEATURE_MATRIX.find((entry) => entry.key === key) || null
}

/**
 * Returns true if the named feature is flagged as desktop-recommended
 * for a given device class. Tablet falls back to "works" for any
 * `tablet-or-desktop` feature; phone gets the strictest read.
 */
export function isFeatureRecommendedForDevice(key, deviceClass) {
  const entry = getDeviceFeatureEntry(key)
  if (!entry) return true
  if (entry.recommendation === RECOMMENDATION_ALL) return true
  if (deviceClass === 'desktop') return true
  if (deviceClass === 'tablet') {
    return entry.recommendation !== RECOMMENDATION_DESKTOP
  }
  // Phone: only 'all' features are unconditionally recommended.
  return entry.recommendation === RECOMMENDATION_ALL
}

/**
 * Returns the subset of the matrix that is NOT recommended for the
 * caller's device class. Useful for the banner copy when we want to
 * list the impacted surfaces without re-implementing the rule each
 * time.
 */
export function listImpactedFeatures(deviceClass) {
  if (deviceClass === 'desktop') return []
  return DEVICE_FEATURE_MATRIX.filter(
    (entry) => !isFeatureRecommendedForDevice(entry.key, deviceClass),
  )
}

export default DEVICE_FEATURE_MATRIX
