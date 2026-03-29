/**
 * SheetLab Editor tab — split-pane content editor with live preview.
 * Handles save via PATCH /api/sheets/:id with debounced autosave.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { API } from '../../../config'
import { authHeaders } from './sheetLabConstants'
import { getApiErrorMessage, readJsonSafely } from '../../../lib/http'
import { showToast } from '../../../lib/toast'

const AUTOSAVE_DELAY = 1500

const editorStyle = {
  width: '100%',
  height: '100%',
  minHeight: 400,
  resize: 'none',
  border: 'none',
  background: '#0f172a',
  color: '#e2e8f0',
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  fontSize: '12.5px',
  lineHeight: 1.9,
  padding: 16,
  outline: 'none',
  boxSizing: 'border-box',
}

const previewFrameStyle = {
  width: '100%',
  height: '100%',
  minHeight: 400,
  border: 'none',
  borderRadius: 0,
  background: '#fff',
}

export default function SheetLabEditor({ sheet, onContentSaved }) {
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const [sheetStatus, setSheetStatus] = useState('draft')
  const autosaveTimer = useRef(null)
  const contentFormat = sheet?.contentFormat || 'markdown'
  const isHtml = contentFormat === 'html'
  const isDraft = sheetStatus === 'draft'

  // Hydrate from sheet
  useEffect(() => {
    if (!sheet) return
    setContent(sheet.content || '')
    setTitle(sheet.title || '')
    setDescription(sheet.description || '')
    setSheetStatus(sheet.status || 'draft')
    setDirty(false)
    setLastSaved(null)
  }, [sheet?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Save function
  const save = useCallback(async (contentToSave, titleToSave, descToSave) => {
    if (!sheet?.id) return
    setSaving(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          title: titleToSave,
          description: descToSave,
          content: contentToSave,
        }),
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not save.'))
      setDirty(false)
      setLastSaved(new Date())
      if (onContentSaved) onContentSaved()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }, [sheet?.id, onContentSaved])

  // Publish or revert to draft — saves content first, then toggles status
  const handleTogglePublish = async () => {
    if (!sheet?.id || publishing) return
    setPublishing(true)
    try {
      // Save current content first if dirty
      if (dirty) {
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
        await save(content, title, description)
      }
      const newStatus = isDraft ? 'published' : 'draft'
      const response = await fetch(`${API}/api/sheets/${sheet.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, `Could not ${isDraft ? 'publish' : 'unpublish'}.`))
      setSheetStatus(newStatus)
      showToast(isDraft ? 'Sheet published!' : 'Sheet moved back to draft.', 'success')
      if (onContentSaved) onContentSaved()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setPublishing(false)
    }
  }

  // Debounced autosave
  useEffect(() => {
    if (!dirty) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      save(content, title, description)
    }, AUTOSAVE_DELAY)
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
  }, [content, title, description, dirty, save])

  // Unsaved changes warning
  useEffect(() => {
    if (!dirty) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const handleContentChange = (e) => {
    setContent(e.target.value)
    setDirty(true)
  }

  const handleTitleChange = (e) => {
    setTitle(e.target.value.slice(0, 160))
    setDirty(true)
  }

  const handleDescChange = (e) => {
    setDescription(e.target.value.slice(0, 300))
    setDirty(true)
  }

  const handleManualSave = () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    save(content, title, description)
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Title + description fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Title</label>
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            maxLength={160}
            placeholder="Sheet title"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Description</label>
          <input
            type="text"
            value={description}
            onChange={handleDescChange}
            maxLength={300}
            placeholder="Brief description"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Save status bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', borderRadius: 10,
        background: 'var(--sh-soft)', border: '1px solid var(--sh-border)',
        fontSize: 12, color: 'var(--sh-muted)',
        flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Draft / Published status indicator */}
          <span style={{
            padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 10,
            textTransform: 'uppercase',
            background: isDraft ? 'var(--sh-warning-bg, #fffbeb)' : 'var(--sh-success-bg, #f0fdf4)',
            color: isDraft ? 'var(--sh-warning-text, #92400e)' : 'var(--sh-success-text, #166534)',
            border: `1px solid ${isDraft ? 'var(--sh-warning-border, #fde68a)' : 'var(--sh-success-border, #bbf7d0)'}`,
          }}>
            {isDraft ? 'Draft' : 'Published'}
          </span>
          <span>
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : lastSaved ? `Saved ${formatTime(lastSaved)}` : 'No changes'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 10,
            background: isHtml ? '#dbeafe' : '#e0e7ff',
            color: isHtml ? '#1e40af' : '#4338ca',
            textTransform: 'uppercase',
          }}>
            {contentFormat}
          </span>
          <button
            type="button"
            onClick={handleManualSave}
            disabled={!dirty || saving}
            style={{
              border: 'none', borderRadius: 8, padding: '4px 12px',
              background: dirty ? '#6366f1' : 'var(--sh-border)',
              color: dirty ? '#fff' : 'var(--sh-muted)',
              fontWeight: 700, fontSize: 11, cursor: dirty ? 'pointer' : 'default',
              fontFamily: 'inherit',
            }}
          >
            {saving ? 'Saving…' : 'Save now'}
          </button>
          <button
            type="button"
            onClick={handleTogglePublish}
            disabled={publishing || saving}
            style={{
              border: 'none', borderRadius: 8, padding: '4px 12px',
              background: isDraft ? 'var(--sh-success, #16a34a)' : 'var(--sh-warning-bg, #fffbeb)',
              color: isDraft ? '#fff' : 'var(--sh-warning-text, #92400e)',
              fontWeight: 700, fontSize: 11,
              cursor: publishing ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              border: isDraft ? 'none' : '1px solid var(--sh-warning-border, #fde68a)',
            }}
          >
            {publishing ? (isDraft ? 'Publishing…' : 'Saving…') : isDraft ? 'Publish' : 'Revert to draft'}
          </button>
        </div>
      </div>

      {/* Split-pane editor + preview */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 0,
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid var(--sh-border)',
        minHeight: 450,
      }}>
        {/* Editor */}
        <div style={{ position: 'relative' }}>
          <div style={{
            padding: '6px 12px', background: '#1e293b', color: '#94a3b8',
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
            borderBottom: '1px solid #334155',
          }}>
            Editor
          </div>
          <textarea
            value={content}
            onChange={handleContentChange}
            style={editorStyle}
            spellCheck={!isHtml}
            placeholder={isHtml ? 'HTML content…' : 'Write your content in markdown…'}
          />
        </div>

        {/* Preview */}
        <div style={{ borderLeft: '1px solid var(--sh-border)' }}>
          <div style={{
            padding: '6px 12px', background: 'var(--sh-soft)', color: 'var(--sh-muted)',
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
            borderBottom: '1px solid var(--sh-border)',
          }}>
            Preview
          </div>
          {isHtml ? (
            <iframe
              title="html-preview"
              sandbox="allow-same-origin"
              srcDoc={content}
              style={previewFrameStyle}
            />
          ) : (
            <div style={{
              padding: 16, fontSize: 13, lineHeight: 1.8,
              color: 'var(--sh-text)', background: 'var(--sh-surface)',
              minHeight: 400, overflowY: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {content || <span style={{ color: 'var(--sh-muted)', fontStyle: 'italic' }}>Start typing to see a live preview…</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Helpers ────────────────────────────────────────────────── */

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 700,
  color: 'var(--sh-muted)', marginBottom: 4, textTransform: 'uppercase',
  letterSpacing: '0.3px',
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  borderRadius: 10, border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)', color: 'var(--sh-heading)',
  fontSize: 13, fontFamily: 'inherit',
}

function formatTime(date) {
  if (!date) return ''
  const now = new Date()
  const diff = Math.floor((now - date) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  return `${Math.floor(diff / 60)}m ago`
}
