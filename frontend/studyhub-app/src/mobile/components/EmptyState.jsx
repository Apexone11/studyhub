// src/mobile/components/EmptyState.jsx
// Empty-state primitive: illustration + title + description + optional CTA.

import MobileButton from './MobileButton'

export default function EmptyState({
  art,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <div className={`sh-m-empty ${className}`.trim()} role="status">
      {art && (
        <div className="sh-m-empty__art" aria-hidden="true">
          {art}
        </div>
      )}
      {title && <div className="sh-m-empty__title">{title}</div>}
      {description && <div className="sh-m-empty__desc">{description}</div>}
      {actionLabel && typeof onAction === 'function' && (
        <MobileButton onClick={onAction} size="m">
          {actionLabel}
        </MobileButton>
      )}
    </div>
  )
}
