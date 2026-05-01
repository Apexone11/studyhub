/**
 * tierStyles.js — Maps tier name to inline `style` object using only
 * --sh-* tokens defined in index.css. Never returns hardcoded hex.
 *
 * Used by AchievementHexagon.jsx, LevelChip.jsx, and the gallery filter UI.
 */

export const TIER_LABEL = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
  secret: 'Secret',
}

export const TIER_RANK = {
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
  diamond: 5,
  secret: 6,
}

/**
 * Inline style for a tier-coloured frame. Diamond uses a gradient.
 */
export function tierFrameStyle(tier) {
  if (tier === 'diamond') {
    return {
      background: 'var(--sh-diamond-grad)',
      color: 'var(--sh-diamond-text)',
    }
  }
  return {
    background: `var(--sh-${tier})`,
    color: `var(--sh-${tier}-text)`,
  }
}

/**
 * Inline style for a tier-coloured soft surface (used as the inner of a hex).
 */
export function tierSurfaceStyle(tier) {
  if (tier === 'diamond') {
    return {
      background: 'var(--sh-diamond-bg)',
      color: 'var(--sh-diamond-text)',
    }
  }
  return {
    background: `var(--sh-${tier}-bg)`,
    color: `var(--sh-${tier}-text)`,
  }
}

/**
 * Inline style for the locked / grayscale state of a hexagon.
 */
export function lockedFrameStyle() {
  return {
    background: 'var(--sh-locked)',
    color: 'var(--sh-locked-text)',
  }
}

export function lockedSurfaceStyle() {
  return {
    background: 'var(--sh-locked-bg)',
    color: 'var(--sh-locked-text)',
  }
}

/**
 * The glow color used for a tier (used in CSS animation).
 */
export function tierGlowVar(tier) {
  return `var(--sh-${tier}-glow)`
}
