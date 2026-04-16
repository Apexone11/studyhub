/**
 * Reusable anime.js v4 animation utilities for StudyHub.
 *
 * Design: Clean Academic Pro -- subtle, purposeful motion.
 * All helpers respect `prefers-reduced-motion`.
 *
 * anime.js is loaded dynamically on first animation call so it does not
 * contribute to the initial bundle size.
 */

/* ── Lazy anime.js loader ───────────────────────────────── */

let _anime = null

async function getAnime() {
  if (!_anime) {
    const mod = await import('animejs')
    _anime = mod.default || mod
  }
  return _anime
}

/* ── Reduced-motion gate ─────────────────────────────────── */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ── Sync fallback for reduced-motion ───────────────────── */

async function setImmediate(targets, props) {
  const { utils } = await getAnime()
  utils.set(targets, props)
}

/* ── Entrance helpers ────────────────────────────────────── */

/**
 * Fade targets upward into view.
 * @param {string|Element|NodeList} targets  CSS selector or elements
 * @param {{ delay?: number, duration?: number, y?: number }} opts
 */
export async function fadeInUp(targets, { delay = 0, duration = 500, y = 24 } = {}) {
  if (prefersReducedMotion()) {
    await setImmediate(targets, { opacity: 1, translateY: 0 })
    return null
  }
  const { animate } = await getAnime()
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
export async function staggerEntrance(targets, { staggerMs = 80, duration = 500, y = 20 } = {}) {
  if (prefersReducedMotion()) {
    await setImmediate(targets, { opacity: 1, translateY: 0 })
    return null
  }
  const { animate, stagger } = await getAnime()
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
export async function pulseHighlight(target) {
  if (prefersReducedMotion()) return null
  const { animate } = await getAnime()
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
export async function popScale(target) {
  if (prefersReducedMotion()) return null
  const { animate } = await getAnime()
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
export async function countUp(el, end, { duration = 800, prefix = '', suffix = '' } = {}) {
  if (!el) return null
  if (prefersReducedMotion()) {
    el.textContent = `${prefix}${end}${suffix}`
    return null
  }
  const { animate } = await getAnime()
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
 * @param {string|Element|NodeList} targets
 * @param {{ y?: number, duration?: number, staggerMs?: number }} opts
 */
export async function fadeInOnScroll(targets, { y = 24, duration = 500, staggerMs = 60 } = {}) {
  const { animate, utils } = await getAnime()

  if (prefersReducedMotion()) {
    utils.set(targets, { opacity: 1, translateY: 0 })
    return null
  }

  // Set initial hidden state
  utils.set(targets, { opacity: 0, translateY: y })

  // Use IntersectionObserver for scroll-triggered entrance
  const elements =
    typeof targets === 'string'
      ? document.querySelectorAll(targets)
      : targets instanceof Element
        ? [targets]
        : Array.from(targets || [])

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
    { threshold: 0.15 },
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
export async function slideDown(target, { duration = 400 } = {}) {
  if (!target) return null
  if (prefersReducedMotion()) {
    target.style.opacity = '1'
    return null
  }
  const { animate } = await getAnime()
  return animate(target, {
    opacity: [0, 1],
    translateY: [-16, 0],
    duration,
    ease: 'outExpo',
  })
}
