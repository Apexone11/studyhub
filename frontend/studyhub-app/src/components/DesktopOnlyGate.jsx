/**
 * DesktopOnlyGate — wraps a UI surface that genuinely cannot work on
 * a phone-sized screen (sub-768px viewport). On phones it renders an
 * informational notice instead of the gated children; on tablet and
 * desktop it renders the children unchanged.
 *
 * Usage:
 *   <DesktopOnlyGate
 *     title="The HTML editor needs more room than your phone has."
 *     description="Switch to a laptop, or open the read-only preview instead."
 *     fallbackActionLabel="Open preview anyway"
 *     onFallbackAction={() => setReadOnly(true)}
 *   >
 *     <HtmlEditor />
 *   </DesktopOnlyGate>
 *
 *   <DesktopOnlyGate
 *     title="The admin panel is built for a laptop screen."
 *     description="Switch devices to access these tools, or contact another admin if it's urgent."
 *     gateTablets={false}
 *   >
 *     <AdminPanel />
 *   </DesktopOnlyGate>
 *
 * Defaults to gating BOTH phone and tablet. Pass `gateTablets={false}`
 * to gate phones only (matches the admin-panel rule from Loop M2:
 * tablets work, phones don't).
 *
 * Depends on `useDeviceClass` from `lib/useDeviceClass.js`, which since
 * Loop M1 returns a rich `{ deviceClass, isTouch, viewportWidth, ... }`
 * snapshot instead of a bare string. We destructure `.deviceClass`
 * here; if you are reading this in a future loop, do NOT regress to
 * comparing the hook's return value directly to a string.
 */
import { DEVICE_CLASS_PHONE, DEVICE_CLASS_TABLET, useDeviceClass } from '../lib/useDeviceClass'

export default function DesktopOnlyGate({
  title,
  description,
  fallbackActionLabel,
  onFallbackAction,
  gateTablets = true,
  children,
}) {
  const { deviceClass } = useDeviceClass()
  const isPhone = deviceClass === DEVICE_CLASS_PHONE
  const isTablet = deviceClass === DEVICE_CLASS_TABLET
  const blocked = isPhone || (gateTablets && isTablet)

  if (!blocked) return children

  return (
    <section role="region" aria-label="Desktop-only feature" style={containerStyle}>
      <div style={iconBadgeStyle} aria-hidden="true">
        {/* SVG-free monogram avoids pulling Icons.jsx; respects reduced-motion
            by virtue of being static. */}
        <span style={iconGlyphStyle}>—</span>
      </div>
      <h2 style={titleStyle}>{title}</h2>
      <p style={descriptionStyle}>{description}</p>
      {fallbackActionLabel && typeof onFallbackAction === 'function' ? (
        <button type="button" onClick={onFallbackAction} style={fallbackButtonStyle}>
          {fallbackActionLabel}
        </button>
      ) : null}
    </section>
  )
}

const containerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
  textAlign: 'center',
  padding: '36px 22px',
  borderRadius: 18,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)',
  color: 'var(--sh-text)',
  maxWidth: 520,
  margin: '24px auto',
}

const iconBadgeStyle = {
  width: 56,
  height: 56,
  borderRadius: 16,
  background: 'var(--sh-soft)',
  border: '1px solid var(--sh-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--sh-muted)',
}

const iconGlyphStyle = {
  fontSize: 22,
  fontWeight: 700,
  lineHeight: 1,
  letterSpacing: '0.05em',
}

const titleStyle = {
  fontSize: 18,
  fontWeight: 700,
  margin: 0,
  color: 'var(--sh-heading)',
  lineHeight: 1.3,
}

const descriptionStyle = {
  fontSize: 14,
  lineHeight: 1.55,
  color: 'var(--sh-muted)',
  margin: 0,
}

const fallbackButtonStyle = {
  marginTop: 6,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-soft)',
  color: 'var(--sh-heading)',
  borderRadius: 10,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 36,
}
