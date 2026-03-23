/* ═══════════════════════════════════════════════════════════════════════════
 * UploadSheetFormFields.jsx — Form field components for the upload sheet page
 * ═══════════════════════════════════════════════════════════════════════════ */
import { IconEye, IconUpload } from '../../components/Icons'
import { FONT, MiniPreview, tierColor, tierLabel } from './uploadSheetConstants'

/* ── Info fields: title, course, downloads ─────────────────────────────── */
export function InfoFields({ title, setTitle, courseId, setCourseId, allowDownloads, setAllowDownloads, courses, error, setHasUnsavedChanges }) {
  return (
    <div data-tutorial="upload-info" style={{ background: 'var(--sh-surface)', borderRadius: 14, border: '1px solid var(--sh-border)', padding: '14px 20px', marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'end' }}>
      <div>
        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-slate-500)', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>SHEET TITLE</label>
        <input
          value={title}
          onChange={(event) => { setTitle(event.target.value); setHasUnsavedChanges(true) }}
          placeholder='e.g. "CMSC131 Final Exam Cheatsheet"'
          style={{ width: '100%', padding: '8px 12px', border: `1.5px solid ${error && !title.trim() ? 'var(--sh-danger-border)' : 'var(--sh-border)'}`, borderRadius: 8, fontSize: 13, fontFamily: FONT, outline: 'none', color: 'var(--sh-text)', boxSizing: 'border-box' }}
        />
      </div>

      <div>
        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-slate-500)', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>COURSE</label>
        <select
          value={courseId}
          onChange={(event) => { setCourseId(event.target.value); setHasUnsavedChanges(true) }}
          style={{ width: '100%', padding: '8px 12px', border: `1.5px solid ${error && !courseId ? 'var(--sh-danger-border)' : 'var(--sh-border)'}`, borderRadius: 8, fontSize: 13, fontFamily: FONT, outline: 'none', color: courseId ? 'var(--sh-text)' : 'var(--sh-muted)', boxSizing: 'border-box' }}
        >
          <option value="">Select a course…</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>{course.code} — {course.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-slate-500)', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>DOWNLOADS</label>
        <label style={{ padding: '8px 12px', border: '1.5px solid var(--sh-border)', borderRadius: 8, fontSize: 13, color: 'var(--sh-slate-500)', background: 'var(--sh-soft)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={allowDownloads} onChange={(event) => { setAllowDownloads(event.target.checked); setHasUnsavedChanges(true) }} />
          Allow downloads
        </label>
      </div>
    </div>
  )
}

/* ── Description field ────────────────────────────────────────────────── */
export function DescriptionField({ description, setDescription, setHasUnsavedChanges }) {
  return (
    <div data-tutorial="upload-content" style={{ background: 'var(--sh-surface)', borderRadius: 14, border: '1px solid var(--sh-border)', padding: '14px 20px', marginBottom: 12 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-slate-500)', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>
        DESCRIPTION <span style={{ fontSize: 9, color: 'var(--sh-muted)', textTransform: 'none', letterSpacing: 0 }}>(required for HTML review)</span>
      </label>
      <textarea
        value={description}
        onChange={(event) => { setDescription(event.target.value.slice(0, 300)); setHasUnsavedChanges(true) }}
        rows={2}
        maxLength={300}
        placeholder="Brief summary of what this sheet covers…"
        style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--sh-border)', borderRadius: 8, fontSize: 13, fontFamily: FONT, outline: 'none', color: 'var(--sh-text)', boxSizing: 'border-box', resize: 'none', lineHeight: 1.6 }}
      />
      <div style={{ fontSize: 10, color: 'var(--sh-muted)', textAlign: 'right', marginTop: 3 }}>{description.length}/300</div>
    </div>
  )
}

/* ── HTML import section ──────────────────────────────────────────────── */
export function HtmlImportSection({ isHtmlMode, htmlImportInputRef, handleHtmlImport, scanState, canEditHtml }) {
  if (!isHtmlMode) return null
  return (
    <div style={{ background: 'var(--sh-surface)', borderRadius: 14, border: '1px solid var(--sh-border)', padding: '14px 20px', marginBottom: 12 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-slate-500)', letterSpacing: '.06em', display: 'block', marginBottom: 8 }}>
        HTML IMPORT <span style={{ fontSize: 9, color: 'var(--sh-muted)', textTransform: 'none', letterSpacing: 0 }}>(optional — or type directly below)</span>
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input
          ref={htmlImportInputRef}
          type="file"
          accept=".html,.htm,text/html"
          style={{ display: 'none' }}
          onChange={handleHtmlImport}
        />
        <button
          type="button"
          onClick={() => htmlImportInputRef.current?.click()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--sh-soft)', border: '1.5px dashed var(--sh-slate-300)', borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--sh-slate-500)', cursor: 'pointer', fontFamily: FONT }}
        >
          <i className="fas fa-file-code" style={{ fontSize: 12 }}></i>
          Import HTML file
        </button>
        {scanState.originalSourceName ? (
          <span style={{ fontSize: 12, color: 'var(--sh-slate-700)', fontWeight: 600 }}>{scanState.originalSourceName}</span>
        ) : null}
        <span style={{ fontSize: 12, fontWeight: 700, color: tierColor(scanState.tier) }}>
          {tierLabel(scanState.tier)} {scanState.status === 'running' || scanState.status === 'queued' ? `(${scanState.status})` : ''}
        </span>
      </div>
      {canEditHtml ? null : (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--sh-warning)' }}>
          Import an HTML file to enable the editor. HTML sheets require a file import so we can run a security scan.
        </div>
      )}
    </div>
  )
}

/* ── Attachment picker ────────────────────────────────────────────────── */
export function AttachmentSection({
  attachmentInputRef, handleAttachmentSelect, attachFile, clearAttachFile,
  existingAttachment, removeExistingAttachment, setRemoveExistingAttachment,
  attachErr, setHasUnsavedChanges,
}) {
  return (
    <div data-tutorial="upload-attachment" style={{ background: 'var(--sh-surface)', borderRadius: 14, border: '1px solid var(--sh-border)', padding: '14px 20px', marginBottom: 12 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-slate-500)', letterSpacing: '.06em', display: 'block', marginBottom: 8 }}>
        OPTIONAL ATTACHMENT <span style={{ fontSize: 9, color: 'var(--sh-muted)', textTransform: 'none', letterSpacing: 0 }}>(PDF, PNG, JPEG, GIF, WebP — max 10 MB)</span>
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input ref={attachmentInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" style={{ display: 'none' }} onChange={handleAttachmentSelect} />
        <button
          type="button"
          onClick={() => attachmentInputRef.current?.click()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--sh-soft)', border: '1.5px dashed var(--sh-slate-300)', borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--sh-slate-500)', cursor: 'pointer', fontFamily: FONT }}
        >
          <i className="fas fa-paperclip" style={{ fontSize: 12 }}></i>
          {attachFile || (existingAttachment && !removeExistingAttachment) ? 'Change file' : 'Attach file'}
        </button>
        {/* Show newly selected file with remove option */}
        {attachFile ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--sh-success-bg)', border: '1px solid var(--sh-success-border)', borderRadius: 8, padding: '4px 10px' }}>
            <span style={{ fontSize: 12, color: 'var(--sh-success-text)', fontWeight: 600 }}>{attachFile.name}</span>
            <button
              type="button"
              onClick={clearAttachFile}
              style={{ border: 'none', background: 'none', color: 'var(--sh-danger)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: FONT, padding: '2px 4px' }}
              title="Remove selected file"
            >
              ✕
            </button>
          </div>
        ) : null}
        {/* Show existing (server-side) attachment with remove option */}
        {!attachFile && existingAttachment && !removeExistingAttachment ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--sh-info-bg)', border: '1px solid var(--sh-info-border)', borderRadius: 8, padding: '4px 10px' }}>
            <span style={{ fontSize: 12, color: 'var(--sh-info-text)', fontWeight: 600 }}>{existingAttachment.name}</span>
            <button
              type="button"
              onClick={() => { setRemoveExistingAttachment(true); setHasUnsavedChanges(true) }}
              style={{ border: 'none', background: 'none', color: 'var(--sh-danger)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: FONT, padding: '2px 4px' }}
              title="Remove attachment"
            >
              ✕
            </button>
          </div>
        ) : null}
        {/* Show "removed" indicator */}
        {removeExistingAttachment && !attachFile ? (
          <span style={{ fontSize: 11, color: 'var(--sh-muted)', fontStyle: 'italic' }}>Attachment will be removed on save</span>
        ) : null}
      </div>
      {attachErr ? <div style={{ marginTop: 6, fontSize: 12, color: 'var(--sh-danger)' }}>{attachErr}</div> : null}
    </div>
  )
}

/* ── Draft banner ─────────────────────────────────────────────────────── */
export function DraftBanner({ isEditing, draftId, status, title, discarding, setShowDiscardDialog }) {
  if (isEditing || !draftId || status !== 'draft') return null
  return (
    <div style={{
      background: 'var(--sh-warning-bg)',
      border: '1px solid var(--sh-warning-border)',
      borderRadius: 12,
      padding: '12px 16px',
      marginBottom: 12,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>📝</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-warning-text)' }}>Continuing your draft</div>
          <div style={{ fontSize: 11, color: 'var(--sh-warning)' }}>
            {title.trim() ? `"${title.trim()}"` : 'Untitled draft'} — auto-saved
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setShowDiscardDialog(true)}
        disabled={discarding}
        style={{
          padding: '6px 14px',
          background: 'var(--sh-surface)',
          border: '1px solid var(--sh-warning-border)',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--sh-warning-text)',
          cursor: 'pointer',
          fontFamily: FONT,
        }}
      >
        {discarding ? 'Discarding…' : 'Discard & Start New'}
      </button>
    </div>
  )
}

/* ── Status banner ────────────────────────────────────────────────────── */
export function StatusBanner({ status }) {
  if (!status || status === 'draft') return null
  return (
    <div style={{ background: status === 'rejected' ? 'var(--sh-danger-bg)' : 'var(--sh-info-bg)', border: `1px solid ${status === 'rejected' ? 'var(--sh-danger-border)' : 'var(--sh-info-border)'}`, borderRadius: 9, padding: '10px 14px', marginBottom: 10, fontSize: 13, color: status === 'rejected' ? 'var(--sh-danger-text)' : 'var(--sh-info-text)' }}>
      Status: <strong>{status.replace(/_/g, ' ')}</strong>
    </div>
  )
}

/* ── Error banner ─────────────────────────────────────────────────────── */
export function ErrorBanner({ error }) {
  if (!error) return null
  return (
    <div style={{ background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger-border)', borderRadius: 9, padding: '10px 14px', marginBottom: 10, fontSize: 13, color: 'var(--sh-danger)' }}>
      {error}
    </div>
  )
}

/* ── Editor split panel ───────────────────────────────────────────────── */
export function EditorPanel({ content, setContent, isHtmlMode, canEditHtml, setHasUnsavedChanges }) {
  return (
    <div style={{ background: 'var(--sh-surface)', borderRadius: 14, border: '1px solid var(--sh-border)', overflow: 'hidden' }}>
      <div className="upload-editor-split" style={{ borderBottom: '1px solid var(--sh-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRight: '1px solid var(--sh-border)' }}>
          <IconUpload size={13} style={{ color: 'var(--sh-brand)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sh-brand)' }}>{isHtmlMode ? 'HTML Working Editor' : 'Markdown Editor'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px' }}>
          <IconEye size={13} style={{ color: 'var(--sh-muted)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sh-muted)' }}>Live Preview</span>
        </div>
      </div>

      <div className="upload-editor-split" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 420 }}>
        <div style={{ borderRight: '1px solid #1e293b', background: '#0f172a' }}>
          <textarea
            value={content}
            onChange={(event) => { setContent(event.target.value); setHasUnsavedChanges(true) }}
            spellCheck={!isHtmlMode}
            disabled={isHtmlMode && !canEditHtml}
            placeholder={isHtmlMode && !canEditHtml ? 'Import HTML file to unlock editor...' : 'Start writing...'}
            style={{ width: '100%', height: '100%', minHeight: 420, background: 'transparent', border: 'none', outline: 'none', resize: 'none', padding: '16px 18px', fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12.5, lineHeight: 1.9, color: 'var(--sh-border)', boxSizing: 'border-box', opacity: isHtmlMode && !canEditHtml ? 0.6 : 1 }}
          />
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 600, background: 'var(--sh-surface)' }}>
          {isHtmlMode ? (
            <iframe
              title="html-inline-preview"
              sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-scripts"
              srcDoc={content}
              style={{ width: '100%', minHeight: 520, border: '1px solid var(--sh-border)', borderRadius: 10, background: '#fff' }}
            />
          ) : (
            <MiniPreview md={content} />
          )}
        </div>
      </div>
    </div>
  )
}
