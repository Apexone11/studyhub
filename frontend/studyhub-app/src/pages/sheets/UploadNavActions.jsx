/* ═══════════════════════════════════════════════════════════════════════════
 * UploadNavActions.jsx — Navbar action buttons for the upload sheet page
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link } from 'react-router-dom'
import { IconCheck, IconEye, IconUpload } from '../../components/Icons'
import { FONT } from './uploadSheetConstants'

export default function UploadNavActions({
  saved, legacyMarkdownMode, isHtmlMode, isEditing,
  loading, attachUploading, canSubmitHtml, scanTier,
  onSaveDraft, onOpenPreview, onSubmit,
}) {
  const submitDisabled = loading || attachUploading || (isHtmlMode && !canSubmitHtml)

  const submitLabel = loading
    ? 'Saving…'
    : legacyMarkdownMode
      ? (isEditing ? 'Save Changes' : 'Publish Sheet')
      : scanTier === 3
        ? 'Quarantined'
        : scanTier === 2
          ? 'Submit for Review'
          : scanTier === 1
            ? 'Publish with Warnings'
            : 'Publish'

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {saved ? (
        <span style={{ fontSize: 11, color: 'var(--sh-success)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <IconCheck size={12} /> Saved
        </span>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--sh-slate-500)' }}>{legacyMarkdownMode ? 'Draft autosave…' : 'Working draft sync…'}</span>
      )}
      <button
        type="button"
        onClick={onSaveDraft}
        style={{
          fontSize: 12, fontWeight: 700, color: 'var(--sh-success)',
          padding: '6px 12px', background: 'var(--sh-success-bg)', border: '1px solid var(--sh-success-border)',
          borderRadius: 8, cursor: 'pointer', fontFamily: FONT,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <IconCheck size={13} /> Save Draft
      </button>
      {isHtmlMode ? (
        <button
          type="button"
          onClick={onOpenPreview}
          style={{
            fontSize: 12, fontWeight: 700, color: 'var(--sh-warning)',
            padding: '6px 12px', background: 'var(--sh-warning-bg)', border: '1px solid var(--sh-warning-border)',
            borderRadius: 8, cursor: 'pointer', fontFamily: FONT,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <IconEye size={13} /> Preview
        </button>
      ) : null}
      <Link
        to="/sheets"
        style={{
          fontSize: 12, color: 'var(--sh-slate-500)', textDecoration: 'none',
          padding: '6px 10px', border: '1px solid var(--sh-slate-300)', borderRadius: 8,
        }}
      >
        Cancel
      </Link>
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitDisabled}
        style={{
          fontSize: 12, fontWeight: 700, color: '#fff',
          padding: '6px 14px', background: submitDisabled ? 'var(--sh-slate-300)' : 'var(--sh-brand)',
          border: 'none', borderRadius: 8,
          cursor: submitDisabled ? 'not-allowed' : 'pointer',
          fontFamily: FONT, display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <IconUpload size={13} />
        {submitLabel}
      </button>
    </div>
  )
}
