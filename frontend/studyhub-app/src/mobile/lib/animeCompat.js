// src/mobile/lib/animeCompat.js
// Compatibility adapter for anime.js v4.
// The mobile files were written against the v3 API (anime(), anime.timeline(),
// anime.stagger()). anime.js v4 renamed these to animate(), createTimeline(),
// and stagger(). This module re-exports a v3-shaped "anime" function so the
// mobile pages work without rewriting every call site.
//
// v3 -> v4 mapping:
//   anime({...})               -> animate({...})
//   anime.timeline({...})      -> createTimeline({...})
//   anime.stagger(val, opts)   -> stagger(val, opts)
//
// Easing names also changed: "easeOutCubic" -> "outCubic", etc.
// We normalize these in the adapter.

import { animate, createTimeline, stagger } from 'animejs'

/** Map v3 easing names to v4 equivalents */
function normalizeEasing(e) {
  if (!e || typeof e !== 'string') return e
  // v4 dropped the "ease" prefix: "easeOutCubic" -> "outCubic"
  if (e.startsWith('ease')) {
    return e.charAt(4).toLowerCase() + e.slice(5)
  }
  return e
}

/** Rewrite a v3 options object to v4 */
function adaptOpts(opts) {
  if (!opts) return opts
  const out = { ...opts }

  // Easing: v3 "easeOutCubic" -> v4 "outCubic"
  if (out.easing) {
    out.ease = normalizeEasing(out.easing)
    delete out.easing
  }

  // Callbacks: v3 used "complete", "begin", "update"
  // v4 uses "onComplete", "onBegin", "onUpdate"
  if (out.complete && !out.onComplete) {
    out.onComplete = out.complete
    delete out.complete
  }
  if (out.begin && !out.onBegin) {
    out.onBegin = out.begin
    delete out.begin
  }
  if (out.update && !out.onUpdate) {
    out.onUpdate = out.update
    delete out.update
  }

  // v3 loop: true -> v4 loop: true (same, but verify boolean)
  // v3 direction: 'alternate' -> v4 alternate: true
  if (out.direction === 'alternate') {
    out.alternate = true
    delete out.direction
  }

  return out
}

/**
 * Drop-in replacement for anime.js v3's `anime(opts)`.
 * Calls v4's `animate(targets, props)`.
 */
function anime(opts) {
  const { targets, ...rest } = adaptOpts(opts)
  return animate(targets, rest)
}

/**
 * anime.timeline(defaults) -> createTimeline(defaults)
 * Returns an object with an .add() method that also adapts options.
 */
anime.timeline = function timelineCompat(defaults) {
  const tl = createTimeline({ defaults: adaptOpts(defaults) })

  // v3 timeline.add() signature: add(opts, offset)
  // v4 createTimeline returns a chainable that works differently.
  // We wrap it to translate the v3 call pattern.
  const originalAdd = tl.add.bind(tl)

  tl.add = function addCompat(opts, offset) {
    const { targets, ...rest } = adaptOpts(opts)
    const adapted = { ...rest }
    if (offset !== undefined) {
      // v3 offset strings like '-=300' are time offsets
      adapted.offset = offset
    }
    return originalAdd(targets, adapted)
  }

  return tl
}

/** anime.stagger(val, opts) -> stagger(val, opts) */
anime.stagger = function staggerCompat(val, opts) {
  return stagger(val, opts)
}

export default anime
