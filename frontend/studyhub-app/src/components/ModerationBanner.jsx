/**
 * ModerationBanner — shown to content owners when their content is under review
 * or has been removed by moderation. Read-only informational banner.
 */
import { WarningTriangleIcon, ShieldXIcon } from '../pages/admin/components/icons'

export default function ModerationBanner({ status }) {
  if (!status) return null

  let message = null
  let bg = null
  let border = null
  let color = null

  if (status === 'pending_review') {
    message = 'This content is under moderation review and is temporarily hidden from other users.'
    bg = 'var(--sh-warning-bg)'
    border = 'var(--sh-warning-border)'
    color = 'var(--sh-warning-text)'
  } else if (status === 'confirmed_violation' || status === 'removed_by_moderation') {
    message = 'This content has been removed by moderation. You can submit an appeal from your account settings.'
    bg = 'var(--sh-danger-bg)'
    border = 'var(--sh-danger-border)'
    color = 'var(--sh-danger-text)'
  } else {
    return null
  }

  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: 10,
      background: bg,
      border: `1px solid ${border}`,
      color,
      fontSize: 13,
      fontWeight: 600,
      marginBottom: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      {status === 'pending_review' ? <WarningTriangleIcon size={16} /> : <ShieldXIcon size={16} />}
      <span>{message}</span>
    </div>
  )
}
