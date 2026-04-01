import { useState } from 'react'
import { createPortal } from 'react-dom'
import UserAvatar from '../../components/UserAvatar'
import { formatRelativeTime, getRoleLabel } from './studyGroupsHelpers'
import { styles } from './GroupDetailTabs.styles'

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
