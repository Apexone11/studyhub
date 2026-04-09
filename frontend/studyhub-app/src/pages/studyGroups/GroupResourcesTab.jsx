import { useState } from 'react'
import { createPortal } from 'react-dom'
import { formatRelativeTime, truncateText } from './studyGroupsHelpers'
import { styles } from './GroupDetailTabs.styles'
import MediaComposer from './MediaComposer'

/**
 * Resources tab. Phase 4 additions:
 *   - The Add Resource modal now embeds <MediaComposer> so members can
 *     upload image/video/file attachments directly. Quota is enforced
 *     server-side; the composer displays the live "N/5 this week"
 *     counter and disables the upload button when the user is over.
 *   - Each resource row shows an inline thumbnail or a file link when
 *     it carries media metadata.
 *   - The duplicated modal block that used to live in both empty and
 *     populated states is now a single <AddResourceModal> helper.
 */
export function GroupResourcesTab({
  groupId,
  resources,
  onAdd,
  onDelete,
  isAdminOrMod,
  isMember,
}) {
  const [addModalOpen, setAddModalOpen] = useState(false)

  const handleAddClick = () => setAddModalOpen(true)

  if (!resources || resources.length === 0) {
    return (
      <div style={styles.tabContainer}>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon} aria-label="Books icon">Library</div>
          <div style={styles.emptyTitle}>No Resources Yet</div>
          <p style={styles.emptyText}>
            {isMember
              ? 'Add a resource to help the group!'
              : 'Join the group to add resources'}
          </p>
          {isMember && (
            <button
              onClick={handleAddClick}
              style={{ ...styles.button, ...styles.buttonPrimary, marginTop: 'var(--space-4)' }}
            >
              Add Resource
            </button>
          )}
        </div>
        {addModalOpen ? (
          <AddResourceModal
            groupId={groupId}
            onAdd={onAdd}
            onClose={() => setAddModalOpen(false)}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div style={styles.tabContainer}>
      {isMember && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <button
            onClick={handleAddClick}
            style={{ ...styles.button, ...styles.buttonPrimary }}
          >
            Add Resource
          </button>
        </div>
      )}

      <div style={styles.section}>
        {resources.map((resource) => (
          <ResourceRow
            key={resource.id}
            resource={resource}
            isAdminOrMod={isAdminOrMod}
            onDelete={onDelete}
          />
        ))}
      </div>

      {addModalOpen ? (
        <AddResourceModal
          groupId={groupId}
          onAdd={onAdd}
          onClose={() => setAddModalOpen(false)}
        />
      ) : null}
    </div>
  )
}

/* ── Individual resource row ──────────────────────────────── */

function ResourceRow({ resource, isAdminOrMod, onDelete }) {
  const isImage = resource.mediaType === 'image' && resource.mediaUrl
  const isVideo = resource.mediaType === 'video' && resource.mediaUrl

  return (
    <div style={styles.listItem}>
      <div style={styles.itemContent}>
        <div style={styles.itemTitle}>{resource.title}</div>
        {resource.description && (
          <p style={{ fontSize: 'var(--type-sm)', color: 'var(--sh-subtext)', marginBottom: 'var(--space-2)' }}>
            {truncateText(resource.description, 100)}
          </p>
        )}

        {/* Phase 4: inline media preview */}
        {isImage ? (
          <img
            src={resource.mediaUrl}
            alt={resource.title}
            loading="lazy"
            style={{
              display: 'block',
              maxWidth: 320,
              maxHeight: 240,
              borderRadius: 8,
              border: '1px solid var(--sh-border)',
              marginBottom: 'var(--space-2)',
            }}
          />
        ) : null}
        {isVideo ? (
          <video
            src={resource.mediaUrl}
            controls
            preload="metadata"
            style={{
              display: 'block',
              maxWidth: 320,
              borderRadius: 8,
              border: '1px solid var(--sh-border)',
              marginBottom: 'var(--space-2)',
            }}
          />
        ) : null}
        {resource.mediaUrl && !isImage && !isVideo ? (
          <a
            href={resource.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              fontSize: 'var(--type-sm)',
              color: 'var(--sh-brand)',
              fontWeight: 600,
              marginBottom: 'var(--space-2)',
            }}
          >
            Download attached file
          </a>
        ) : null}

        <div style={styles.itemMeta}>
          <span style={styles.badge}>{resource.resourceType || resource.type || 'Link'}</span>
          <span>Added by {resource.user?.username || resource.addedBy || 'Unknown'}</span>
          <span>{formatRelativeTime(resource.createdAt)}</span>
        </div>
      </div>
      {(isAdminOrMod || resource.isOwnedByUser) && (
        <div style={styles.actionButtons}>
          <button
            onClick={() => onDelete(resource.id)}
            style={{ ...styles.button, ...styles.buttonDanger, ...styles.buttonSmall }}
            aria-label="Delete resource"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Add Resource modal (single shared helper) ────────────── */

function AddResourceModal({ groupId, onAdd, onClose }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'link',
    url: '',
  })
  const [attachments, setAttachments] = useState([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!formData.title.trim()) {
      setError('Title is required')
      return
    }

    // For pure link-type resources we still need a URL. File/sheet/note
    // types with a committed attachment don't.
    const hasAttachment = attachments.length > 0
    if (formData.type === 'link' && !formData.url.trim() && !hasAttachment) {
      setError('URL is required for link type')
      return
    }

    setSubmitting(true)
    try {
      // Take the first attachment as the primary media; discard any
      // extras (the composer enforces maxFiles=4 but resources are
      // single-file for now).
      const primary = attachments[0] || null
      await onAdd({
        groupId,
        title: formData.title,
        description: formData.description,
        // If an upload was attached, flip the type to match its kind.
        resourceType: primary ? primary.kind || 'file' : formData.type,
        type: primary ? primary.kind || 'file' : formData.type,
        resourceUrl: primary ? primary.url : formData.url,
        url: primary ? primary.url : formData.url,
        ...(primary
          ? {
              mediaType: primary.kind,
              mediaUrl: primary.url,
              mediaBytes: primary.bytes,
              mediaMime: primary.mime,
            }
          : {}),
      })
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to add resource')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        style={styles.modalContent}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-resource-title"
      >
        <h3 style={styles.sectionTitle} id="add-resource-title">Add Resource</h3>
        {error && <div style={styles.error}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label htmlFor="title" style={styles.label}>
              Title
            </label>
            <input
              id="title"
              type="text"
              style={styles.input}
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              maxLength={100}
              placeholder="Resource title"
            />
          </div>

          <div style={styles.formGroup}>
            <label htmlFor="description" style={styles.label}>
              Description
            </label>
            <textarea
              id="description"
              style={styles.textarea}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              maxLength={500}
              placeholder="Brief description (optional)"
            />
          </div>

          <div style={styles.formGroup}>
            <label htmlFor="type" style={styles.label}>
              Type
            </label>
            <select
              id="type"
              style={styles.select}
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            >
              <option value="link">Link</option>
              <option value="sheet">Sheet</option>
              <option value="note">Note</option>
              <option value="file">File</option>
            </select>
          </div>

          {formData.type === 'link' && attachments.length === 0 && (
            <div style={styles.formGroup}>
              <label htmlFor="url" style={styles.label}>
                URL
              </label>
              <input
                id="url"
                type="text"
                style={styles.input}
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://example.com"
              />
            </div>
          )}

          {/* Phase 4: upload an image, video, or file directly */}
          <div style={styles.formGroup}>
            <div style={styles.label}>Attach file (optional)</div>
            <MediaComposer
              groupId={groupId}
              maxFiles={1}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
            />
          </div>

          <div style={styles.formActions}>
            <button
              type="button"
              onClick={onClose}
              style={{ ...styles.button, ...styles.buttonSecondary }}
              aria-label="Close Add Resource dialog"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{ ...styles.button, ...styles.buttonPrimary }}
            >
              {submitting ? 'Adding...' : 'Add Resource'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
