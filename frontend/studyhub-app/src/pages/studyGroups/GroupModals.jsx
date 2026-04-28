/* ═══════════════════════════════════════════════════════════════════════════
 * GroupModals.jsx — Create and Edit group modals
 *
 * Exports CreateGroupModal (default) and EditGroupModal components.
 * Both modals use identical form structure with different titles and handlers.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useId, useState } from 'react'
import { API } from '../../config'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { resolveGroupImageUrl } from './studyGroupsHelpers'
import CourseSelect from '../../components/CourseSelect'
import { styles } from './studyGroupsStyles'

async function uploadGroupImage(file) {
  const formData = new FormData()
  formData.append('image', file)

  const response = await fetch(`${API}/api/upload/content-image`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  const data = await readJsonSafely(response, {})

  if (!response.ok || !data?.url) {
    throw new Error(getApiErrorMessage(data, 'Failed to upload group image.'))
  }

  return data.url
}

function useGroupImageUpload(initialValue) {
  const [imageUrl, setImageUrl] = useState(initialValue || '')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    setImageUrl(initialValue || '')
    setUploadError('')
    setUploading(false)
  }, [initialValue])

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadError('')
    setUploading(true)

    try {
      const url = await uploadGroupImage(file)
      setImageUrl(url)
    } catch (error) {
      setUploadError(error.message || 'Failed to upload group image.')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const clearImage = () => {
    setImageUrl('')
    setUploadError('')
  }

  return {
    imageUrl,
    setImageUrl,
    uploading,
    uploadError,
    handleFileChange,
    clearImage,
  }
}

function GroupImageField({ name, groupImage }) {
  const inputId = useId()
  const previewUrl = resolveGroupImageUrl(groupImage.imageUrl)
  const previewInitial = (name || 'Study Group').trim().charAt(0).toUpperCase() || 'S'

  return (
    <div style={styles.formGroup}>
      <label style={styles.label}>Group Avatar</label>
      <div style={styles.imageField}>
        <div style={styles.imagePreviewFrame}>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={styles.imagePreviewFallback}>{previewInitial}</div>
          )}
        </div>

        <div style={styles.imageFieldBody}>
          <div style={styles.imageFieldActions}>
            <label htmlFor={inputId} style={styles.secondaryActionBtn}>
              {groupImage.uploading
                ? 'Uploading...'
                : previewUrl
                  ? 'Replace Image'
                  : 'Upload Image'}
            </label>
            {previewUrl ? (
              <button
                type="button"
                onClick={groupImage.clearImage}
                disabled={groupImage.uploading}
                style={styles.dangerActionBtn}
              >
                Remove Image
              </button>
            ) : null}
          </div>

          <p style={styles.helperText}>
            Square badge image — shows next to your group name on the directory card and in the
            header. Square or near-square crops work best. To change the banner behind the group
            header, use
            <strong> Change background </strong>
            on the group page.
          </p>

          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={groupImage.handleFileChange}
            style={{ display: 'none' }}
            disabled={groupImage.uploading}
          />
        </div>
      </div>

      {groupImage.uploadError ? (
        <div style={styles.inlineError}>{groupImage.uploadError}</div>
      ) : null}
    </div>
  )
}

function CreateGroupModal({ open, onClose, onSubmit, courses, enrolledSchoolIds }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [privacy, setPrivacy] = useState('public')
  const [courseId, setCourseId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const groupImage = useGroupImageUpload('')

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
        avatarUrl: groupImage.imageUrl || null,
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

          <GroupImageField name={name} groupImage={groupImage} />

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
            <CourseSelect
              courses={courses}
              enrolledSchoolIds={enrolledSchoolIds}
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              ariaLabel="Course"
              placeholderLabel="Select a course"
              style={styles.input}
            />
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

export function EditGroupModal({ open, group, onClose, onSubmit, courses, enrolledSchoolIds }) {
  const [name, setName] = useState(group?.name || '')
  const [description, setDescription] = useState(group?.description || '')
  const [privacy, setPrivacy] = useState(group?.privacy || 'public')
  const [courseId, setCourseId] = useState(group?.courseId || '')
  const [maxMembers, setMaxMembers] = useState(group?.maxMembers || 50)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const groupImage = useGroupImageUpload(group?.avatarUrl || '')

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
        avatarUrl: groupImage.imageUrl || null,
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

          <GroupImageField name={name} groupImage={groupImage} />

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
            <CourseSelect
              courses={courses}
              enrolledSchoolIds={enrolledSchoolIds}
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              ariaLabel="Course"
              placeholderLabel="Select a course"
              style={styles.input}
            />
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
