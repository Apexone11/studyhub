/**
 * levelMath.js — Frontend mirror of backend's LEVEL_BRACKETS.
 *
 * If you change the brackets, mirror the change in:
 *   backend/src/modules/achievements/achievements.constants.js
 */

export const LEVEL_BRACKETS = [
  { level: 1, minXp: 0 },
  { level: 2, minXp: 100 },
  { level: 3, minXp: 300 },
  { level: 4, minXp: 700 },
  { level: 5, minXp: 1500 },
  { level: 6, minXp: 3000 },
  { level: 7, minXp: 5000 },
  { level: 8, minXp: 7500 },
  { level: 9, minXp: 10000 },
  { level: 10, minXp: 12500 },
]

export function levelForXp(xp) {
  let level = 1
  for (const bracket of LEVEL_BRACKETS) {
    if (xp >= bracket.minXp) level = bracket.level
    else break
  }
  return level
}

export function levelProgress(xp) {
  const currentLevel = levelForXp(xp)
  const currentBracket = LEVEL_BRACKETS.find((b) => b.level === currentLevel) || LEVEL_BRACKETS[0]
  const nextBracket = LEVEL_BRACKETS.find((b) => b.level === currentLevel + 1) || null
  const progressInLevel = nextBracket
    ? (xp - currentBracket.minXp) / (nextBracket.minXp - currentBracket.minXp)
    : 1
  return {
    currentLevel,
    currentLevelMinXp: currentBracket.minXp,
    nextLevel: nextBracket ? nextBracket.level : null,
    nextLevelMinXp: nextBracket ? nextBracket.minXp : null,
    fraction: Math.max(0, Math.min(1, progressInLevel)),
  }
}
