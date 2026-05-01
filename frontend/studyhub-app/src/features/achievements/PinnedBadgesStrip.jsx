/**
 * PinnedBadgesStrip.jsx — Compact horizontal strip of up to 6 pinned badges.
 *
 * Rendered on the profile Overview tab (own + other). Click takes the viewer
 * to the achievement detail page.
 */

import { Link } from 'react-router-dom'
import AchievementHexagon from './AchievementHexagon'
import { TIER_LABEL } from './tierStyles'

/**
 * @param {{
 *   items: object[],
 *   loading?: boolean,
 *   ownerView?: boolean,
 *   emptyHint?: string,
 * }} props
 */
export default function PinnedBadgesStrip({
  items,
  loading = false,
  ownerView = false,
  emptyHint,
}) {
  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 10 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              width: 56,
              height: 64,
              background: 'var(--sh-panel-border)',
              borderRadius: 10,
              opacity: 0.5,
            }}
          />
        ))}
      </div>
    )
  }

  if (!items || items.length === 0) {
    if (!ownerView) return null
    return (
      <div
        style={{
          padding: '10px 14px',
          fontSize: 12,
          color: 'var(--sh-muted)',
          background: 'var(--sh-panel-bg)',
          border: '1px dashed var(--sh-panel-border)',
          borderRadius: 10,
          maxWidth: 480,
        }}
      >
        {emptyHint || 'Pin up to 6 achievements to feature them on your profile.'}
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
      }}
      aria-label="Pinned achievements"
    >
      {items.map((badge) => (
        <Link
          key={badge.slug}
          to={`/achievements/${encodeURIComponent(badge.slug)}`}
          style={{ textDecoration: 'none', color: 'inherit' }}
          title={`${badge.name} — ${TIER_LABEL[badge.tier] || 'Bronze'} · +${badge.xp || 0} XP`}
        >
          <AchievementHexagon
            tier={badge.tier}
            iconSlug={badge.iconSlug}
            state="unlocked"
            size={56}
            ariaLabel={`${badge.name}, ${TIER_LABEL[badge.tier] || 'Bronze'} tier`}
          />
        </Link>
      ))}
    </div>
  )
}
