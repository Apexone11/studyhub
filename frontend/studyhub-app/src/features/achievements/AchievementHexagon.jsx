/**
 * AchievementHexagon.jsx — The hexagon-shaped badge container.
 *
 * Renders a clip-path hexagon with tier colour, an inner soft surface, and
 * the badge's icon glyph. Four states:
 *   - 'unlocked'        : full colour, opacity 1
 *   - 'locked-progress' : grayscale, dashed border (visible to owner)
 *   - 'locked-secret'   : dark frame with `?` glyph (secret badges)
 *   - 'recent'          : same as unlocked but with a 3s glow ring on mount
 *
 * Tier colours come from --sh-* tokens defined in index.css.
 */

import { useEffect, useRef, useState } from 'react'
import AchievementIcon from './AchievementIcon'
import {
  tierFrameStyle,
  tierSurfaceStyle,
  lockedFrameStyle,
  lockedSurfaceStyle,
} from './tierStyles'

/**
 * @param {{
 *   tier: string,
 *   iconSlug?: string|null,
 *   state?: 'unlocked'|'locked-progress'|'locked-secret'|'recent',
 *   size?: number,
 *   ariaLabel?: string,
 *   onClick?: () => void,
 * }} props
 */
export default function AchievementHexagon({
  tier,
  iconSlug,
  state = 'unlocked',
  size = 88,
  ariaLabel,
  onClick,
}) {
  const ref = useRef(null)
  const [glowing, setGlowing] = useState(state === 'recent')

  useEffect(() => {
    if (state !== 'recent') return
    const t = setTimeout(() => setGlowing(false), 3000)
    return () => clearTimeout(t)
  }, [state])

  const isLocked = state === 'locked-progress' || state === 'locked-secret'
  const frameStyle = isLocked
    ? lockedFrameStyle()
    : tierFrameStyle(state === 'locked-secret' ? 'secret' : tier)
  const surfaceStyle = isLocked
    ? lockedSurfaceStyle()
    : tierSurfaceStyle(state === 'locked-secret' ? 'secret' : tier)

  const iconSize = Math.round(size * 0.42)
  const isSecret = state === 'locked-secret'
  const interactive = Boolean(onClick)

  // Hexagon polygon (flat-top) — drawn in 100×100 units, scaled via width/height.
  // Outer hex is the frame; inner hex is the soft fill.
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel || 'Achievement badge'}
      onClick={onClick}
      tabIndex={interactive ? 0 : -1}
      style={{
        position: 'relative',
        width: size,
        height: size,
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: interactive ? 'pointer' : 'default',
        outline: 'none',
        // Glow ring on recent unlock — animated via inline keyframes below.
        boxShadow: glowing ? `0 0 0 0 var(--sh-${tier}-glow)` : 'none',
        animation: glowing ? 'sh-hex-glow 1.6s ease-out infinite' : 'none',
        opacity: state === 'locked-progress' ? 0.78 : 1,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Outer (frame) hex */}
        <polygon
          points="50,4 92,27 92,73 50,96 8,73 8,27"
          style={{
            ...frameStyle,
            // Diamond uses gradient via fill — fall back to fill prop.
            fill: tier === 'diamond' && !isLocked ? 'url(#sh-diamond)' : frameStyle.background,
            stroke: 'rgba(0,0,0,0.06)',
            strokeWidth: 1,
            strokeDasharray: state === 'locked-progress' ? '4 3' : 'none',
          }}
        />

        {/* Diamond gradient definition */}
        {tier === 'diamond' && !isLocked && (
          <defs>
            <linearGradient id="sh-diamond" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4a90e2" />
              <stop offset="50%" stopColor="#b75dff" />
              <stop offset="100%" stopColor="#ff6b9d" />
            </linearGradient>
          </defs>
        )}

        {/* Inner (soft) hex */}
        <polygon
          points="50,14 84,32 84,68 50,86 16,68 16,32"
          style={{
            fill: surfaceStyle.background,
          }}
        />
      </svg>

      {/* Icon centered on top of the SVG */}
      <span
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: surfaceStyle.color,
          pointerEvents: 'none',
        }}
      >
        {isSecret ? (
          <span
            style={{
              fontSize: Math.round(size * 0.36),
              fontWeight: 800,
              letterSpacing: '0.05em',
              color: 'var(--sh-secret-text)',
            }}
          >
            ?
          </span>
        ) : (
          <AchievementIcon slug={iconSlug} size={iconSize} />
        )}
      </span>

      {/* Local keyframes — scoped via inline <style> so we don't pollute global CSS. */}
      <style>{`
        @keyframes sh-hex-glow {
          0%   { box-shadow: 0 0 0 0 var(--sh-${tier}-glow); }
          70%  { box-shadow: 0 0 0 12px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes sh-hex-glow {
            0%, 100% { box-shadow: none; }
          }
        }
      `}</style>
    </button>
  )
}
