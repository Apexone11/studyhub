/* ═══════════════════════════════════════════════════════════════════════════
 * ProBadge.jsx — Displays a "PRO" badge next to usernames for Pro subscribers.
 *
 * Usage: <ProBadge plan={user.plan} size="sm" />
 *        Renders nothing if plan is 'free' or falsy.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react'

const SIZE_MAP = {
  xs: { fontSize: 9, padding: '1px 5px', borderRadius: 4 },
  sm: { fontSize: 10, padding: '2px 7px', borderRadius: 5 },
  md: { fontSize: 12, padding: '3px 9px', borderRadius: 6 },
}

export default function ProBadge({ plan, size = 'sm' }) {
  const [showTooltip, setShowTooltip] = useState(false)

  if (!plan || plan === 'free') return null

  const dims = SIZE_MAP[size] || SIZE_MAP.sm
  const label = plan === 'pro_yearly' ? 'PRO (Yearly)' : 'PRO'

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        style={{
          display: 'inline-block',
          fontSize: dims.fontSize,
          fontWeight: 800,
          padding: dims.padding,
          borderRadius: dims.borderRadius,
          background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
          color: '#fff',
          letterSpacing: '.06em',
          lineHeight: 1,
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
        aria-label={`${label} subscriber`}
        role="img"
      >
        PRO
      </span>
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
          {label} subscriber
        </span>
      )}
    </span>
  )
}
