/**
 * UserAvatar — Unified avatar component for the entire StudyHub app.
 *
 * Replaces 15+ ad-hoc avatar implementations with one consistent component.
 *
 * Features:
 *   - Configurable size via prop (default 36px)
 *   - Automatic URL resolution (relative → absolute via API base)
 *   - Graceful fallback to 2-letter initials on image error or missing URL
 *   - Role-aware styling (admin gets brand color)
 *   - Optional online status indicator
 *   - Optional border for profile-context usage
 *   - All colors use CSS custom property tokens for dark mode compliance
 *
 * Usage:
 *   <UserAvatar username="jane" avatarUrl="/uploads/avatar.jpg" size={40} />
 *   <UserAvatar username="admin_user" role="admin" size={32} showStatus online />
 */
import { useState } from 'react'
import { API } from '../config'

export default function UserAvatar({
  username,
  avatarUrl,
  role,
  size = 36,
  border,
  showStatus = false,
  online = false,
  style: extraStyle,
  className,
}) {
  const [imgError, setImgError] = useState(false)

  const initials = (username || '?').slice(0, 2).toUpperCase()

  const resolvedUrl = avatarUrl && !imgError
    ? (avatarUrl.startsWith('http') ? avatarUrl : `${API}${avatarUrl}`)
    : null

  const isAdmin = role === 'admin'

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        background: isAdmin ? 'var(--sh-brand)' : 'var(--sh-avatar-bg)',
        color: isAdmin ? 'var(--sh-surface)' : 'var(--sh-avatar-text)',
        display: 'grid',
        placeItems: 'center',
        fontSize: Math.round(size * 0.36),
        fontWeight: 800,
        flexShrink: 0,
        overflow: 'hidden',
        border: border || 'none',
        lineHeight: 1,
        ...extraStyle,
      }}
    >
      {resolvedUrl ? (
        <img
          src={resolvedUrl}
          alt={username || ''}
          loading="lazy"
          onError={() => setImgError(true)}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}

      {showStatus && (
        <span
          aria-label={online ? 'Online' : 'Offline'}
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: Math.max(8, Math.round(size * 0.22)),
            height: Math.max(8, Math.round(size * 0.22)),
            borderRadius: '50%',
            background: online ? 'var(--sh-success, #10b981)' : 'var(--sh-slate-400, #94a3b8)',
            border: '2px solid var(--sh-surface)',
            boxSizing: 'border-box',
          }}
        />
      )}
    </div>
  )
}
