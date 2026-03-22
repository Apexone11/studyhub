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
        <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>SHEET TITLE</label>
        <input
          value={title}
          onChange={(event) => { setTitle(event.target.value); setHasUnsavedChanges(true) }}
          placeholder='e.g. "CMSC131 Final Exam Cheatsheet"'
          style={{ width: '100%', padding: '8px 12px', border: `1.5px solid ${error && !title.trim() ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 8, fontSize: 13, fontFamily: FONT, outline: 'none', color: '#0f172a', boxSizing: 'border-box' }}
        />
      </div>

      <div>
        <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>COURSE</label>
        <select
          value={courseId}
          onChange={(event) => { setCourseId(event.target.value); setHasUnsavedChanges(true) }}
          style={{ width: '100%', padding: '8px 12px', border: `1.5px solid ${error && !courseId ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 8, fontSize: 13, fontFamily: FONT, outline: 'none', color: courseId ? '#0f172a' : '#94a3b8', boxSizing: 'border-box' }}
        >
          <option value="">Select a course…</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>{course.code} — {course.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>DOWNLOADS</label>
        <label style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#64748b', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
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
      <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>
        DESCRIPTION <span style={{ fontSize: 9, color: '#94a3b8', textTransform: 'none', letterSpacing: 0 }}>(required for HTML review)</span>
      </label>
      <textarea
        value={description}
        onChange={(event) => { setDescription(event.target.value.slice(0, 300)); setHasUnsavedChanges(true) }}
        rows={2}
        maxLength={300}
        placeholder="Brief summary of what this sheet covers…"
        style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: FONT, outline: 'none', color: '#0f172a', boxSizing: 'border-box', resize: 'none', lineHeight: 1.6 }}
      />
      <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'right', marginTop: 3 }}>{description.length}/300</div>
    </div>
  )
}

/* ── HTML import section ──────────────────────────────────────────────── */
export function HtmlImportSection({ isHtmlMode, htmlImportInputRef, handleHtmlImport, scanState, canEditHtml }) {
  if (!isHtmlMode) return null
  return (
    <div style={{ background: 'var(--sh-surface)', borderRadius: 14, border: '1px solid var(--sh-border)', padding: '14px 20px', marginBottom: 12 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '.06em', display: 'block', marginBottom: 8 }}>
        HTML IMPORT <span style={{ fontSize: 9, color: '#94a3b8', textTransform: 'none', letterSpacing: 0 }}>(optional — or type directly below)</span>
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
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#64748b', cursor: 'pointer', fontFamily: FONT }}
        >
          <i className="fas fa-file-code" style={{ fontSize: 12 }}></i>
          Import HTML file
        </button>
        {scanState.originalSourceName ? (
          <span style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>{scanState.originalSourceName}</span>
        ) : null}
        <span style={{ fontSize: 12, fontWeight: 700, color: tierColor(scanState.tier) }}>
          {tierLabel(scanState.tier)} {scanState.status === 'running' || scanState.status === 'queued' ? `(${scanState.status})` : ''}
        </span>
      </div>
      {canEditHtml ? null : (
        <div style={{ marginTop: 8, fontSize: 12, color: '#b45309' }}>
          Import HTML first. Direct posting is disabled in strict beta workflow.
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
      <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '.06em', display: 'block', marginBottom: 8 }}>
        OPTIONAL ATTACHMENT <span style={{ fontSize: 9, color: '#94a3b8', textTransform: 'none', letterSpacing: 0 }}>(PDF, PNG, JPEG, GIF, WebP — max 10 MB)</span>
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input ref={attachmentInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" style={{ display: 'none' }} onChange={handleAttachmentSelect} />
        <button
          type="button"
          onClick={() => attachmentInputRef.current?.click()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#64748b', cursor: 'pointer', fontFamily: FONT }}
        >
          <i className="fas fa-paperclip" style={{ fontSize: 12 }}></i>
          {attachFile || (existingAttachment && !removeExistingAttachment) ? 'Change file' : 'Attach file'}
        </button>
        {/* Show newly selected file with remove option */}
        {attachFile ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '4px 10px' }}>
            <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>{attachFile.name}</span>
            <button
              type="button"
              onClick={clearAttachFile}
              style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: FONT, padding: '2px 4px' }}
              title="Remove selected file"
            >
              ✕
            </button>
          </div>
        ) : null}
        {/* Show existing (server-side) attachment with remove option */}
        {!attachFile && existingAttachment && !removeExistingAttachment ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '4px 10px' }}>
            <span style={{ fontSize: 12, color: '#1e40af', fontWeight: 600 }}>{existingAttachment.name}</span>
            <button
              type="button"
              onClick={() => { setRemoveExistingAttachment(true); setHasUnsavedChanges(true) }}
              style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: FONT, padding: '2px 4px' }}
              title="Remove attachment"
            >
              ✕
            </button>
          </div>
        ) : null}
        {/* Show "removed" indicator */}
        {removeExistingAttachment && !attachFile ? (
          <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Attachment will be removed on save</span>
        ) : null}
      </div>
      {attachErr ? <div style={{ marginTop: 6, fontSize: 12, color: '#dc2626' }}>{attachErr}</div> : null}
    </div>
  )
}

/* ── Draft banner ─────────────────────────────────────────────────────── */
export function DraftBanner({ isEditing, draftId, status, title, discarding, setShowDiscardDialog }) {
  if (isEditing || !draftId || status !== 'draft') return null
  return (
    <div style={{
      background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
      border: '1px solid #fcd34d',
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
          <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>Continuing your draft</div>
          <div style={{ fontSize: 11, color: '#a16207' }}>
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
          background: '#fff',
          border: '1px solid #fbbf24',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          color: '#92400e',
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
    <div style={{ background: status === 'rejected' ? '#fef2f2' : '#eff6ff', border: `1px solid ${status === 'rejected' ? '#fecaca' : '#bfdbfe'}`, borderRadius: 9, padding: '10px 14px', marginBottom: 10, fontSize: 13, color: status === 'rejected' ? '#b91c1c' : '#1d4ed8' }}>
      Status: <strong>{status}</strong>
    </div>
  )
}

/* ── Error banner ─────────────────────────────────────────────────────── */
export function ErrorBanner({ error }) {
  if (!error) return null
  return (
    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '10px 14px', marginBottom: 10, fontSize: 13, color: '#dc2626' }}>
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
            style={{ width: '100%', height: '100%', minHeight: 420, background: 'transparent', border: 'none', outline: 'none', resize: 'none', padding: '16px 18px', fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12.5, lineHeight: 1.9, color: '#e2e8f0', boxSizing: 'border-box', opacity: isHtmlMode && !canEditHtml ? 0.6 : 1 }}
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
