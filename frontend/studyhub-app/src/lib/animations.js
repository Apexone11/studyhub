/**
 * Reusable anime.js v4 animation utilities for StudyHub.
 *
 * Design: Clean Academic Pro — subtle, purposeful motion.
 * All helpers respect `prefers-reduced-motion`.
 */

import { animate, stagger, onScroll, utils } from 'animejs'

/* ── Reduced-motion gate ─────────────────────────────────── */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ── Entrance helpers ────────────────────────────────────── */

/**
 * Fade targets upward into view.
 * @param {string|Element|NodeList} targets  CSS selector or elements
 * @param {{ delay?: number, duration?: number, y?: number }} opts
 */
export function fadeInUp(targets, { delay = 0, duration = 500, y = 24 } = {}) {
  if (prefersReducedMotion()) {
    utils.set(targets, { opacity: 1, translateY: 0 })
    return null
  }
  return animate(targets, {
    opacity: [0, 1],
    translateY: [y, 0],
    duration,
    delay,
    ease: 'outExpo',
  })
}

/**
 * Staggered fade-in-up for a list of elements (cards, rows, etc.).
 * @param {string|Element|NodeList} targets
 * @param {{ staggerMs?: number, duration?: number, y?: number }} opts
 */
export function staggerEntrance(targets, { staggerMs = 80, duration = 500, y = 20 } = {}) {
  if (prefersReducedMotion()) {
    utils.set(targets, { opacity: 1, translateY: 0 })
    return null
  }
  return animate(targets, {
    opacity: [0, 1],
    translateY: [y, 0],
    duration,
    delay: stagger(staggerMs),
    ease: 'outExpo',
  })
}

/**
 * Subtle scale-pulse to draw attention (e.g. a freshly added item).
 * @param {string|Element} target
 */
export function pulseHighlight(target) {
  if (prefersReducedMotion()) return null
  return animate(target, {
    scale: [1, 1.04, 1],
    duration: 400,
    ease: 'inOutQuad',
  })
}

/* ── Micro-interactions ──────────────────────────────────── */

/**
 * Quick scale pop for like/star buttons.
 * @param {string|Element} target
 */
export function popScale(target) {
  if (prefersReducedMotion()) return null
  return animate(target, {
    scale: [1, 1.25, 1],
    duration: 300,
    ease: 'outBack',
  })
}

/* ── Count-up (numeric stats) ────────────────────────────── */

/**
 * Animate a number from 0 to `end` inside an element's textContent.
 * @param {Element} el        Target DOM element
 * @param {number}  end       Final value
 * @param {{ duration?: number, prefix?: string, suffix?: string }} opts
 */
export function countUp(el, end, { duration = 800, prefix = '', suffix = '' } = {}) {
  if (!el) return null
  if (prefersReducedMotion()) {
    el.textContent = `${prefix}${end}${suffix}`
    return null
  }
  const obj = { val: 0 }
  return animate(obj, {
    val: end,
    duration,
    ease: 'outExpo',
    onUpdate: () => {
      el.textContent = `${prefix}${Math.round(obj.val)}${suffix}`
    },
  })
}

/* ── Scroll-triggered entrance ───────────────────────────── */

/**
 * Fade-in-up when the target scrolls into view (IntersectionObserver-based).
 * Uses anime.js `onScroll` for scroll-linked triggering.
 * Falls back to immediate show if anime.js onScroll is unavailable.
 * @param {string|Element|NodeList} targets
 * @param {{ y?: number, duration?: number, staggerMs?: number }} opts
 */
export function fadeInOnScroll(targets, { y = 24, duration = 500, staggerMs = 60 } = {}) {
  if (prefersReducedMotion()) {
    utils.set(targets, { opacity: 1, translateY: 0 })
    return null
  }

  // Set initial hidden state
  utils.set(targets, { opacity: 0, translateY: y })

  // Use IntersectionObserver for scroll-triggered entrance (simpler and more reliable)
  const elements = typeof targets === 'string'
    ? document.querySelectorAll(targets)
    : targets instanceof Element ? [targets] : Array.from(targets || [])

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          animate(entry.target, {
            opacity: [0, 1],
            translateY: [y, 0],
            duration,
            delay: i * staggerMs,
            ease: 'outExpo',
          })
          observer.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.15 }
  )

  elements.forEach((el) => observer.observe(el))
  return observer
}

/* ── Slide-down for new content ──────────────────────────── */

/**
 * Slide an element down from collapsed height (for new feed posts, etc.).
 * @param {Element} target
 * @param {{ duration?: number }} opts
 */
export function slideDown(target, { duration = 400 } = {}) {
  if (!target) return null
  if (prefersReducedMotion()) {
    target.style.opacity = '1'
    return null
  }
  return animate(target, {
    opacity: [0, 1],
    translateY: [-16, 0],
    duration,
    ease: 'outExpo',
  })
}
