/* ═══════════════════════════════════════════════════════════════════════════
 * GroupModals.jsx — Create and Edit group modals
 *
 * Exports CreateGroupModal (default) and EditGroupModal components.
 * Both modals use identical form structure with different titles and handlers.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react'
import { styles } from './studyGroupsStyles'

function CreateGroupModal({ open, onClose, onSubmit, courses }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [privacy, setPrivacy] = useState('public')
  const [courseId, setCourseId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setSubmitError('Group name is required.')
      return
    }

    setSubmitting(true)
    setSubmitError('')

    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        privacy,
        courseId: courseId ? parseInt(courseId, 10) : null,
      })
    } catch (err) {
      setSubmitError(err.message || 'Failed to create group.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2 style={styles.modalTitle}>Create a Study Group</h2>

        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Group Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Biology 101 Study Group"
              style={styles.input}
              maxLength={100}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell others what this group is about..."
              rows={3}
              style={styles.textarea}
              maxLength={500}
            />
            <span style={styles.charCount}>{description.length}/500</span>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Privacy</label>
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value)}
              style={styles.input}
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="invite_only">Invite Only</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Course (optional)</label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              style={styles.input}
            >
              <option value="">Select a course</option>
              {courses?.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </div>

          {submitError && <div style={styles.alert('danger')}>{submitError}</div>}

          <div style={styles.modalActions}>
            <button type="button" onClick={onClose} style={styles.cancelBtn} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" style={styles.submitBtn} disabled={submitting || !name.trim()}>
              {submitting ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function EditGroupModal({ open, group, onClose, onSubmit, courses }) {
  const [name, setName] = useState(group?.name || '')
  const [description, setDescription] = useState(group?.description || '')
  const [privacy, setPrivacy] = useState(group?.privacy || 'public')
  const [courseId, setCourseId] = useState(group?.courseId || '')
  const [maxMembers, setMaxMembers] = useState(group?.maxMembers || 50)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setSubmitError('Group name is required.')
      return
    }

    setSubmitting(true)
    setSubmitError('')

    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        privacy,
        courseId: courseId ? parseInt(courseId, 10) : null,
        maxMembers: parseInt(maxMembers, 10) || 50,
      })
    } catch (err) {
      setSubmitError(err.message || 'Failed to update group.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2 style={styles.modalTitle}>Edit Study Group</h2>

        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Group Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name"
              style={styles.input}
              maxLength={100}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Group description..."
              rows={3}
              style={styles.textarea}
              maxLength={500}
            />
            <span style={styles.charCount}>{description.length}/500</span>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Privacy</label>
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value)}
              style={styles.input}
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="invite_only">Invite Only</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Course (optional)</label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              style={styles.input}
            >
              <option value="">Select a course</option>
              {courses?.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Max Members</label>
            <input
              type="number"
              value={maxMembers}
              onChange={(e) => setMaxMembers(e.target.value)}
              min={1}
              max={1000}
              style={styles.input}
            />
            <span style={styles.charCount}>1 - 1000</span>
          </div>

          {submitError && <div style={styles.alert('danger')}>{submitError}</div>}

          <div style={styles.modalActions}>
            <button type="button" onClick={onClose} style={styles.cancelBtn} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" style={styles.submitBtn} disabled={submitting || !name.trim()}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateGroupModal
