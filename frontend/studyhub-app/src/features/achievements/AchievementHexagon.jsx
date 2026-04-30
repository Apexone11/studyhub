/**
 * AchievementHexagon.jsx — The hexagon-shaped badge container.
 *
 * Renders a clip-path hexagon with tier colour, an inner soft surface, and
 * the badge's icon glyph. Four states:
 *   - 'unlocked'        : full colour, opacity 1
 *   - 'locked-progress' : grayscale, dashed border (visible to owner)
 *   - 'locked-secret'   : secret-tier frame with `?` glyph (secret badges)
 *   - 'recent'          : same as unlocked but with a 3s glow ring on mount
 *
 * Tier colours come from --sh-* tokens defined in index.css.
 *
 * Renders a non-interactive <div> by default. Pass `onClick` to opt into a
 * button. This prevents nested-interactive HTML when this component is
 * wrapped in a Link / button by callers (PinnedBadgesStrip, AchievementCard).
 */

import { useEffect, useId, useRef, useState } from 'react'
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
  // useId gives a stable per-instance suffix so each hexagon gets its own
  // @keyframes name. Without this the global keyframe `sh-hex-glow` was
  // overwritten by every later mount, breaking the per-tier glow color.
  const reactId = useId()
  const keyframeName = `sh-hex-glow-${reactId.replace(/:/g, '-')}`

  useEffect(() => {
    if (state !== 'recent') return
    const t = setTimeout(() => setGlowing(false), 3000)
    return () => clearTimeout(t)
  }, [state])

  // Only `locked-progress` uses grayscale. `locked-secret` keeps the
  // dedicated secret-tier palette so the badge looks intentional, not
  // dimmed.
  const isProgressLocked = state === 'locked-progress'
  const isSecretLocked = state === 'locked-secret'
  const frameStyle = isProgressLocked
    ? lockedFrameStyle()
    : tierFrameStyle(isSecretLocked ? 'secret' : tier)
  const surfaceStyle = isProgressLocked
    ? lockedSurfaceStyle()
    : tierSurfaceStyle(isSecretLocked ? 'secret' : tier)

  const iconSize = Math.round(size * 0.42)
  const interactive = typeof onClick === 'function'

  // Pick element + props based on whether the consumer asked for an
  // interactive hexagon. Default = non-interactive <div> so the hex
  // can safely live inside a <Link> or <button>.
  const Element = interactive ? 'button' : 'div'
  const interactiveProps = interactive
    ? { type: 'button', onClick, tabIndex: 0, role: 'button' }
    : { role: ariaLabel ? 'img' : 'presentation' }

  return (
    <Element
      ref={ref}
      aria-label={ariaLabel || (interactive ? 'Achievement badge' : undefined)}
      {...interactiveProps}
      style={{
        position: 'relative',
        display: 'inline-block',
        width: size,
        height: size,
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: interactive ? 'pointer' : 'default',
        outline: 'none',
        boxShadow: glowing ? `0 0 0 0 var(--sh-${tier}-glow)` : 'none',
        animation: glowing ? `${keyframeName} 1.6s ease-out infinite` : 'none',
        opacity: isProgressLocked ? 0.78 : 1,
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
            fill:
              tier === 'diamond' && !isProgressLocked && !isSecretLocked
                ? 'url(#sh-diamond)'
                : frameStyle.background,
            stroke: 'rgba(0,0,0,0.06)',
            strokeWidth: 1,
            strokeDasharray: isProgressLocked ? '4 3' : 'none',
          }}
        />

        {/* Diamond gradient definition */}
        {tier === 'diamond' && !isProgressLocked && !isSecretLocked && (
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
        {isSecretLocked ? (
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

      {/* Per-instance keyframes so multiple hexagons don't overwrite each
          other's glow color (useId-suffixed name). */}
      <style>{`
        @keyframes ${keyframeName} {
          0%   { box-shadow: 0 0 0 0 var(--sh-${tier}-glow); }
          70%  { box-shadow: 0 0 0 12px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes ${keyframeName} {
            0%, 100% { box-shadow: none; }
          }
        }
      `}</style>
    </Element>
  )
}
