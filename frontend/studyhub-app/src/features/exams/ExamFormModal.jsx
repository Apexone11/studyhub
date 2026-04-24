/* ═══════════════════════════════════════════════════════════════════════════
 * ExamFormModal.jsx — Phase 2 Day 4 write-path UI.
 *
 * Shared form modal for both the "Add exam" and "Edit exam" flows — the two
 * differ only in initial values and HTTP verb (POST vs PATCH). Composed
 * entirely from already-shipped components/ui primitives. No new deps:
 *   - <Modal> + <ModalFooter> from components/ui (portal + focus trap +
 *     scroll lock + Escape/overlay close).
 *   - <Input> for Title + Notes (textarea currently renders through the
 *     primitive's single <input>, good enough for Day 4 — richer textarea
 *     support is a future primitive extension, not a blocker).
 *   - <Button> for footer actions.
 *   - Native <select> for Course and native <input type="date"> /
 *     <input type="range"> for Date + Preparedness — per handoff, "native
 *     date input is fine for Day 4; fancy datepicker is Phase 3."
 *
 * Course list is sourced from the logged-in user's `enrollments` on
 * session, not a fresh fetch — exams can only be added for courses the
 * viewer is enrolled in (backend enforces this with a 403, and the UI
 * matches by constraining the options up front).
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from 'react'
import { API } from '../../config'
import { Button, Input, Modal, ModalFooter } from '../../components/ui'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { useSession } from '../../lib/session-context'
import { showToast } from '../../lib/toast'

/** Convert a Date (or undefined) into an ISO date (`YYYY-MM-DD`) for the
 *  native date picker. */
function toDateInputValue(d) {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

/** Take a `YYYY-MM-DD` string back to a full ISO datetime the API accepts. */
function toIsoDateTime(yyyyMmDd) {
  if (!yyyyMmDd) return null
  const d = new Date(`${yyyyMmDd}T14:00:00.000Z`) // default to a mid-day UTC time
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export default function ExamFormModal({ open, onClose, exam, onSaved }) {
  const { user } = useSession()
  const enrollments = useMemo(
    () => (Array.isArray(user?.enrollments) ? user.enrollments : []),
    [user?.enrollments],
  )

  const isEdit = Boolean(exam?.id)

  // Form state. Reset every time the modal opens so "add" and "edit"
  // don't cross-contaminate between opens.
  const [courseId, setCourseId] = useState('')
  const [title, setTitle] = useState('')
  const [examDate, setExamDate] = useState('')
  const [preparednessPercent, setPreparednessPercent] = useState(0)
  const [notes, setNotes] = useState('')
  const [location, setLocation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const titleFieldRef = useRef(null)

  // Reset-on-open effect. `enrollments` is intentionally NOT a dep —
  // otherwise a post-mount session hydration changes its memo identity
  // and re-fires this effect, clobbering whatever the user already
  // typed. The ADD-mode courseId default is seeded by a second effect
  // below that only writes when courseId is still empty.
  useEffect(() => {
    if (!open) return
    if (isEdit) {
      setCourseId(exam.course?.id ?? exam.courseId ?? '')
      setTitle(exam.title ?? '')
      setExamDate(toDateInputValue(exam.examDate))
      setPreparednessPercent(
        typeof exam.preparednessPercent === 'number' ? exam.preparednessPercent : 0,
      )
      setNotes(exam.notes ?? '')
      setLocation(exam.location ?? '')
    } else {
      setCourseId('')
      setTitle('')
      setExamDate('')
      setPreparednessPercent(0)
      setNotes('')
      setLocation('')
    }
    setError(null)
  }, [open, isEdit, exam])

  // ADD-mode default courseId seed. Fires when enrollments finally
  // load (session hydration) but only writes if the user hasn't
  // already picked a course — so it never clobbers a deliberate
  // selection.
  useEffect(() => {
    if (!open || isEdit) return
    if (courseId) return
    const firstEnrollment = enrollments[0]
    if (firstEnrollment?.course?.id) {
      setCourseId(firstEnrollment.course.id)
    }
  }, [open, isEdit, enrollments, courseId])

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)

    if (!courseId) {
      setError('Please pick a course.')
      return
    }
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Title is required.')
      return
    }
    const isoDate = toIsoDateTime(examDate)
    if (!isoDate) {
      setError('Please pick a valid exam date.')
      return
    }

    const payload = {
      courseId: Number(courseId),
      title: trimmedTitle,
      examDate: isoDate,
      preparednessPercent: Number(preparednessPercent),
      notes: notes.trim() || null,
      location: location.trim() || null,
    }

    // On edit, courseId is not PATCHable per the backend schema —
    // strip it so the PATCH body is clean.
    if (isEdit) delete payload.courseId

    setSubmitting(true)
    try {
      const url = isEdit ? `${API}/api/exams/${exam.id}` : `${API}/api/exams`
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await readJsonSafely(res, {})
      if (!res.ok) {
        setError(
          getApiErrorMessage(data, isEdit ? 'Could not save the exam.' : 'Could not add the exam.'),
        )
        return
      }
      showToast(isEdit ? 'Exam updated.' : 'Exam added.', 'success')
      onSaved?.(data.exam)
      onClose?.()
    } catch (err) {
      setError(err?.message || 'Network error. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit exam' : 'Add upcoming exam'}
      description={
        isEdit
          ? 'Update the details below and save.'
          : 'Track an upcoming exam so it shows on your Overview tab.'
      }
      initialFocusRef={titleFieldRef}
    >
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {/* Course select */}
        <label style={{ display: 'grid', gap: 'var(--space-1)' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sh-text)' }}>
            Course <span style={{ color: 'var(--sh-danger)' }}>*</span>
          </span>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            disabled={isEdit || enrollments.length === 0}
            required
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--sh-input-border)',
              background: 'var(--sh-surface)',
              color: 'var(--sh-text)',
              fontFamily: 'inherit',
              fontSize: 14,
            }}
          >
            {enrollments.length === 0 ? (
              <option value="">No enrolled courses yet</option>
            ) : (
              enrollments.map((enrollment) => (
                <option key={enrollment.course.id} value={enrollment.course.id}>
                  {enrollment.course.code} — {enrollment.course.name}
                </option>
              ))
            )}
          </select>
          {isEdit ? (
            <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
              Course is locked once the exam is created.
            </span>
          ) : null}
        </label>

        {/* Title */}
        <Input
          ref={titleFieldRef}
          label="Title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Midterm 1 or Chapter 6 Quiz"
          maxLength={120}
          fullWidth
        />

        {/* Date */}
        <label style={{ display: 'grid', gap: 'var(--space-1)' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sh-text)' }}>
            Date <span style={{ color: 'var(--sh-danger)' }}>*</span>
          </span>
          <input
            type="date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            required
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--sh-input-border)',
              background: 'var(--sh-surface)',
              color: 'var(--sh-text)',
              fontFamily: 'inherit',
              fontSize: 14,
            }}
          />
        </label>

        {/* Location (optional) */}
        <Input
          label="Location (optional)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. ITE 231"
          maxLength={120}
          fullWidth
        />

        {/* Preparedness slider */}
        <label style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <span
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--sh-text)',
            }}
          >
            <span>Preparedness</span>
            <span style={{ color: 'var(--sh-subtext)' }}>{preparednessPercent}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={preparednessPercent}
            onChange={(e) => setPreparednessPercent(Number(e.target.value))}
            aria-label="Preparedness percent"
            style={{ width: '100%' }}
          />
        </label>

        {/* Notes */}
        <label style={{ display: 'grid', gap: 'var(--space-1)' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sh-text)' }}>
            Notes (optional)
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Topics to study, materials allowed, etc."
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--sh-input-border)',
              background: 'var(--sh-surface)',
              color: 'var(--sh-text)',
              fontFamily: 'inherit',
              fontSize: 14,
              resize: 'vertical',
            }}
          />
        </label>

        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--sh-danger-text)' }}>
            {error}
          </p>
        ) : null}

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            {isEdit ? 'Save changes' : 'Add exam'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
