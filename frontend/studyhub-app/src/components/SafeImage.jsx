/**
 * SafeImage — Resilient `<img>` wrapper for the entire app.
 *
 * Centralizes the mobile-image-optimization rules from loop M18 in one
 * place so every list / card / gallery picks them up automatically.
 *
 * What this wrapper does that a bare <img> does not:
 *
 *   1. onError fallback — when the network image fails to load, the
 *      element swaps to either a render-prop fallback (`fallback`),
 *      a built-in tap-to-retry placeholder (when `retryable` is true),
 *      or hides itself instead of leaving the browser's broken-image
 *      icon in place. This stops the "torn ticket" visual that has
 *      shown up on slow / flaky mobile data.
 *
 *   2. `loading` + `decoding` defaults — every consumer gets `lazy` +
 *      `async` unless they explicitly opt out (e.g. above-the-fold
 *      hero images that pass `priority` should set `loading="eager"`
 *      and `fetchPriority="high"`).
 *
 *   3. `priority` prop — sugar for the first N items in a list. When
 *      true: eager + high fetch priority + sync decode so the LCP
 *      candidate isn't deferred. When false (default): lazy + async.
 *      Pattern: `priority={index < 3}` on feed / gallery lists.
 *
 *   4. `width` + `height` attributes — required to reserve layout
 *      space and prevent CLS. Callers MUST pass them when known;
 *      when unknown (intrinsic sizing) the layout is still locked
 *      via the parent's CSS, but adding the attrs lets the browser
 *      compute the box before the network fetch lands.
 *
 *   5. `<picture>` element — when callers pass a `webpSrc`, the
 *      element renders as `<picture><source type="image/webp">
 *      <img ...></picture>` so WebP-capable browsers download the
 *      smaller variant. Otherwise it's a flat `<img>`.
 *
 *   6. `srcSet` + `sizes` pass-through — when the backend ever serves
 *      derived variants, callers can opt in by passing both. Until
 *      then, the single-resolution `src` is the only thing the
 *      browser fetches and bandwidth on phones is dominated by
 *      whatever the upload pipeline produced. See the M18 audit doc
 *      for the storage-side gap.
 *
 * This component is intentionally dumb — no state besides the
 * one-shot error swap, no portals, no global side effects. It is safe
 * to drop into any tree, including server-rendered surfaces.
 */
import { useState } from 'react'

/**
 * Track the previous `src` / `webpSrc` pair via a state token and reset
 * failure state synchronously during render when the URL changes. This
 * matches the React docs' "Adjusting state during rendering" recipe
 * (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
 * and avoids both `react-hooks/set-state-in-effect` and
 * `react-hooks/refs` (which forbids touching `ref.current` during
 * render).
 *
 * Returns `[failed, setFailed, retryKey, setRetryKey]`.
 */
function useResettableFailureState(src, webpSrc) {
  const [failed, setFailed] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [trackedKey, setTrackedKey] = useState(`${src}|${webpSrc || ''}`)
  const nextKey = `${src}|${webpSrc || ''}`
  if (trackedKey !== nextKey) {
    // setState during render is the React-blessed pattern for derived
    // state — React reconciles the new state on the same commit pass
    // without an extra effect.
    setTrackedKey(nextKey)
    if (failed) setFailed(false)
    if (retryKey !== 0) setRetryKey(0)
  }
  return [failed, setFailed, retryKey, setRetryKey]
}

/**
 * Decide whether to render a `<picture>` element. We only do so when a
 * `webpSrc` was passed AND it differs from the default `src` — otherwise
 * the wrapping `<picture>` is pure overhead.
 */
function shouldUsePicture(webpSrc, src) {
  return Boolean(webpSrc) && webpSrc !== src
}

export default function SafeImage({
  src,
  alt = '',
  width,
  height,
  webpSrc,
  srcSet,
  sizes,
  priority = false,
  loading,
  decoding,
  fetchPriority,
  fallback = null,
  retryable = false,
  retryLabel = 'Image failed to load. Tap to retry.',
  onError,
  onLoad,
  style,
  className,
  draggable,
  referrerPolicy,
  ...rest
}) {
  // One-shot error gate + tap-to-retry cache buster. Both reset
  // automatically when `src` / `webpSrc` change via the render-time
  // reset helper above — a parent swapping the URL (e.g. user updates
  // avatar) deserves a fresh attempt at the new URL.
  const [failed, setFailed, retryKey, setRetryKey] = useResettableFailureState(src, webpSrc)

  // No URL → render the caller's fallback (or nothing).
  if (!src) {
    return fallback || null
  }

  // Failure path. When `retryable` is on we render a tappable placeholder
  // with a retry icon; otherwise we keep the legacy behaviour (caller's
  // fallback or nothing) for existing call sites that haven't opted in.
  if (failed) {
    if (!retryable) return fallback || null
    return (
      <button
        type="button"
        onClick={() => {
          setFailed(false)
          setRetryKey((k) => k + 1)
        }}
        aria-label={retryLabel}
        className={className}
        style={{
          width,
          height,
          background: 'var(--sh-slate-100, #f1f5f9)',
          border: '1px solid var(--sh-border, #e2e8f0)',
          color: 'var(--sh-slate-500, #64748b)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          ...style,
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
          <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
        </svg>
      </button>
    )
  }

  // Effective loading attrs. `priority` is sugar for the first-N items
  // in a list — those need to start fetching before scroll catches up.
  const effectiveLoading = loading || (priority ? 'eager' : 'lazy')
  const effectiveDecoding = decoding || (priority ? 'sync' : 'async')
  const effectiveFetchPriority = fetchPriority || (priority ? 'high' : undefined)

  const handleError = (event) => {
    setFailed(true)
    if (typeof onError === 'function') {
      try {
        onError(event)
      } catch {
        /* don't let consumer crash break the fallback render */
      }
    }
  }

  // Apply the retry cache-buster only after a manual retry — the first
  // attempt uses the canonical URL so HTTP / browser cache hits still work.
  const effectiveSrc = retryKey === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}_r=${retryKey}`

  const imgEl = (
    <img
      src={effectiveSrc}
      alt={alt}
      width={width}
      height={height}
      loading={effectiveLoading}
      decoding={effectiveDecoding}
      fetchPriority={effectiveFetchPriority}
      srcSet={srcSet}
      sizes={sizes}
      onError={handleError}
      onLoad={onLoad}
      style={style}
      className={className}
      draggable={draggable}
      referrerPolicy={referrerPolicy}
      {...rest}
    />
  )

  if (shouldUsePicture(webpSrc, src)) {
    // `<picture>` wraps `<source>` for capability detection. WebP-capable
    // browsers pick the source; everyone else falls through to `<img>`.
    // The img element is the actual one the browser renders; styling /
    // layout flows through to the wrapping `<picture>` only as a CSS
    // selector, never as a layout box (it's `display: contents` by
    // default in modern engines).
    return (
      <picture>
        <source type="image/webp" srcSet={webpSrc} sizes={sizes} />
        {imgEl}
      </picture>
    )
  }

  return imgEl
}
