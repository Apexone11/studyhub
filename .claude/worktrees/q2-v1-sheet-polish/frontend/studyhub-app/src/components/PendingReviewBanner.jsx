export default function PendingReviewBanner({ updated = false }) {
  return (
    <div
      style={{
        background: 'var(--sh-warning-bg, #fef3c7)',
        border: '1px solid var(--sh-warning-border, #fcd34d)',
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 13,
        color: 'var(--sh-warning-text, #92400e)',
        lineHeight: 1.5,
        marginBottom: 12,
      }}
    >
      <strong style={{ fontWeight: 600 }}>
        {updated ? 'Updated, still pending review' : 'Pending review'}
      </strong>
      {' \u2014 '}
      not visible to others yet. Your account is new; public content may require a brief review to keep StudyHub safe.
    </div>
  )
}
