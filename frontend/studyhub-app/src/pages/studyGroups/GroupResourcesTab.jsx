import { useState } from 'react'
import { createPortal } from 'react-dom'
import { formatRelativeTime, truncateText } from './studyGroupsHelpers'
import { styles } from './GroupDetailTabs.styles'

export function GroupResourcesTab({
  groupId,
  resources,
  onAdd,
  onDelete,
  isAdminOrMod,
  isMember,
}) {
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'link',
    url: '',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleAddClick = () => {
    setFormData({ title: '', description: '', type: 'link', url: '' })
    setError('')
    setAddModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!formData.title.trim()) {
      setError('Title is required')
      return
    }

    if (formData.type === 'link' && !formData.url.trim()) {
      setError('URL is required for link type')
      return
    }

    setSubmitting(true)
    try {
      await onAdd({
        ...formData,
        groupId,
      })
      setAddModalOpen(false)
      setFormData({ title: '', description: '', type: 'link', url: '' })
    } catch (err) {
      setError(err.message || 'Failed to add resource')
    } finally {
      setSubmitting(false)
    }
  }

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
        {createPortal(
          addModalOpen && (
            <div style={styles.modalOverlay} onClick={() => setAddModalOpen(false)}>
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

                  {(formData.type === 'link' || formData.type === 'file') && (
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

                  <div style={styles.formActions}>
                    <button
                      type="button"
                      onClick={() => setAddModalOpen(false)}
                      style={{ ...styles.button, ...styles.buttonSecondary }}
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
            </div>
          ),
          document.body
        )}
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
          <div key={resource.id} style={styles.listItem}>
            <div style={styles.itemContent}>
              <div style={styles.itemTitle}>{resource.title}</div>
              {resource.description && (
                <p style={{ fontSize: 'var(--type-sm)', color: 'var(--sh-subtext)', marginBottom: 'var(--space-2)' }}>
                  {truncateText(resource.description, 100)}
                </p>
              )}
              <div style={styles.itemMeta}>
                <span style={styles.badge}>{resource.type || 'Link'}</span>
                <span>Added by {resource.addedBy || 'Unknown'}</span>
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
        ))}
      </div>

      {createPortal(
        addModalOpen && (
          <div style={styles.modalOverlay} onClick={() => setAddModalOpen(false)}>
            <div
              style={styles.modalContent}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-resource-title-2"
            >
              <h3 style={styles.sectionTitle} id="add-resource-title-2">Add Resource</h3>
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

                {(formData.type === 'link' || formData.type === 'file') && (
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

                <div style={styles.formActions}>
                  <button
                    type="button"
                    onClick={() => setAddModalOpen(false)}
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
          </div>
        ),
        document.body
      )}
    </div>
  )
}
