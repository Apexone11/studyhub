/**
 * AchievementCard.jsx — One badge tile in the gallery.
 *
 * Renders the hexagon, name, tier+xp meta, and optional pin/share buttons
 * for the owner. Click navigates to the detail page.
 */

import { Link } from 'react-router-dom'
import AchievementHexagon from './AchievementHexagon'
import { TIER_LABEL } from './tierStyles'

/**
 * @param {{
 *   badge: object,
 *   ownerView?: boolean,
 *   onPinToggle?: (slug: string, willPin: boolean) => void,
 *   compact?: boolean,
 * }} props
 */
export default function AchievementCard({
  badge,
  ownerView = false,
  onPinToggle,
  compact = false,
}) {
  const isUnlocked = badge.isUnlocked
  const isSecret = badge.isSecret && !isUnlocked
  const state = isSecret ? 'locked-secret' : isUnlocked ? 'unlocked' : 'locked-progress'

  const hexSize = compact ? 64 : 96

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: compact ? '8px 6px' : '14px 10px',
        background: 'var(--sh-panel-bg)',
        border: '1px solid var(--sh-panel-border)',
        borderRadius: 14,
        textAlign: 'center',
        position: 'relative',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      className="sh-achievement-card"
    >
      <Link
        to={isSecret ? '#' : `/achievements/${encodeURIComponent(badge.slug)}`}
        style={{
          textDecoration: 'none',
          color: 'inherit',
          cursor: isSecret ? 'default' : 'pointer',
        }}
        onClick={(e) => {
          if (isSecret) e.preventDefault()
        }}
      >
        <AchievementHexagon
          tier={badge.tier}
          iconSlug={badge.iconSlug}
          state={state}
          size={hexSize}
          ariaLabel={
            isSecret
              ? 'Secret achievement — locked'
              : `${badge.name}, ${TIER_LABEL[badge.tier] || 'Bronze'} tier`
          }
        />
      </Link>

      <div
        style={{
          fontWeight: 700,
          fontSize: compact ? 12 : 14,
          color: 'var(--sh-heading)',
          lineHeight: 1.2,
          marginTop: compact ? 2 : 4,
        }}
      >
        {isSecret ? 'Secret' : badge.name}
      </div>

      {!compact && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--sh-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontWeight: 600 }}>{TIER_LABEL[badge.tier] || 'Bronze'}</span>
          <span>·</span>
          <span>+{badge.xp || 0} XP</span>
        </div>
      )}

      {!compact && !isSecret && (
        <div
          style={{
            fontSize: 11,
            color: isUnlocked ? 'var(--sh-success-text)' : 'var(--sh-muted)',
            fontWeight: 600,
          }}
        >
          {isUnlocked ? 'Unlocked' : 'Locked'}
        </div>
      )}

      {ownerView && isUnlocked && onPinToggle && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onPinToggle(badge.slug, !badge.pinned)
          }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '3px 8px',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            border: '1px solid var(--sh-panel-border)',
            borderRadius: 999,
            background: badge.pinned ? 'var(--sh-brand-soft)' : 'transparent',
            color: badge.pinned ? 'var(--sh-brand)' : 'var(--sh-muted)',
            cursor: 'pointer',
          }}
          title={badge.pinned ? 'Unpin from profile' : 'Pin to profile'}
        >
          {badge.pinned ? 'Pinned' : 'Pin'}
        </button>
      )}
    </div>
  )
}
