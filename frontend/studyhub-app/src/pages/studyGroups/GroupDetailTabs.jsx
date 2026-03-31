/* ═══════════════════════════════════════════════════════════════════════════
 * GroupDetailTabs.jsx — Group detail view tab components
 *
 * Five main tabs:
 * 1. GroupOverviewTab — group description, stats, recent activity
 * 2. GroupResourcesTab — resources list with add/edit/delete actions
 * 3. GroupSessionsTab — sessions list with RSVP and scheduling
 * 4. GroupDiscussionsTab — discussion posts with replies
 * 5. GroupMembersTab — member list and management
 *
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react'
import { createPortal } from 'react-dom'
import UserAvatar from '../../components/UserAvatar'
import { PAGE_FONT } from '../shared/pageUtils'
import {
  formatRelativeTime,
  formatSessionTime,
  formatDuration,
  getRoleLabel,
  getSessionStatusLabel,
  getPostTypeLabel,
  truncateText,
} from './studyGroupsHelpers'

const styles = {
  tabContainer: {
    fontFamily: PAGE_FONT,
    color: 'var(--sh-text)',
  },

  section: {
    padding: 'var(--space-6)',
    marginBottom: 'var(--space-6)',
    backgroundColor: 'var(--sh-surface)',
    border: `1px solid var(--sh-border)`,
    borderRadius: 'var(--radius-card)',
  },

  sectionTitle: {
    fontSize: 'var(--type-lg)',
    fontWeight: 600,
    color: 'var(--sh-heading)',
    marginBottom: 'var(--space-4)',
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 'var(--space-4)',
    marginTop: 'var(--space-4)',
  },

  statCard: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--sh-soft)',
    borderRadius: 'var(--radius)',
    textAlign: 'center',
    border: `1px solid var(--sh-border)`,
  },

  statNumber: {
    fontSize: 'var(--type-lg)',
    fontWeight: 700,
    color: 'var(--sh-brand)',
  },

  statLabel: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-subtext)',
    marginTop: 'var(--space-2)',
  },

  emptyState: {
    padding: 'var(--space-8)',
    textAlign: 'center',
    color: 'var(--sh-muted)',
  },

  emptyIcon: {
    fontSize: '2.5rem',
    marginBottom: 'var(--space-4)',
    opacity: 0.5,
  },

  emptyTitle: {
    fontSize: 'var(--type-base)',
    fontWeight: 600,
    marginBottom: 'var(--space-2)',
    color: 'var(--sh-subtext)',
  },

  emptyText: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-muted)',
  },

  listItem: {
    padding: 'var(--space-4)',
    borderBottom: `1px solid var(--sh-border)`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    ':last-child': {
      borderBottom: 'none',
    },
  },

  itemContent: {
    flex: 1,
  },

  itemTitle: {
    fontSize: 'var(--type-base)',
    fontWeight: 500,
    color: 'var(--sh-heading)',
    marginBottom: 'var(--space-2)',
  },

  itemMeta: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-subtext)',
    display: 'flex',
    gap: 'var(--space-4)',
    alignItems: 'center',
  },

  badge: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--type-xs)',
    fontWeight: 500,
    backgroundColor: 'var(--sh-pill-bg)',
    color: 'var(--sh-pill-text)',
  },

  badgeGreen: {
    backgroundColor: 'var(--sh-success-bg)',
    color: 'var(--sh-success-text)',
  },

  badgeOrange: {
    backgroundColor: 'var(--sh-warning-bg)',
    color: 'var(--sh-warning-text)',
  },

  badgeRed: {
    backgroundColor: 'var(--sh-danger-bg)',
    color: 'var(--sh-danger-text)',
  },

  button: {
    padding: '0.5rem 1rem',
    borderRadius: 'var(--radius-control)',
    border: 'none',
    fontSize: 'var(--type-sm)',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: PAGE_FONT,
  },

  buttonPrimary: {
    backgroundColor: 'var(--sh-brand)',
    color: 'white',
    ':hover': {
      backgroundColor: 'var(--sh-brand-hover)',
    },
  },

  buttonSecondary: {
    backgroundColor: 'transparent',
    color: 'var(--sh-brand)',
    border: `1px solid var(--sh-brand)`,
    ':hover': {
      backgroundColor: 'var(--sh-brand-soft)',
    },
  },

  buttonSmall: {
    padding: '0.375rem 0.75rem',
    fontSize: 'var(--type-xs)',
  },

  buttonDanger: {
    backgroundColor: 'var(--sh-danger)',
    color: 'white',
    ':hover': {
      opacity: 0.9,
    },
  },

  actionButtons: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'var(--sh-modal-overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },

  modalContent: {
    backgroundColor: 'var(--sh-surface)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-6)',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: 'var(--elevation-3)',
  },

  formGroup: {
    marginBottom: 'var(--space-4)',
  },

  label: {
    display: 'block',
    fontSize: 'var(--type-sm)',
    fontWeight: 500,
    color: 'var(--sh-text)',
    marginBottom: 'var(--space-2)',
  },

  input: {
    width: '100%',
    padding: '0.625rem',
    border: `1px solid var(--sh-input-border)`,
    borderRadius: 'var(--radius-control)',
    fontSize: 'var(--type-sm)',
    fontFamily: PAGE_FONT,
    color: 'var(--sh-input-text)',
    backgroundColor: 'var(--sh-input-bg)',
    ':focus': {
      outline: 'none',
      borderColor: 'var(--sh-input-focus)',
      boxShadow: 'var(--sh-input-focus-ring)',
    },
  },

  textarea: {
    width: '100%',
    padding: '0.625rem',
    border: `1px solid var(--sh-input-border)`,
    borderRadius: 'var(--radius-control)',
    fontSize: 'var(--type-sm)',
    fontFamily: PAGE_FONT,
    color: 'var(--sh-input-text)',
    backgroundColor: 'var(--sh-input-bg)',
    minHeight: '100px',
    resize: 'vertical',
    ':focus': {
      outline: 'none',
      borderColor: 'var(--sh-input-focus)',
      boxShadow: 'var(--sh-input-focus-ring)',
    },
  },

  select: {
    width: '100%',
    padding: '0.625rem',
    border: `1px solid var(--sh-input-border)`,
    borderRadius: 'var(--radius-control)',
    fontSize: 'var(--type-sm)',
    fontFamily: PAGE_FONT,
    color: 'var(--sh-input-text)',
    backgroundColor: 'var(--sh-input-bg)',
    cursor: 'pointer',
    ':focus': {
      outline: 'none',
      borderColor: 'var(--sh-input-focus)',
      boxShadow: 'var(--sh-input-focus-ring)',
    },
  },

  formActions: {
    display: 'flex',
    gap: 'var(--space-3)',
    justifyContent: 'flex-end',
    marginTop: 'var(--space-6)',
  },

  recentActivityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  activityItem: {
    padding: 'var(--space-3)',
    backgroundColor: 'var(--sh-soft)',
    borderRadius: 'var(--radius)',
    fontSize: 'var(--type-sm)',
  },

  activityTime: {
    color: 'var(--sh-muted)',
    fontSize: 'var(--type-xs)',
    marginTop: 'var(--space-1)',
  },

  memberGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: 'var(--space-4)',
  },

  memberCard: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--sh-soft)',
    borderRadius: 'var(--radius)',
    border: `1px solid var(--sh-border)`,
    textAlign: 'center',
  },

  memberAvatar: {
    width: '3rem',
    height: '3rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--sh-avatar-bg)',
    color: 'var(--sh-avatar-text)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--type-base)',
    fontWeight: 600,
    margin: '0 auto var(--space-2) auto',
  },

  memberName: {
    fontSize: 'var(--type-sm)',
    fontWeight: 500,
    color: 'var(--sh-heading)',
    marginBottom: 'var(--space-1)',
    wordBreak: 'break-word',
  },

  sessionCard: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--sh-soft)',
    borderRadius: 'var(--radius)',
    border: `1px solid var(--sh-border)`,
    marginBottom: 'var(--space-3)',
  },

  sessionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start',
    marginBottom: 'var(--space-3)',
  },

  sessionTitle: {
    fontSize: 'var(--type-base)',
    fontWeight: 600,
    color: 'var(--sh-heading)',
  },

  sessionDetails: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-subtext)',
    marginTop: 'var(--space-2)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },

  discussionPost: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--sh-soft)',
    borderRadius: 'var(--radius)',
    border: `1px solid var(--sh-border)`,
    marginBottom: 'var(--space-3)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: 'var(--sh-surface)',
      borderColor: 'var(--sh-brand)',
    },
  },

  discussionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start',
    marginBottom: 'var(--space-2)',
  },

  discussionTitle: {
    fontSize: 'var(--type-base)',
    fontWeight: 600,
    color: 'var(--sh-heading)',
  },

  discussionMeta: {
    fontSize: 'var(--type-xs)',
    color: 'var(--sh-muted)',
    marginTop: 'var(--space-2)',
  },

  expandedContent: {
    paddingTop: 'var(--space-4)',
    borderTop: `1px solid var(--sh-border)`,
    marginTop: 'var(--space-4)',
  },

  repliesList: {
    marginTop: 'var(--space-4)',
    paddingLeft: 'var(--space-4)',
    borderLeft: `2px solid var(--sh-border)`,
  },

  reply: {
    marginBottom: 'var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--sh-soft)',
    borderRadius: 'var(--radius)',
  },

  replyAuthor: {
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
    color: 'var(--sh-heading)',
    marginBottom: 'var(--space-1)',
  },

  replyContent: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-text)',
    marginBottom: 'var(--space-2)',
  },

  replyTime: {
    fontSize: 'var(--type-xs)',
    color: 'var(--sh-muted)',
  },

  filterTabs: {
    display: 'flex',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
    borderBottom: `1px solid var(--sh-border)`,
    paddingBottom: 'var(--space-3)',
  },

  filterTab: {
    padding: '0.5rem 1rem',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: 'var(--sh-subtext)',
    cursor: 'pointer',
    fontSize: 'var(--type-sm)',
    fontWeight: 500,
    fontFamily: PAGE_FONT,
    transition: 'all 0.2s ease',
  },

  filterTabActive: {
    color: 'var(--sh-brand)',
    borderColor: 'var(--sh-brand)',
  },

  loading: {
    padding: 'var(--space-6)',
    textAlign: 'center',
    color: 'var(--sh-muted)',
  },

  error: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--sh-danger-bg)',
    borderRadius: 'var(--radius)',
    color: 'var(--sh-danger-text)',
    fontSize: 'var(--type-sm)',
    marginBottom: 'var(--space-4)',
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   Tab 1: GroupOverviewTab
═══════════════════════════════════════════════════════════════════════════ */
export function GroupOverviewTab({ group, activities, activitiesLoading, upcomingSessions }) {
  if (!group) {
    return <div style={styles.loading}>Loading group information...</div>
  }

  const stats = [
    { label: 'Members', value: group.memberCount || 0, icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
    { label: 'Resources', value: group.resourceCount || 0, icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
    { label: 'Upcoming Sessions', value: group.upcomingSessionCount || 0, icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z' },
    { label: 'Discussions', value: group.discussionPostCount || 0, icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  ]

  const activityTypeLabels = {
    discussion: 'posted',
    resource: 'shared a resource',
    member_joined: 'joined the group',
  }

  return (
    <div style={styles.tabContainer}>
      {/* About section */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>About this group</h2>
        <p style={{ fontSize: 'var(--type-base)', color: 'var(--sh-text)', lineHeight: '1.6' }}>
          {group.description || 'No description available.'}
        </p>
        {group.courseName && (
          <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ ...styles.badge, ...styles.badgeGreen }}>{group.courseName}</span>
          </div>
        )}
      </section>

      {/* Stats grid */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Quick Stats</h2>
        <div style={styles.statsGrid}>
          {stats.map((stat, idx) => (
            <div key={idx} style={styles.statCard}>
              <div style={styles.statNumber}>{stat.value}</div>
              <div style={styles.statLabel}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Upcoming sessions preview */}
      {Array.isArray(upcomingSessions) && upcomingSessions.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Upcoming Sessions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {upcomingSessions.map((s) => (
              <div key={s.id} style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--sh-soft)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--sh-border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 'var(--type-sm)', fontWeight: 600, color: 'var(--sh-heading)' }}>{s.title}</div>
                  <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-muted)', marginTop: 'var(--space-1)' }}>
                    {formatSessionTime(s.scheduledAt)}
                    {s.location ? ` -- ${s.location}` : ''}
                  </div>
                </div>
                <span style={{ ...styles.badge, ...styles.badgeGreen }}>{getSessionStatusLabel(s.status)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Activity feed */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Recent Activity</h2>
        {activitiesLoading ? (
          <div style={styles.loading}>Loading activity...</div>
        ) : !activities || activities.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyTitle}>No activity yet</div>
            <div style={styles.emptyText}>Activity will appear here as members post, share resources, and join.</div>
          </div>
        ) : (
          <div style={styles.recentActivityList}>
            {activities.map((activity, idx) => (
              <div key={idx} style={{
                ...styles.activityItem,
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              }}>
                {activity.actor?.avatarUrl ? (
                  <img src={activity.actor.avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'var(--sh-brand-soft)', color: 'var(--sh-brand)',
                    display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700,
                  }}>
                    {(activity.actor?.username || '?')[0].toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 'var(--type-sm)' }}>
                    <strong style={{ color: 'var(--sh-heading)' }}>{activity.actor?.username || 'Unknown'}</strong>
                    {' '}{activityTypeLabels[activity.type] || activity.type}
                    {activity.title && activity.type !== 'member_joined' ? (
                      <> -- <span style={{ color: 'var(--sh-heading)' }}>{truncateText(activity.title, 40)}</span></>
                    ) : null}
                  </div>
                  <div style={styles.activityTime}>{formatRelativeTime(activity.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Created date */}
      <div style={{ textAlign: 'center', color: 'var(--sh-muted)', fontSize: 'var(--type-xs)', padding: 'var(--space-4)' }}>
        Created {formatRelativeTime(group.createdAt)}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Tab 2: GroupResourcesTab
═══════════════════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════════════════
   Tab 3: GroupSessionsTab
═══════════════════════════════════════════════════════════════════════════ */
export function GroupSessionsTab({
  groupId,
  sessions,
  onAdd,
  onRsvp,
  isAdminOrMod,
  isMember,
}) {
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    duration: '60',
    location: '',
    recurring: 'none',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleAddClick = () => {
    setFormData({
      title: '',
      description: '',
      date: '',
      time: '',
      duration: '60',
      location: '',
      recurring: 'none',
    })
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

    if (!formData.date) {
      setError('Date is required')
      return
    }

    if (!formData.time) {
      setError('Time is required')
      return
    }

    setSubmitting(true)
    try {
      await onAdd({
        ...formData,
        groupId,
      })
      setAddModalOpen(false)
      setFormData({
        title: '',
        description: '',
        date: '',
        time: '',
        duration: '60',
        location: '',
        recurring: 'none',
      })
    } catch (err) {
      setError(err.message || 'Failed to schedule session')
    } finally {
      setSubmitting(false)
    }
  }

  const upcomingSessions = sessions?.filter(s => s.status === 'upcoming') || []
  const completedSessions = sessions?.filter(s => s.status === 'completed') || []

  if (!sessions || (upcomingSessions.length === 0 && completedSessions.length === 0)) {
    return (
      <div style={styles.tabContainer}>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon} aria-label="Calendar icon">Schedule</div>
          <div style={styles.emptyTitle}>No Sessions Scheduled</div>
          <p style={styles.emptyText}>
            {isAdminOrMod
              ? 'Schedule your first group session!'
              : 'No sessions scheduled yet'}
          </p>
          {isAdminOrMod && (
            <button
              onClick={handleAddClick}
              style={{ ...styles.button, ...styles.buttonPrimary, marginTop: 'var(--space-4)' }}
            >
              Schedule Session
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
                aria-labelledby="schedule-session-title-1"
              >
                <h3 style={styles.sectionTitle} id="schedule-session-title-1">Schedule Session</h3>
                {error && <div style={styles.error}>{error}</div>}
                <form onSubmit={handleSubmit}>
                  <div style={styles.formGroup}>
                    <label htmlFor="session-title" style={styles.label}>
                      Title
                    </label>
                    <input
                      id="session-title"
                      type="text"
                      style={styles.input}
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      maxLength={100}
                      placeholder="Session title"
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label htmlFor="session-description" style={styles.label}>
                      Description
                    </label>
                    <textarea
                      id="session-description"
                      style={styles.textarea}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      maxLength={500}
                      placeholder="What will you discuss?"
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                    <div style={styles.formGroup}>
                      <label htmlFor="session-date" style={styles.label}>
                        Date
                      </label>
                      <input
                        id="session-date"
                        type="date"
                        style={styles.input}
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label htmlFor="session-time" style={styles.label}>
                        Time
                      </label>
                      <input
                        id="session-time"
                        type="time"
                        style={styles.input}
                        value={formData.time}
                        onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                    <div style={styles.formGroup}>
                      <label htmlFor="session-duration" style={styles.label}>
                        Duration (minutes)
                      </label>
                      <input
                        id="session-duration"
                        type="number"
                        style={styles.input}
                        value={formData.duration}
                        onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                        min="15"
                        max="480"
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label htmlFor="session-recurring" style={styles.label}>
                        Recurring
                      </label>
                      <select
                        id="session-recurring"
                        style={styles.select}
                        value={formData.recurring}
                        onChange={(e) => setFormData({ ...formData, recurring: e.target.value })}
                      >
                        <option value="none">None</option>
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Bi-weekly</option>
                      </select>
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label htmlFor="session-location" style={styles.label}>
                      Location
                    </label>
                    <input
                      id="session-location"
                      type="text"
                      style={styles.input}
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="Physical or virtual location"
                    />
                  </div>

                  <div style={styles.formActions}>
                    <button
                      type="button"
                      onClick={() => setAddModalOpen(false)}
                      style={{ ...styles.button, ...styles.buttonSecondary }}
                      aria-label="Close Schedule Session dialog"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      style={{ ...styles.button, ...styles.buttonPrimary }}
                    >
                      {submitting ? 'Scheduling...' : 'Schedule Session'}
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
      {isAdminOrMod && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <button
            onClick={handleAddClick}
            style={{ ...styles.button, ...styles.buttonPrimary }}
            aria-label="Schedule a new session"
          >
            Schedule Session
          </button>
        </div>
      )}

      {upcomingSessions.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Upcoming</h2>
          {upcomingSessions.map((session) => (
            <div key={session.id} style={styles.sessionCard}>
              <div style={styles.sessionHeader}>
                <div>
                  <div style={styles.sessionTitle}>{session.title}</div>
                  <div style={styles.sessionDetails}>
                    <span>{formatSessionTime(session.scheduledAt)}</span>
                    <span>{session.location || 'No location specified'}</span>
                    <span>Duration: {formatDuration(parseInt(session.durationMins || session.duration, 10))}</span>
                    <span>{session.rsvpCount || 0} going{session.rsvpMaybeCount ? `, ${session.rsvpMaybeCount} maybe` : ''}</span>
                  </div>
                </div>
                <span style={styles.badge}>{getSessionStatusLabel(session.status)}</span>
              </div>

              {isMember && (
                <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)' }}>
                  {['going', 'maybe', 'not_going'].map((status) => {
                    const isSelected = session.userRsvpStatus === status
                    const label = status === 'not_going' ? 'Not Going' : status.charAt(0).toUpperCase() + status.slice(1)
                    return (
                      <button
                        key={status}
                        onClick={() => onRsvp(session.id, status)}
                        style={{
                          ...styles.button,
                          ...styles.buttonSmall,
                          ...(isSelected
                            ? { backgroundColor: 'var(--sh-brand)', color: 'white', border: '1px solid var(--sh-brand)' }
                            : styles.buttonSecondary),
                        }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {completedSessions.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Completed</h2>
          {completedSessions.map((session) => (
            <div key={session.id} style={styles.sessionCard}>
              <div style={styles.sessionHeader}>
                <div>
                  <div style={styles.sessionTitle}>{session.title}</div>
                  <div style={styles.sessionDetails}>
                    <span>{formatSessionTime(session.scheduledAt)}</span>
                    <span>{session.location || 'No location specified'}</span>
                  </div>
                </div>
                <span style={styles.badge}>{getSessionStatusLabel(session.status)}</span>
              </div>
            </div>
          ))}
        </section>
      )}

      {createPortal(
        addModalOpen && (
          <div style={styles.modalOverlay} onClick={() => setAddModalOpen(false)}>
            <div
              style={styles.modalContent}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="schedule-session-title-2"
            >
              <h3 style={styles.sectionTitle} id="schedule-session-title-2">Schedule Session</h3>
              {error && <div style={styles.error}>{error}</div>}
              <form onSubmit={handleSubmit}>
                <div style={styles.formGroup}>
                  <label htmlFor="session-title" style={styles.label}>
                    Title
                  </label>
                  <input
                    id="session-title"
                    type="text"
                    style={styles.input}
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    maxLength={100}
                    placeholder="Session title"
                  />
                </div>

                <div style={styles.formGroup}>
                  <label htmlFor="session-description" style={styles.label}>
                    Description
                  </label>
                  <textarea
                    id="session-description"
                    style={styles.textarea}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    maxLength={500}
                    placeholder="What will you discuss?"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div style={styles.formGroup}>
                    <label htmlFor="session-date" style={styles.label}>
                      Date
                    </label>
                    <input
                      id="session-date"
                      type="date"
                      style={styles.input}
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label htmlFor="session-time" style={styles.label}>
                      Time
                    </label>
                    <input
                      id="session-time"
                      type="time"
                      style={styles.input}
                      value={formData.time}
                      onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div style={styles.formGroup}>
                    <label htmlFor="session-duration" style={styles.label}>
                      Duration (minutes)
                    </label>
                    <input
                      id="session-duration"
                      type="number"
                      style={styles.input}
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                      min="15"
                      max="480"
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label htmlFor="session-recurring" style={styles.label}>
                      Recurring
                    </label>
                    <select
                      id="session-recurring"
                      style={styles.select}
                      value={formData.recurring}
                      onChange={(e) => setFormData({ ...formData, recurring: e.target.value })}
                    >
                      <option value="none">None</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Bi-weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label htmlFor="session-location" style={styles.label}>
                    Location
                  </label>
                  <input
                    id="session-location"
                    type="text"
                    style={styles.input}
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Physical or virtual location"
                  />
                </div>

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
                    {submitting ? 'Scheduling...' : 'Schedule Session'}
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

/* ═══════════════════════════════════════════════════════════════════════════
   Tab 4: GroupDiscussionsTab
═══════════════════════════════════════════════════════════════════════════ */
export function GroupDiscussionsTab({
  groupId,
  discussions,
  onCreatePost,
  onDeletePost,
  onAddReply,
  onResolve,
  onUpvote,
  isAdminOrMod,
  isMember,
  userId,
}) {
  const [newPostModalOpen, setNewPostModalOpen] = useState(false)
  const [expandedPostId, setExpandedPostId] = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'discussion',
  })
  const [replyFormData, setReplyFormData] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleCreateClick = () => {
    setFormData({ title: '', content: '', type: 'discussion' })
    setError('')
    setNewPostModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!formData.title.trim()) {
      setError('Title is required')
      return
    }

    if (!formData.content.trim()) {
      setError('Content is required')
      return
    }

    setSubmitting(true)
    try {
      await onCreatePost({
        ...formData,
        groupId,
      })
      setNewPostModalOpen(false)
      setFormData({ title: '', content: '', type: 'discussion' })
    } catch (err) {
      setError(err.message || 'Failed to create post')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReplySubmit = async (postId, e) => {
    e.preventDefault()
    setError('')

    const content = replyFormData[postId]?.trim()
    if (!content) {
      setError('Reply cannot be empty')
      return
    }

    try {
      await onAddReply(postId, { content })
      setReplyFormData({ ...replyFormData, [postId]: '' })
    } catch (err) {
      setError(err.message || 'Failed to add reply')
    }
  }

  const filteredDiscussions = typeFilter === 'all'
    ? discussions || []
    : (discussions || []).filter(d => d.type === typeFilter)

  const pinnedDiscussions = filteredDiscussions.filter(d => d.isPinned)
  const regularDiscussions = filteredDiscussions.filter(d => !d.isPinned)

  if (!discussions || discussions.length === 0) {
    return (
      <div style={styles.tabContainer}>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon} aria-label="Comments icon">Discussions</div>
          <div style={styles.emptyTitle}>No Discussions Yet</div>
          <p style={styles.emptyText}>
            {isMember
              ? 'Start the conversation!'
              : 'Join the group to participate'}
          </p>
          {isMember && (
            <button
              onClick={handleCreateClick}
              style={{ ...styles.button, ...styles.buttonPrimary, marginTop: 'var(--space-4)' }}
            >
              New Post
            </button>
          )}
        </div>
        {createPortal(
          newPostModalOpen && (
            <div style={styles.modalOverlay} onClick={() => setNewPostModalOpen(false)}>
              <div
                style={styles.modalContent}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="new-post-title"
              >
                <h3 style={styles.sectionTitle} id="new-post-title">New Discussion Post</h3>
                {error && <div style={styles.error}>{error}</div>}
                <form onSubmit={handleSubmit}>
                  <div style={styles.formGroup}>
                    <label htmlFor="post-title" style={styles.label}>
                      Title
                    </label>
                    <input
                      id="post-title"
                      type="text"
                      style={styles.input}
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      maxLength={150}
                      placeholder="Discussion title"
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label htmlFor="post-type" style={styles.label}>
                      Type
                    </label>
                    <select
                      id="post-type"
                      style={styles.select}
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    >
                      <option value="discussion">Discussion</option>
                      <option value="question">Question</option>
                      <option value="announcement">Announcement</option>
                    </select>
                  </div>

                  <div style={styles.formGroup}>
                    <label htmlFor="post-content" style={styles.label}>
                      Content
                    </label>
                    <textarea
                      id="post-content"
                      style={styles.textarea}
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      maxLength={5000}
                      placeholder="Write your post..."
                    />
                  </div>

                  <div style={styles.formActions}>
                    <button
                      type="button"
                      onClick={() => setNewPostModalOpen(false)}
                      style={{ ...styles.button, ...styles.buttonSecondary }}
                      aria-label="Close New Post dialog"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      style={{ ...styles.button, ...styles.buttonPrimary }}
                    >
                      {submitting ? 'Posting...' : 'Post'}
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
            onClick={handleCreateClick}
            style={{ ...styles.button, ...styles.buttonPrimary }}
            aria-label="Create new discussion post"
          >
            New Post
          </button>
        </div>
      )}

      <div style={styles.filterTabs}>
        {['all', 'discussion', 'question', 'announcement'].map((type) => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            style={{
              ...styles.filterTab,
              ...(typeFilter === type ? styles.filterTabActive : {}),
            }}
          >
            {type === 'all' ? 'All Posts' : getPostTypeLabel(type)}
          </button>
        ))}
      </div>

      <div style={styles.section}>
        {pinnedDiscussions.length > 0 && (
          <>
            <h3 style={{ ...styles.sectionTitle, marginBottom: 'var(--space-3)' }}>Pinned</h3>
            {pinnedDiscussions.map((post) => (
              <DiscussionPostItem
                key={post.id}
                post={post}
                expanded={expandedPostId === post.id}
                onToggleExpanded={() =>
                  setExpandedPostId(expandedPostId === post.id ? null : post.id)
                }
                onReplySubmit={handleReplySubmit}
                onResolve={onResolve}
                onDelete={onDeletePost}
                onUpvote={onUpvote}
                replyFormData={replyFormData}
                setReplyFormData={setReplyFormData}
                isAdminOrMod={isAdminOrMod}
                userId={userId}
              />
            ))}
          </>
        )}

        {regularDiscussions.length > 0 && (
          <>
            {pinnedDiscussions.length > 0 && (
              <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                <hr style={{ border: 'none', borderTop: `1px solid var(--sh-border)` }} />
              </div>
            )}
            {regularDiscussions.map((post) => (
              <DiscussionPostItem
                key={post.id}
                post={post}
                expanded={expandedPostId === post.id}
                onToggleExpanded={() =>
                  setExpandedPostId(expandedPostId === post.id ? null : post.id)
                }
                onReplySubmit={handleReplySubmit}
                onResolve={onResolve}
                onDelete={onDeletePost}
                onUpvote={onUpvote}
                replyFormData={replyFormData}
                setReplyFormData={setReplyFormData}
                isAdminOrMod={isAdminOrMod}
                userId={userId}
              />
            ))}
          </>
        )}
      </div>

      {createPortal(
        newPostModalOpen && (
          <div style={styles.modalOverlay} onClick={() => setNewPostModalOpen(false)}>
            <div
              style={styles.modalContent}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={styles.sectionTitle}>New Discussion Post</h3>
              {error && <div style={styles.error}>{error}</div>}
              <form onSubmit={handleSubmit}>
                <div style={styles.formGroup}>
                  <label htmlFor="post-title" style={styles.label}>
                    Title
                  </label>
                  <input
                    id="post-title"
                    type="text"
                    style={styles.input}
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    maxLength={150}
                    placeholder="Discussion title"
                  />
                </div>

                <div style={styles.formGroup}>
                  <label htmlFor="post-type" style={styles.label}>
                    Type
                  </label>
                  <select
                    id="post-type"
                    style={styles.select}
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  >
                    <option value="discussion">Discussion</option>
                    <option value="question">Question</option>
                    <option value="announcement">Announcement</option>
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label htmlFor="post-content" style={styles.label}>
                    Content
                  </label>
                  <textarea
                    id="post-content"
                    style={styles.textarea}
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    maxLength={5000}
                    placeholder="Write your post..."
                  />
                </div>

                <div style={styles.formActions}>
                  <button
                    type="button"
                    onClick={() => setNewPostModalOpen(false)}
                    style={{ ...styles.button, ...styles.buttonSecondary }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{ ...styles.button, ...styles.buttonPrimary }}
                  >
                    {submitting ? 'Posting...' : 'Post'}
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

function DiscussionPostItem({
  post,
  expanded,
  onToggleExpanded,
  onReplySubmit,
  onResolve,
  onDelete,
  onUpvote,
  replyFormData,
  setReplyFormData,
  isAdminOrMod,
  userId,
}) {
  const isAuthor = post.userId === userId || post.authorId === userId
  const authorName = post.author?.username || post.authorName || 'Unknown'
  const isResolved = post.resolved || post.isResolved
  const badgeStyle = post.type === 'question'
    ? styles.badgeOrange
    : post.type === 'announcement'
      ? styles.badgeRed
      : {}

  return (
    <div
      key={post.id}
      style={{
        ...styles.discussionPost,
        marginBottom: 'var(--space-3)',
      }}
      onClick={onToggleExpanded}
    >
      <div style={styles.discussionHeader}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
            <div style={styles.discussionTitle}>{post.title}</div>
            {isResolved && post.type === 'question' && (
              <span style={{ ...styles.badge, ...styles.badgeGreen }}>
                Resolved
              </span>
            )}
            <span style={{ ...styles.badge, ...badgeStyle }}>
              {getPostTypeLabel(post.type)}
            </span>
          </div>
        </div>

        {/* Upvote button */}
        {onUpvote && (
          <button
            onClick={(e) => { e.stopPropagation(); onUpvote(post.id) }}
            style={{
              background: 'none', border: '1px solid var(--sh-border)',
              borderRadius: 'var(--radius-control)', padding: '4px 10px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              color: post.userHasUpvoted ? 'var(--sh-brand)' : 'var(--sh-muted)',
              fontFamily: 'inherit', fontSize: 'var(--type-xs)', fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={post.userHasUpvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            {post.upvoteCount || 0}
          </button>
        )}
      </div>

      <div style={styles.discussionMeta}>
        {post.author?.avatarUrl ? (
          <img src={post.author.avatarUrl} alt="" style={{ width: 16, height: 16, borderRadius: '50%', verticalAlign: 'middle' }} />
        ) : null}
        <span>{authorName}</span>
        <span> -- {formatRelativeTime(post.createdAt)}</span>
        <span> -- {post.replyCount || 0} replies</span>
        {(post.upvoteCount || 0) > 0 && <span> -- {post.upvoteCount} upvote{post.upvoteCount !== 1 ? 's' : ''}</span>}
      </div>

      {expanded && (
        <div style={styles.expandedContent} onClick={(e) => e.stopPropagation()}>
          <p style={{ fontSize: 'var(--type-sm)', color: 'var(--sh-text)', lineHeight: '1.6', marginBottom: 'var(--space-4)' }}>
            {post.content}
          </p>

          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
            {(isAuthor || isAdminOrMod) && post.type === 'question' && (
              <button
                onClick={() => onResolve(post.id)}
                style={{
                  ...styles.button,
                  ...styles.buttonSmall,
                  backgroundColor: isResolved ? 'var(--sh-success)' : 'var(--sh-brand)',
                  color: 'white',
                }}
              >
                {isResolved ? 'Marked Resolved' : 'Mark Resolved'}
              </button>
            )}

            {(isAuthor || isAdminOrMod) && (
              <button
                onClick={() => onDelete(post.id)}
                style={{
                  ...styles.button,
                  ...styles.buttonSmall,
                  ...styles.buttonDanger,
                }}
              >
                Delete
              </button>
            )}
          </div>

          {post.replies && post.replies.length > 0 && (
            <div style={styles.repliesList}>
              {post.replies.map((reply) => (
                <div key={reply.id} style={styles.reply}>
                  <div style={styles.replyAuthor}>{reply.author?.username || reply.authorName || 'Unknown'}</div>
                  <div style={styles.replyContent}>{reply.content}</div>
                  <div style={styles.replyTime}>{formatRelativeTime(reply.createdAt)}</div>
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => onReplySubmit(post.id, e)}
            style={{ marginTop: 'var(--space-4)' }}
          >
            <div style={styles.formGroup}>
              <textarea
                style={styles.textarea}
                value={replyFormData[post.id] || ''}
                onChange={(e) =>
                  setReplyFormData({ ...replyFormData, [post.id]: e.target.value })
                }
                maxLength={1000}
                placeholder="Write a reply..."
              />
            </div>
            <button
              type="submit"
              style={{ ...styles.button, ...styles.buttonPrimary, ...styles.buttonSmall }}
            >
              Reply
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Tab 5: GroupMembersTab
═══════════════════════════════════════════════════════════════════════════ */
export function GroupMembersTab({
  groupId,
  members,
  onUpdateMember,
  onRemoveMember,
  onInvite,
  isAdmin,
  currentUserId,
}) {
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [formData, setFormData] = useState({ username: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')

  const handleInviteClick = () => {
    setFormData({ username: '' })
    setError('')
    setInviteModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!formData.username.trim()) {
      setError('Username is required')
      return
    }

    setSubmitting(true)
    try {
      await onInvite({
        username: formData.username.trim(),
        groupId,
      })
      setInviteModalOpen(false)
      setFormData({ username: '' })
    } catch (err) {
      setError(err.message || 'Failed to invite member')
    } finally {
      setSubmitting(false)
    }
  }

  if (!members || members.length === 0) {
    return (
      <div style={styles.tabContainer}>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon} aria-label="People icon">Members</div>
          <div style={styles.emptyTitle}>No Members</div>
          <p style={styles.emptyText}>
            {isAdmin ? 'Invite your first member!' : 'No members yet'}
          </p>
          {isAdmin && (
            <button
              onClick={handleInviteClick}
              style={{ ...styles.button, ...styles.buttonPrimary, marginTop: 'var(--space-4)' }}
              aria-label="Invite a new member to the group"
            >
              Invite Member
            </button>
          )}
        </div>
        {createPortal(
          inviteModalOpen && (
            <div style={styles.modalOverlay} onClick={() => setInviteModalOpen(false)}>
              <div
                style={styles.modalContent}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="invite-member-title"
              >
                <h3 style={styles.sectionTitle} id="invite-member-title">Invite Member</h3>
                {error && <div style={styles.error}>{error}</div>}
                <form onSubmit={handleSubmit}>
                  <div style={styles.formGroup}>
                    <label htmlFor="username" style={styles.label}>
                      Username
                    </label>
                    <input
                      id="username"
                      type="text"
                      style={styles.input}
                      value={formData.username}
                      onChange={(e) => setFormData({ username: e.target.value })}
                      placeholder="Enter username"
                    />
                  </div>

                  <div style={styles.formActions}>
                    <button
                      type="button"
                      onClick={() => setInviteModalOpen(false)}
                      style={{ ...styles.button, ...styles.buttonSecondary }}
                      aria-label="Close Invite Member dialog"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      style={{ ...styles.button, ...styles.buttonPrimary }}
                    >
                      {submitting ? 'Inviting...' : 'Invite'}
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

  const filteredMembers = memberSearch.trim()
    ? members.filter((m) => (m.username || '').toLowerCase().includes(memberSearch.toLowerCase()))
    : members

  // Group by role for nicer display
  const adminMembers = filteredMembers.filter((m) => m.role === 'admin')
  const modMembers = filteredMembers.filter((m) => m.role === 'moderator')
  const regularMembers = filteredMembers.filter((m) => m.role === 'member')

  return (
    <div style={styles.tabContainer}>
      {/* Top bar: invite + search */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
        {isAdmin && (
          <button
            onClick={handleInviteClick}
            style={{ ...styles.button, ...styles.buttonPrimary }}
            aria-label="Invite a new member to the group"
          >
            Invite Member
          </button>
        )}
        <input
          type="text"
          placeholder="Search members..."
          value={memberSearch}
          onChange={(e) => setMemberSearch(e.target.value)}
          style={{ ...styles.input, flex: 1, minWidth: 160, maxWidth: 280 }}
        />
        <span style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-muted)' }}>
          {members.length} member{members.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={styles.section}>
        {[
          { label: 'Admins', list: adminMembers },
          { label: 'Moderators', list: modMembers },
          { label: 'Members', list: regularMembers },
        ].filter((g) => g.list.length > 0).map((group) => (
          <div key={group.label} style={{ marginBottom: 'var(--space-4)' }}>
            <h3 style={{ fontSize: 'var(--type-sm)', fontWeight: 600, color: 'var(--sh-muted)', marginBottom: 'var(--space-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {group.label} ({group.list.length})
            </h3>
            <div style={styles.memberGrid}>
              {group.list.map((member) => {
                const statusBadge = member.status === 'invited'
                  ? { label: 'Invited', style: styles.badgeOrange }
                  : member.status === 'pending'
                    ? { label: 'Pending', style: styles.badgeOrange }
                    : member.status === 'banned'
                      ? { label: 'Banned', style: styles.badgeRed }
                      : null

                return (
                  <div key={member.id || member.userId} style={styles.memberCard}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-2)' }}>
                      <UserAvatar username={member.username || 'User'} avatarUrl={member.avatarUrl || member.user?.avatarUrl} size={48} />
                    </div>
                    <div style={styles.memberName}>{member.username || member.user?.username || 'Unknown'}</div>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                      <span style={{ ...styles.badge, display: 'inline-block' }}>
                        {getRoleLabel(member.role)}
                      </span>
                      {statusBadge && (
                        <span style={{ ...styles.badge, ...statusBadge.style, display: 'inline-block' }}>
                          {statusBadge.label}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-muted)', marginBottom: 'var(--space-2)' }}>
                      Joined {formatRelativeTime(member.joinedAt)}
                    </div>

                    {isAdmin && (member.id || member.userId) !== currentUserId && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        <select
                          value={member.role}
                          onChange={(e) => onUpdateMember(member.id || member.userId, { role: e.target.value })}
                          style={{
                            ...styles.select,
                            fontSize: 'var(--type-xs)',
                            padding: '0.375rem',
                          }}
                        >
                          <option value="member">Member</option>
                          <option value="moderator">Moderator</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button
                          onClick={() => {
                            if (window.confirm('Remove this member?')) {
                              onRemoveMember(member.id || member.userId)
                            }
                          }}
                          style={{
                            ...styles.button,
                            ...styles.buttonDanger,
                            ...styles.buttonSmall,
                            fontSize: 'var(--type-xs)',
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {filteredMembers.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyText}>No members match your search.</div>
          </div>
        )}
      </div>

      {createPortal(
        inviteModalOpen && (
          <div style={styles.modalOverlay} onClick={() => setInviteModalOpen(false)}>
            <div
              style={styles.modalContent}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="invite-member-title-2"
            >
              <h3 style={styles.sectionTitle} id="invite-member-title-2">Invite Member</h3>
              {error && <div style={styles.error}>{error}</div>}
              <form onSubmit={handleSubmit}>
                <div style={styles.formGroup}>
                  <label htmlFor="username" style={styles.label}>
                    Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    style={styles.input}
                    value={formData.username}
                    onChange={(e) => setFormData({ username: e.target.value })}
                    placeholder="Enter username"
                  />
                </div>

                <div style={styles.formActions}>
                  <button
                    type="button"
                    onClick={() => setInviteModalOpen(false)}
                    style={{ ...styles.button, ...styles.buttonSecondary }}
                    aria-label="Close Invite Member dialog"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{ ...styles.button, ...styles.buttonPrimary }}
                  >
                    {submitting ? 'Inviting...' : 'Invite'}
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
