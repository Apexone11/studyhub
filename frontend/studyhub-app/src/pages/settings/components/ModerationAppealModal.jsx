/* ═══════════════════════════════════════════════════════════════════════════
 * ModerationAppealModal.jsx — Appeal submission form modal
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FONT } from '../settingsState'

const APPEAL_CATEGORIES = [
  { value: 'educational_context', label: 'Educational context', hint: 'What course/topic was this for? Why is it relevant to your studies?' },
  { value: 'false_positive', label: 'False positive / misunderstanding', hint: 'Why do you believe this was incorrectly flagged?' },
  { value: 'not_me', label: 'Not me / compromised account', hint: 'Describe what happened with your account.' },
  { value: 'content_edited', label: 'I edited the content', hint: 'What changes did you make to address the concern?' },
  { value: 'other', label: 'Other', hint: 'Provide any relevant context or explanation.' },
]

export function AppealModal({ open, caseData, onClose, onSubmit }) {
  const [modalState, setModalState] = useState({
    category: '',
    reason: '',
    acknowledged: false,
    submitting: false,
    error: '',
  })

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const selectedCategory = APPEAL_CATEGORIES.find((c) => c.value === modalState.category)
  const canSubmit = modalState.category && modalState.reason.trim().length >= 20 && modalState.acknowledged && !modalState.submitting

  const updateModalState = useCallback((updates) => {
    setModalState((prev) => ({ ...prev, ...updates }))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    updateModalState({ submitting: true, error: '' })
    const result = await onSubmit(caseData.id, modalState.category, modalState.reason.trim())
    updateModalState({ submitting: false })
    if (result.ok) {
      onClose()
    } else {
      updateModalState({ error: result.error })
    }
  }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(4px)',
      padding: 24,
    }} onClick={onClose}>
      <div
        style={{
          background: 'var(--sh-surface)', borderRadius: 16,
          maxWidth: 520, width: '92vw', maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto', boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
          padding: '24px 28px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--sh-heading)' }}>
            Appeal Decision
          </h3>
          <button type="button" onClick={onClose} style={{
            border: 'none', background: 'none', fontSize: 18, color: 'var(--sh-muted)',
            cursor: 'pointer', padding: '4px 8px', lineHeight: 1,
          }}>&times;</button>
        </div>

        {/* Case context */}
        <div style={{
          padding: '10px 12px', borderRadius: 8, background: 'var(--sh-soft)',
          border: '1px solid var(--sh-border)', marginBottom: 16, fontSize: 12, color: 'var(--sh-subtext)',
        }}>
          <strong>Case #{caseData.id}</strong> — {caseData.contentType?.replace(/_/g, ' ')}
          {caseData.reasonCategory && <> &middot; {caseData.reasonCategory.replace(/_/g, ' ')}</>}
          {caseData.excerpt && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--sh-muted)', borderLeft: '3px solid var(--sh-warning-border)', paddingLeft: 8 }}>
              {caseData.excerpt.length > 200 ? caseData.excerpt.slice(0, 200) + '...' : caseData.excerpt}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Reason category chips */}
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--sh-subtext)', marginBottom: 8 }}>
            Why should this be reconsidered?
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {APPEAL_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => updateModalState({ category: cat.value })}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: modalState.category === cat.value ? '2px solid var(--sh-brand)' : '1px solid var(--sh-border)',
                  background: modalState.category === cat.value ? 'var(--sh-info-bg)' : 'var(--sh-surface)',
                  color: modalState.category === cat.value ? 'var(--sh-brand)' : 'var(--sh-subtext)',
                  cursor: 'pointer', fontFamily: FONT,
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Guided prompt */}
          {selectedCategory && (
            <div style={{
              padding: '8px 12px', borderRadius: 8, background: 'var(--sh-info-bg)',
              border: '1px solid var(--sh-info-border)', marginBottom: 12,
              fontSize: 12, color: 'var(--sh-info-text)', fontWeight: 600,
            }}>
              {selectedCategory.hint}
            </div>
          )}

          {/* Explanation textarea */}
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--sh-subtext)', marginBottom: 6 }}>
            Your explanation (20–2000 characters)
          </label>
          <textarea
            value={modalState.reason}
            onChange={(e) => updateModalState({ reason: e.target.value })}
            rows={5}
            maxLength={2000}
            placeholder="Be specific — explain the intent, the academic context, and what you'd change..."
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 13,
              border: '1px solid var(--sh-input-border)', background: 'var(--sh-input-bg)',
              color: 'var(--sh-input-text)', fontFamily: FONT, resize: 'vertical',
              marginBottom: 4, boxSizing: 'border-box',
            }}
          />
          <div style={{
            fontSize: 11, marginBottom: 12, textAlign: 'right',
            color: modalState.reason.trim().length > 0 && modalState.reason.trim().length < 20 ? 'var(--sh-warning-text)' : 'var(--sh-muted)',
          }}>
            {modalState.reason.trim().length > 0 && modalState.reason.trim().length < 20
              ? `${modalState.reason.trim().length}/20 min`
              : `${modalState.reason.trim().length}/2000`}
          </div>

          {/* Acknowledgement */}
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16, cursor: 'pointer',
            padding: '10px 12px', borderRadius: 8, background: 'var(--sh-soft)', border: '1px solid var(--sh-border)',
          }}>
            <input
              type="checkbox"
              checked={modalState.acknowledged}
              onChange={(e) => updateModalState({ acknowledged: e.target.checked })}
              style={{ marginTop: 2, accentColor: 'var(--sh-brand)' }}
            />
            <span style={{ fontSize: 12, color: 'var(--sh-subtext)', lineHeight: 1.5 }}>
              I acknowledge the community guidelines and will avoid actions that may violate them in the future.
            </span>
          </label>

          {modalState.error && (
            <div style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 12,
              background: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)',
              border: '1px solid var(--sh-danger-border)',
            }}>
              {modalState.error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              border: '1px solid var(--sh-border)', background: 'var(--sh-surface)',
              color: 'var(--sh-subtext)', cursor: 'pointer', fontFamily: FONT,
            }}>
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit} style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: canSubmit ? 'var(--sh-brand)' : 'var(--sh-soft)',
              color: canSubmit ? '#fff' : 'var(--sh-muted)', fontSize: 13,
              fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: FONT,
            }}>
              {modalState.submitting ? 'Submitting...' : 'Submit Appeal'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
