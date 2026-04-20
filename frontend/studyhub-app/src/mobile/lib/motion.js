// src/mobile/lib/motion.js
// Mobile Design Refresh v3 motion helpers.
// See docs/internal/mobile-design-refresh-v3-spec.md §3.3

import anime from './animeCompat'

// ── Duration + easing constants (mirror CSS tokens) ────────────────

export const DUR = {
  instant: 120,
  quick: 200,
  base: 320,
  slow: 520,
  epic: 1200,
}

export const EASE = {
  outQuart: [0.25, 1, 0.5, 1],
  inQuart: [0.76, 0, 0.74, 0],
  spring: [0.34, 1.56, 0.64, 1],
  smooth: [0.4, 0, 0.2, 1],
}

// ── Reduced motion sentinel ────────────────────────────────────────

export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false
  if (document.body.classList.contains('sh-mobile-reduced-motion')) return true
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ── Core helpers ───────────────────────────────────────────────────

/**
 * Page enter transition: fade + slide-in.
 * direction: 'forward' | 'back'
 */
export function pageEnter(el, direction = 'forward') {
  if (!el) return null
  if (prefersReducedMotion()) {
    return anime({
      targets: el,
      opacity: [0, 1],
      duration: DUR.quick,
      easing: 'easeOutQuart',
    })
  }
  const fromX = direction === 'back' ? -24 : 24
  return anime({
    targets: el,
    opacity: [0, 1],
    translateX: [fromX, 0],
    duration: DUR.base,
    easing: 'easeOutQuart',
  })
}

/**
 * Page exit transition: fade + slide-out.
 */
export function pageExit(el, direction = 'forward') {
  if (!el) return null
  if (prefersReducedMotion()) {
    return anime({
      targets: el,
      opacity: [1, 0],
      duration: DUR.quick,
      easing: 'easeInQuart',
    })
  }
  const toX = direction === 'back' ? 24 : -24
  return anime({
    targets: el,
    opacity: [1, 0],
    translateX: [0, toX],
    duration: DUR.base,
    easing: 'easeInQuart',
  })
}

/**
 * Staggered fade-in-up on a group of elements.
 * cards: NodeList | Array of elements
 * gapMs: delay between each element, default 40ms
 */
export function staggerFeed(cards, gapMs = 40) {
  if (!cards || (cards.length !== undefined && cards.length === 0)) return null
  if (prefersReducedMotion()) {
    return anime({
      targets: cards,
      opacity: [0, 1],
      duration: DUR.quick,
      delay: anime.stagger(10),
      easing: 'easeOutQuart',
    })
  }
  return anime({
    targets: cards,
    opacity: [0, 1],
    translateY: [16, 0],
    duration: DUR.base,
    delay: anime.stagger(gapMs),
    easing: 'easeOutQuart',
  })
}

/**
 * Spring-press feedback on tap.
 * Call on pointer-down with `released=false`, then again with `released=true`
 * on pointer-up/leave/cancel.
 */
export function springPress(el, released = true) {
  if (!el) return null
  if (prefersReducedMotion()) return null
  return anime({
    targets: el,
    scale: released ? 1 : 0.97,
    duration: DUR.instant,
    easing: released ? 'easeOutQuart' : 'easeInQuart',
  })
}

/**
 * Number count-up animation.
 * onUpdate receives the current integer value.
 */
export function countUp(from, to, duration = 900, onUpdate) {
  if (typeof onUpdate !== 'function') return null
  if (prefersReducedMotion()) {
    onUpdate(to)
    return null
  }
  const state = { v: from }
  return anime({
    targets: state,
    v: to,
    duration,
    easing: 'easeOutQuart',
    round: 1,
    update: () => onUpdate(Math.round(state.v)),
  })
}

/**
 * Orb pulse — continuous scale + brightness loop for Hub AI thinking state.
 */
export function orbPulse(el) {
  if (!el) return null
  if (prefersReducedMotion()) return null
  return anime({
    targets: el,
    scale: [1, 1.04, 1],
    duration: 2400,
    easing: 'easeInOutSine',
    loop: true,
  })
}

/**
 * DOM-particle confetti burst.
 * container: parent element to spawn particles in (usually a fixed overlay)
 * origin: {x, y} in px relative to container
 * count: number of particles (default 30, auto-reduced on low-end)
 */
export function confettiBurst(container, origin, count = 30) {
  if (!container || prefersReducedMotion()) return null
  const hw = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4
  const n = hw < 4 ? Math.min(10, count) : count
  const palette = ['#2563eb', '#7c3aed', '#f59e0b', '#ec4899', '#10b981']

  const nodes = []
  for (let i = 0; i < n; i += 1) {
    const p = document.createElement('span')
    p.setAttribute('aria-hidden', 'true')
    p.style.cssText = [
      'position:absolute',
      'width:8px',
      'height:14px',
      'border-radius:2px',
      `left:${origin.x}px`,
      `top:${origin.y}px`,
      `background:${palette[i % palette.length]}`,
      'pointer-events:none',
      'will-change:transform,opacity',
    ].join(';')
    container.appendChild(p)
    nodes.push(p)
  }

  const angle = () => (Math.random() - 0.5) * Math.PI // spread left/right
  const speed = () => 120 + Math.random() * 180

  const instances = nodes.map((p) => {
    const a = angle() - Math.PI / 2 // upward bias
    const v = speed()
    const dx = Math.cos(a) * v
    const dy = Math.sin(a) * v
    return anime({
      targets: p,
      translateX: [0, dx],
      translateY: [0, dy + 240], // gravity pulls back down
      rotate: [0, (Math.random() - 0.5) * 720],
      opacity: [1, 0],
      duration: 1200 + Math.random() * 400,
      easing: 'easeOutQuart',
      complete: () => {
        if (p.parentNode) p.parentNode.removeChild(p)
      },
    })
  })

  return instances
}

/**
 * SVG stroke-draw animation. el should be an <svg> or a single <path>.
 * The compat shim doesn't expose v3's anime.setDashoffset, so we compute
 * lengths ourselves and animate strokeDashoffset explicitly per element.
 */
export function strokeDraw(el, duration = 600) {
  if (!el) return null
  const paths = Array.from(
    el.tagName && el.tagName.toLowerCase() === 'path'
      ? [el]
      : el.querySelectorAll('path, line, polyline, circle, rect'),
  )
  if (paths.length === 0) return null

  // Prime dasharray/dashoffset for each path based on its own length.
  paths.forEach((p) => {
    const len = typeof p.getTotalLength === 'function' ? p.getTotalLength() : 1000
    p.style.strokeDasharray = String(len)
    p.style.strokeDashoffset = String(len)
  })

  if (prefersReducedMotion()) {
    paths.forEach((p) => {
      p.style.strokeDashoffset = '0'
    })
    return null
  }

  return anime({
    targets: paths,
    strokeDashoffset: 0,
    duration,
    easing: 'easeOutQuart',
  })
}

export default {
  DUR,
  EASE,
  prefersReducedMotion,
  pageEnter,
  pageExit,
  staggerFeed,
  springPress,
  countUp,
  orbPulse,
  confettiBurst,
  strokeDraw,
}
