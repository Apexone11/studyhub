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
 *   - Pro subscriber badge (gold crown)
 *   - Donor badge (green heart) with level-based colors
 *   - Combined badge when user is both Pro and donor
 *   - All colors use CSS custom property tokens for dark mode compliance
 *
 * Two prop forms are supported:
 *
 *   Explicit:
 *     <UserAvatar username="jane" avatarUrl="/uploads/avatar.jpg" size={40} />
 *
 *   Shortcut (pass a user/author object — username/avatarUrl/role/plan/isDonor/
 *   donorLevel are pulled out automatically):
 *     <UserAvatar user={comment.author} size={32} />
 *
 *   Explicit props always win when both are provided. The shortcut form
 *   exists because every comment surface (notes, sheets, study groups,
 *   feed) carries the user object from the API and was previously
 *   silently broken — passing user={...} when UserAvatar didn't accept
 *   it gave every comment the "?" initials fallback.
 */
import { useState } from 'react'
import { resolveImageUrl } from '../lib/imageUrls'

/**
 * Check if a plan string represents an active Pro subscription.
 */
function isPlan(plan) {
  return plan === 'pro_monthly' || plan === 'pro_yearly'
}

/**
 * Donor level badge colors (based on cumulative donation amount).
 */
const DONOR_COLORS = {
  bronze: '#cd7f32',
  silver: '#94a3b8',
  gold: '#f59e0b',
}

export default function UserAvatar({
  user,
  username,
  avatarUrl,
  role,
  plan,
  isDonor,
  donorLevel,
  size = 36,
  border,
  showStatus = false,
  online = false,
  style: extraStyle,
  className,
}) {
  // Resolve from the shortcut user object when explicit props are absent.
  // Explicit props always win — `username="override"` beats `user.username`.
  const resolvedUsername = username ?? user?.username
  const resolvedAvatarUrl = avatarUrl ?? user?.avatarUrl
  const resolvedRole = role ?? user?.role
  const resolvedPlan = plan ?? user?.plan
  const resolvedIsDonor = isDonor ?? user?.isDonor ?? false
  const resolvedDonorLevel = donorLevel ?? user?.donorLevel
  const [failedAvatarUrl, setFailedAvatarUrl] = useState(null)

  const initials = (resolvedUsername || '?').slice(0, 2).toUpperCase()
  const resolvedUrl = resolveImageUrl(resolvedAvatarUrl)
  const visibleAvatarUrl = resolvedUrl && resolvedUrl !== failedAvatarUrl ? resolvedUrl : null

  const isAdmin = resolvedRole === 'admin'
  const hasPro = isPlan(resolvedPlan)
  const hasDonor = resolvedIsDonor || Boolean(resolvedDonorLevel)
  const showBadge = hasPro || hasDonor

  // Badge size scales with avatar size (minimum 14px)
  const badgeSize = Math.max(14, Math.round(size * 0.38))

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        ...extraStyle,
      }}
    >
      {/* Main avatar circle */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: isAdmin ? 'var(--sh-brand)' : 'var(--sh-avatar-bg)',
          color: isAdmin ? 'var(--sh-surface)' : 'var(--sh-avatar-text)',
          display: 'grid',
          placeItems: 'center',
          fontSize: Math.round(size * 0.36),
          fontWeight: 800,
          overflow: 'hidden',
          border: border || 'none',
          lineHeight: 1,
        }}
      >
        {visibleAvatarUrl ? (
          <img
            src={visibleAvatarUrl}
            alt={resolvedUsername || ''}
            loading="lazy"
            onError={() => setFailedAvatarUrl(visibleAvatarUrl)}
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
      </div>

      {/* Pro / Donor badge overlay */}
      {showBadge && (
        <span
          aria-label={
            hasPro && hasDonor ? 'Pro Subscriber and Donor' : hasPro ? 'Pro Subscriber' : 'Donor'
          }
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: badgeSize,
            height: badgeSize,
            borderRadius: '50%',
            background: hasPro ? '#f59e0b' : DONOR_COLORS[donorLevel] || '#10b981',
            border: '2px solid var(--sh-surface)',
            display: 'grid',
            placeItems: 'center',
            boxSizing: 'border-box',
            zIndex: 1,
          }}
        >
          {hasPro ? (
            // Crown icon for Pro
            <svg
              width={badgeSize * 0.55}
              height={badgeSize * 0.55}
              viewBox="0 0 16 16"
              fill="#ffffff"
            >
              <path d="M2 12h12v1.5H2V12zM3 11l-1-7 3.5 3L8 3l2.5 4L14 4l-1 7H3z" />
            </svg>
          ) : (
            // Heart icon for Donor
            <svg
              width={badgeSize * 0.55}
              height={badgeSize * 0.55}
              viewBox="0 0 16 16"
              fill="#ffffff"
            >
              <path d="M8 14s-5.5-3.5-5.5-7.5C2.5 4 4 2.5 5.5 2.5c1 0 2 .5 2.5 1.5.5-1 1.5-1.5 2.5-1.5C12 2.5 13.5 4 13.5 6.5 13.5 10.5 8 14 8 14z" />
            </svg>
          )}
        </span>
      )}

      {/* Online status indicator (positioned top-right when badge is bottom-right) */}
      {showStatus && (
        <span
          aria-label={online ? 'Online' : 'Offline'}
          style={{
            position: 'absolute',
            top: showBadge ? -1 : 'auto',
            bottom: showBadge ? 'auto' : 0,
            right: 0,
            width: Math.max(8, Math.round(size * 0.22)),
            height: Math.max(8, Math.round(size * 0.22)),
            borderRadius: '50%',
            background: online ? 'var(--sh-success, #10b981)' : 'var(--sh-slate-400, #94a3b8)',
            border: '2px solid var(--sh-surface)',
            boxSizing: 'border-box',
            zIndex: 2,
          }}
        />
      )}
    </div>
  )
}
