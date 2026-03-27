import { useState } from 'react'
import { IconShieldCheck, IconMailCheck } from './Icons'
import { getVerificationType } from './verificationUtils'

const BADGE_CONFIG = {
  staff: {
    icon: IconShieldCheck,
    color: 'var(--sh-brand)',
    tooltip: 'Verified by StudyHub',
    label: 'Staff verified',
  },
  email: {
    icon: IconMailCheck,
    color: 'var(--sh-success)',
    tooltip: 'Email verified',
    label: 'Email verified',
  },
}

/**
 * Displays a verification badge next to a username.
 * @param {{ user: object, size?: number }} props
 */
export default function VerificationBadge({ user, size = 14 }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const type = getVerificationType(user)
  if (!type) return null

  const config = BADGE_CONFIG[type]
  const Icon = config.icon

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'default' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      aria-label={config.label}
      role="img"
    >
      <Icon size={size} style={{ color: config.color, flexShrink: 0 }} />
      {showTooltip && (
        <span
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 6,
            padding: '4px 10px',
            borderRadius: 6,
            background: 'var(--sh-heading)',
            color: 'var(--sh-surface)',
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 50,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          {config.tooltip}
        </span>
      )}
    </span>
  )
}
