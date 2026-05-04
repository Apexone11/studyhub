/* ═══════════════════════════════════════════════════════════════════════════
 * AiSaveToNotesButton.jsx — Per-message "Save as note" action.
 *
 * Renders a button that opens a 480px modal (via createPortal) with:
 *   - Title input pre-filled from the first 60 chars of the AI message
 *   - Course dropdown (user's enrolled courses)
 *   - Save / Cancel actions
 *
 * On save, POSTs to `/api/ai/save-to-notes`. Uses the shared focus-trap
 * hook so keyboard users can't tab out of the modal.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { API } from '../../config'

function deriveTitle(content) {
  if (!content) return 'AI response'
  const flat = String(content).replace(/\s+/g, ' ').trim()
  return flat.slice(0, 60) || 'AI response'
}

export default function AiSaveToNotesButton({ messageId, content, courses = [] }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(() => deriveTitle(content))
  const [courseId, setCourseId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(deriveTitle(content))
      setError(null)
      setSaved(false)
    }
  }, [open, content])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API}/api/ai/save-to-notes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: messageId || undefined,
          title: title.trim() || 'AI response',
          courseId: courseId ? Number.parseInt(courseId, 10) : undefined,
          content,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Could not save note')
      }
      setSaved(true)
      // Auto-close after a short confirmation flash.
      setTimeout(() => setOpen(false), 700)
    } catch (e) {
      setError(e.message || 'Could not save note')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Save AI response as note"
        title="Save as note"
        style={{
          background: 'none',
          border: '1px solid var(--sh-border)',
          borderRadius: 8,
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--sh-subtext)',
          cursor: 'pointer',
          minHeight: 28,
        }}
      >
        Save as note
      </button>
      {open
        ? createPortal(
            <SaveModal
              title={title}
              setTitle={setTitle}
              courseId={courseId}
              setCourseId={setCourseId}
              courses={courses}
              saving={saving}
              error={error}
              saved={saved}
              onSave={handleSave}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </>
  )
}

function SaveModal({
  title,
  setTitle,
  courseId,
  setCourseId,
  courses,
  saving,
  error,
  saved,
  onSave,
  onClose,
}) {
  const dialogRef = useFocusTrap({ active: true, onClose, escapeCloses: true })

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.5)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Save AI response as note"
        style={{
          width: 'min(480px, calc(100vw - 32px))',
          background: 'var(--sh-surface)',
          borderRadius: 16,
          border: '1px solid var(--sh-border)',
          boxShadow: 'var(--shadow-lg)',
          padding: 24,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--sh-heading)',
            marginBottom: 16,
          }}
        >
          Save as note
        </h2>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--sh-subtext)',
              marginBottom: 4,
            }}
          >
            Title
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={140}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--sh-border)',
              background: 'var(--sh-bg)',
              color: 'var(--sh-text)',
              fontSize: 14,
              outline: 'none',
            }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 16 }}>
          <span
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--sh-subtext)',
              marginBottom: 4,
            }}
          >
            Course (optional)
          </span>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--sh-border)',
              background: 'var(--sh-bg)',
              color: 'var(--sh-text)',
              fontSize: 14,
              outline: 'none',
            }}
          >
            <option value="">No course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} — ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </label>

        {error ? (
          <div
            role="alert"
            style={{
              background: 'var(--sh-danger-bg)',
              color: 'var(--sh-danger-text)',
              border: '1px solid var(--sh-danger-border)',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        ) : null}
        {saved ? (
          <div
            role="status"
            style={{
              background: 'var(--sh-success-bg, #dcfce7)',
              color: 'var(--sh-success-text, #166534)',
              border: '1px solid var(--sh-success-border, #86efac)',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            Saved to your notes.
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--sh-soft)',
              color: 'var(--sh-text)',
              border: '1px solid var(--sh-border)',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 36,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || saved || !title.trim()}
            style={{
              background: 'var(--sh-brand)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: saving || saved || !title.trim() ? 'not-allowed' : 'pointer',
              opacity: saving || saved || !title.trim() ? 0.7 : 1,
              minHeight: 36,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
