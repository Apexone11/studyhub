/* ═══════════════════════════════════════════════════════════════════════════
 * DeleteExamConfirm.jsx — Phase 2 Day 4 write-path UI.
 *
 * Destructive-confirm dialog for "Delete exam?" Uses the base <Modal> + a
 * <Button variant="danger"> footer action — the Figma-planned
 * `variant="confirmation"` modal variant isn't yet shipped in
 * components/ui, and per the Day 4 handoff we don't add new primitives to
 * unblock this feature. The resulting UX is indistinguishable from a
 * dedicated danger-variant modal: title, body line, ghost Cancel +
 * danger Delete in the footer.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react'
import { API } from '../../config'
import { Button, Modal, ModalFooter } from '../../components/ui'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { showToast } from '../../lib/toast'

export default function DeleteExamConfirm({ open, exam, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  async function handleDelete() {
    if (!exam?.id) return
    setError(null)
    setDeleting(true)
    try {
      const res = await fetch(`${API}/api/exams/${exam.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.status === 204 || res.ok) {
        showToast('Exam removed.', 'success')
        onDeleted?.(exam.id)
        onClose?.()
        return
      }
      const data = await readJsonSafely(res, {})
      setError(getApiErrorMessage(data, 'Could not remove the exam.'))
    } catch (err) {
      setError(err?.message || 'Network error. Try again.')
    } finally {
      setDeleting(false)
    }
  }

  if (!open || !exam) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete this exam?"
      description={`"${exam.title}" will be removed from your Upcoming Exams. You can always add it again later.`}
    >
      {error ? (
        <p
          role="alert"
          style={{
            margin: '0 0 var(--space-4) 0',
            fontSize: 13,
            color: 'var(--sh-danger-text)',
          }}
        >
          {error}
        </p>
      ) : null}
      <ModalFooter>
        <Button type="button" variant="ghost" onClick={onClose} disabled={deleting}>
          Cancel
        </Button>
        <Button type="button" variant="danger" onClick={handleDelete} loading={deleting}>
          Delete exam
        </Button>
      </ModalFooter>
    </Modal>
  )
}
