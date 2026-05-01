/**
 * CreatorAuditConsentModal — first-time creator responsibility acknowledgement.
 *
 * Shown the first time a user attempts to publish content (sheet, note, etc.)
 * after the Creator Audit feature ships, and again whenever the doc version
 * changes. Backed by `useCreatorConsent()` which gates the publish action
 * until the modal returns `confirm`.
 *
 * Uses createPortal so it renders correctly inside transformed/animated
 * ancestors per CLAUDE.md "CSS and Styling".
 */
import { useEffect, useState } from 'react'
import FocusTrappedDialog from '../Modal/FocusTrappedDialog'

const RESPONSIBILITY_BULLETS = [
  {
    title: 'Original or properly credited',
    body: 'Material you publish is your own work, or you have permission and you cite the original creator and source.',
  },
  {
    title: 'Safe and accurate',
    body: 'Content does not include credentials, tracker scripts, malware, or personal contact info that doesn’t belong there. Misleading "answer key" claims are not allowed.',
  },
  {
    title: 'Respectful of others',
    body: 'No harassment, doxxing, hateful content, or material that targets a specific individual outside academic critique.',
  },
  {
    title: 'Auditable',
    body: 'StudyHub may run automated audits (HTML safety, asset origin, PII, accessibility, copyright signals) and surface a grade to you. Severe issues may pause publishing while a human reviews.',
  },
  {
    title: 'You can withdraw',
    body: 'You can revoke this acknowledgement in Settings. Doing so blocks new publishing until you re-accept; existing material is not deleted.',
  },
]

export default function CreatorAuditConsentModal({
  open,
  docVersion,
  onConfirm,
  onDismiss,
  loading = false,
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  /* eslint-disable react-hooks/set-state-in-effect --
   * Resetting transient submit/error state when the modal closes is
   * intentional — without it, reopening the modal would briefly show the
   * previous error or stuck spinner. There is no external system to sync
   * with here, so this is the simplest correct pattern. */
  useEffect(() => {
    if (!open) {
      setSubmitting(false)
      setError('')
    }
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Escape handling lives in FocusTrappedDialog (escapeDeactivates =
  // dismissable). The "while submitting OR error banner is up, user
  // must explicitly Cancel" rule is enforced by passing
  // escapeDeactivates={dismissable} below — keeping a second manual
  // listener here would fire onDismiss twice on Escape.

  if (!open) return null

  async function handleAccept() {
    setSubmitting(true)
    setError('')
    try {
      await onConfirm?.()
    } catch (err) {
      setError(err?.message || 'Could not record consent. Please try again.')
      setSubmitting(false)
    }
  }

  // Block accidental dismissal while an error banner is visible OR a
  // submission is in flight. The user might miss why the publish
  // action is still gated if the modal silently disappears after
  // they read "could not record consent" — force them to use the
  // Cancel button instead.
  const dismissable = !submitting && !error
  return (
    <FocusTrappedDialog
      open
      onClose={() => {
        if (dismissable) onDismiss?.()
      }}
      ariaLabelledBy="cac-title"
      escapeDeactivates={dismissable}
      clickOutsideDeactivates={dismissable}
      overlayStyle={{
        background: 'var(--sh-modal-overlay)',
        padding: '24px',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
      panelStyle={{
        width: 'min(640px, 100%)',
        maxWidth: 'min(640px, 100%)',
        maxHeight: 'calc(100vh - 48px)',
        overflowY: 'auto',
        padding: 0,
        gap: 0,
        borderRadius: 16,
        border: '1px solid var(--sh-border)',
        background: 'var(--sh-surface)',
        boxShadow: 'var(--shadow-lg)',
        color: 'var(--sh-text)',
        display: 'block',
      }}
    >
      <div style={{ display: 'contents' }}>
        {/* Header */}
        <div
          style={{
            padding: '24px 28px 12px',
            borderBottom: '1px solid var(--sh-border)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--sh-info-text)',
              background: 'var(--sh-info-bg)',
              padding: '4px 10px',
              borderRadius: 99,
              marginBottom: 12,
              textTransform: 'uppercase',
              letterSpacing: '.05em',
            }}
          >
            <i className="fas fa-file-signature" aria-hidden="true"></i>
            Creator responsibility
          </div>
          <h2
            id="cac-title"
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--sh-heading)',
              letterSpacing: '-0.01em',
            }}
          >
            Before you publish
          </h2>
          <p
            style={{
              marginTop: 8,
              marginBottom: 0,
              fontSize: 14,
              color: 'var(--sh-muted)',
              lineHeight: 1.55,
            }}
          >
            One quick acknowledgement so you and your classmates know what to expect from material
            on StudyHub. Takes 30 seconds.
          </p>
        </div>

        {/* Bullets */}
        <ul
          style={{
            padding: '20px 28px 8px',
            margin: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {RESPONSIBILITY_BULLETS.map((b, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                gap: 12,
                fontSize: 13,
                lineHeight: 1.55,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flex: '0 0 auto',
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  background: 'var(--sh-success-bg)',
                  color: 'var(--sh-success-text)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  marginTop: 1,
                }}
              >
                <i className="fas fa-check"></i>
              </span>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--sh-text)', marginBottom: 2 }}>
                  {b.title}
                </div>
                <div style={{ color: 'var(--sh-muted)' }}>{b.body}</div>
              </div>
            </li>
          ))}
        </ul>

        {/* Doc version footer */}
        <div
          style={{
            padding: '12px 28px',
            fontSize: 11,
            color: 'var(--sh-muted)',
            borderTop: '1px solid var(--sh-border)',
            background: 'var(--sh-soft)',
          }}
        >
          Acknowledging version <strong>{docVersion || 'pending'}</strong>. You can review and
          withdraw this acknowledgement anytime from Settings &rsaquo; Privacy.
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: '12px 28px',
              fontSize: 12,
              color: 'var(--sh-danger-text)',
              background: 'var(--sh-danger-bg)',
              borderTop: '1px solid var(--sh-border)',
            }}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            padding: '16px 28px 24px',
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={onDismiss}
            disabled={submitting}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              background: 'transparent',
              border: '1px solid var(--sh-border)',
              color: 'var(--sh-muted)',
              fontSize: 13,
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Not yet
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={submitting || loading || !docVersion}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              background: 'var(--sh-brand)',
              border: '1px solid var(--sh-brand)',
              color: 'var(--sh-on-brand, #ffffff)',
              fontSize: 13,
              fontWeight: 700,
              cursor: submitting || loading || !docVersion ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: submitting || loading || !docVersion ? 0.7 : 1,
            }}
          >
            {submitting ? 'Recording…' : 'I understand — continue'}
          </button>
        </div>
      </div>
    </FocusTrappedDialog>
  )
}
