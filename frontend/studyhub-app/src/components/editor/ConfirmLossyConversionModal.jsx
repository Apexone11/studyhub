/**
 * ConfirmLossyConversionModal — warns the user before a destructive
 * HTML → Rich Text mode switch.
 *
 * Rendered via createPortal(document.body) because the SheetLab tab
 * container sits inside an anime.js animated element with a CSS
 * transform — position: fixed would otherwise be captured by the
 * transform and mis-center the modal.
 *
 * Props:
 *   open       — boolean, controls visibility
 *   report     — { strippedTags: string[], strippedAttributes: string[] }
 *   onConfirm  — user accepts the destructive conversion
 *   onCancel   — user bails out and stays in HTML/Code mode
 */
import FocusTrappedDialog from '../Modal/FocusTrappedDialog'

export default function ConfirmLossyConversionModal({ open, report, onConfirm, onCancel }) {
  if (!report) return null

  const hasTags = report.strippedTags.length > 0
  const hasAttrs = report.strippedAttributes.length > 0

  return (
    <FocusTrappedDialog
      open={open}
      onClose={onCancel}
      ariaLabelledBy="lossy-modal-title"
      overlayStyle={overlayStyle}
      panelStyle={dialogStyle}
    >
      <div style={{ display: 'contents' }}>
        <h2 id="lossy-modal-title" style={titleStyle}>
          Switching to Rich Text will strip some HTML
        </h2>
        <p style={bodyStyle}>
          Rich Text mode uses a visual editor that cannot represent every HTML construct. You can
          always switch back to HTML/Code later, but the stripped content will not come back
          automatically.
        </p>

        {hasTags ? (
          <div style={sectionStyle}>
            <div style={sectionLabelStyle}>Tags that will be removed</div>
            <div style={codeListStyle}>
              {report.strippedTags.map((tag) => (
                <code key={tag} style={codeChipStyle}>{`<${tag}>`}</code>
              ))}
            </div>
          </div>
        ) : null}

        {hasAttrs ? (
          <div style={sectionStyle}>
            <div style={sectionLabelStyle}>Attributes that will be removed</div>
            <div style={codeListStyle}>
              {report.strippedAttributes.map((attr) => (
                <code key={attr} style={codeChipStyle}>
                  {attr}
                </code>
              ))}
            </div>
          </div>
        ) : null}

        <div style={actionsStyle}>
          <button type="button" onClick={onCancel} style={cancelBtnStyle}>
            Stay on HTML/Code
          </button>
          <button type="button" onClick={onConfirm} style={confirmBtnStyle}>
            Convert anyway
          </button>
        </div>
      </div>
    </FocusTrappedDialog>
  )
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
  padding: 16,
}

const dialogStyle = {
  background: 'var(--sh-surface)',
  color: 'var(--sh-heading)',
  borderRadius: 14,
  border: '1px solid var(--sh-border)',
  padding: '20px 22px',
  maxWidth: 560,
  width: '100%',
  maxHeight: '80vh',
  overflowY: 'auto',
  boxShadow: '0 20px 50px rgba(15, 23, 42, 0.3)',
}

const titleStyle = {
  margin: '0 0 10px',
  fontSize: 17,
  fontWeight: 800,
  color: 'var(--sh-heading)',
}

const bodyStyle = {
  margin: '0 0 16px',
  fontSize: 13,
  lineHeight: 1.6,
  color: 'var(--sh-text)',
}

const sectionStyle = {
  marginBottom: 14,
}

const sectionLabelStyle = {
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--sh-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  marginBottom: 6,
}

const codeListStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}

const codeChipStyle = {
  padding: '3px 8px',
  borderRadius: 6,
  background: 'var(--sh-soft)',
  border: '1px solid var(--sh-border)',
  color: 'var(--sh-heading)',
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 11,
}

const actionsStyle = {
  display: 'flex',
  gap: 10,
  justifyContent: 'flex-end',
  marginTop: 18,
}

const cancelBtnStyle = {
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)',
  color: 'var(--sh-heading)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

const confirmBtnStyle = {
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px solid var(--sh-danger-border)',
  background: 'var(--sh-danger-bg)',
  color: 'var(--sh-danger-text)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}
