/**
 * BadgeDisplay — Coin-shaped, sticker/3D-lite badges for user profiles.
 *
 * Props:
 *   badges: Array<{ slug, name, description, category, tier, unlockedAt }>
 */

const TIER_STYLES = {
  bronze: {
    background: 'linear-gradient(145deg, #d4a574, #b8860b)',
    border: '2px solid #c9923e',
    shadow: '0 3px 8px rgba(184,134,11,0.35), inset 0 1px 2px rgba(255,255,255,0.3)',
    text: '#5c3d0e',
  },
  silver: {
    background: 'linear-gradient(145deg, #e8e8e8, #a8a8a8)',
    border: '2px solid #c0c0c0',
    shadow: '0 3px 8px rgba(128,128,128,0.35), inset 0 1px 2px rgba(255,255,255,0.4)',
    text: '#3a3a3a',
  },
  gold: {
    background: 'linear-gradient(145deg, #ffd700, #daa520)',
    border: '2px solid #e6be1e',
    shadow: '0 3px 10px rgba(218,165,32,0.4), inset 0 1px 3px rgba(255,255,255,0.35)',
    text: '#5c4500',
  },
}

const CATEGORY_ICONS = {
  studying: 'fa-solid fa-book-open',
  building: 'fa-solid fa-hammer',
  collaboration: 'fa-solid fa-handshake',
}

export default function BadgeDisplay({ badges }) {
  if (!badges || badges.length === 0) return null

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'flex-start' }}>
        {badges.map((badge) => {
          const tier = TIER_STYLES[badge.tier] || TIER_STYLES.bronze
          const icon = CATEGORY_ICONS[badge.category] || 'fa-solid fa-award'
          return (
            <div
              key={badge.slug}
              title={`${badge.name} — ${badge.description}`}
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: tier.background,
                border: tier.border,
                boxShadow: tier.shadow,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'default',
                position: 'relative',
                transition: 'transform 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.12) translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
              }}
            >
              <i className={icon} style={{ fontSize: 18, color: tier.text, marginBottom: 2 }} />
              <span
                style={{
                  fontSize: 7,
                  fontWeight: 800,
                  color: tier.text,
                  textAlign: 'center',
                  lineHeight: 1.1,
                  padding: '0 4px',
                  maxWidth: 56,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                }}
              >
                {badge.name}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
