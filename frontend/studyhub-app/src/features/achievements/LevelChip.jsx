/**
 * LevelChip.jsx — "Lv. 5" badge displayed near a username.
 *
 * Color matches the user's highest-tier badge (so a Diamond holder gets a
 * rainbow gradient chip — instant social signal).
 */

import { tierFrameStyle } from './tierStyles'

/**
 * @param {{
 *   level: number,
 *   highestTier?: string,
 *   xp?: number|null,
 *   compact?: boolean,
 * }} props
 */
export default function LevelChip({ level, highestTier = 'bronze', xp = null, compact = false }) {
  if (!level || level < 1) return null
  const style = tierFrameStyle(highestTier)
  return (
    <span
      title={xp !== null ? `${xp} XP` : `Level ${level}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: compact ? '2px 8px' : '4px 10px',
        fontSize: compact ? 11 : 12,
        fontWeight: 800,
        borderRadius: 999,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        // Diamond gets the gradient via background-image; flat tiers use solid background.
        background: highestTier === 'diamond' ? 'var(--sh-diamond-grad)' : style.background,
        color: highestTier === 'diamond' ? 'var(--sh-on-dark)' : style.color,
        border: '1px solid rgba(0, 0, 0, 0.06)',
        whiteSpace: 'nowrap',
      }}
    >
      Lv. {level}
    </span>
  )
}
