import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import UserAvatar from '../../components/UserAvatar'
import { formatRelativeTime, getRoleLabel } from './studyGroupsHelpers'
import { styles } from './GroupDetailTabs.styles'

/* ── Mute duration options ─────────────────────────────────────────────── */
const MUTE_DURATIONS = [
  { value: 1, label: '1 day' },
  { value: 3, label: '3 days' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
]

/* ── Small "Muted" badge shown on muted member cards ───────────────────── */
function MutedBadge({ mutedUntil }) {
  if (!mutedUntil) return null
  const until = new Date(mutedUntil)
  if (until <= new Date()) return null
  return (
    <span style={{ ...styles.badge, ...styles.badgeOrange, display: 'inline-block' }}>
      Muted until {until.toLocaleDateString()}
    </span>
  )
}

/* ── Confirmation modal shared by block and mute actions ───────────────── */
function ActionModal({
  title,
  description,
  onConfirm,
  onCancel,
  confirmLabel,
  confirmDanger,
  children,
}) {
  return createPortal(
    <div style={styles.modalOverlay} onClick={onCancel}>
      <div
        style={styles.modalContent}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3 style={styles.sectionTitle}>{title}</h3>
        {description && (
          <p
            style={{
              fontSize: 'var(--type-sm)',
              color: 'var(--sh-subtext)',
              marginBottom: 'var(--space-4)',
            }}
          >
            {description}
          </p>
        )}
        {children}
        <div style={styles.formActions}>
          <button
            type="button"
            onClick={onCancel}
            style={{ ...styles.button, ...styles.buttonSecondary }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              ...styles.button,
              ...(confirmDanger ? styles.buttonDanger : styles.buttonPrimary),
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function GroupMembersTab({
  // groupId passed by parent but not needed directly (callbacks are pre-bound)
  members,
  onUpdateMember,
  onRemoveMember,
  onInvite,
  onBlock,
  onUnblock,
  onMute,
  onUnmute,
  blockedUsers,
  blockedLoading,
  onLoadBlocked,
  isAdmin,
  isAdminOrMod,
  viewerRole,
  currentUserId,
}) {
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [formData, setFormData] = useState({ username: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')

  // Block modal state
  const [blockTarget, setBlockTarget] = useState(null)
  const [blockReason, setBlockReason] = useState('')

  // Mute modal state
  const [muteTarget, setMuteTarget] = useState(null)
  const [muteDays, setMuteDays] = useState(7)
  const [muteReason, setMuteReason] = useState('')

  // Blocked users sub-section
  const [showBlocked, setShowBlocked] = useState(false)

  // Load blocked users when admin/mod opens the section
  useEffect(() => {
    if (showBlocked && isAdminOrMod && onLoadBlocked) {
      onLoadBlocked()
    }
  }, [showBlocked, isAdminOrMod, onLoadBlocked])

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
      })
      setInviteModalOpen(false)
      setFormData({ username: '' })
    } catch (err) {
      setError(err.message || 'Failed to invite member')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBlockConfirm = useCallback(async () => {
    if (!blockTarget || !onBlock) return
    try {
      await onBlock(blockTarget.userId, blockReason)
    } catch {
      // Toast already shown by hook
    }
    setBlockTarget(null)
    setBlockReason('')
  }, [blockTarget, blockReason, onBlock])

  const handleMuteConfirm = useCallback(async () => {
    if (!muteTarget || !onMute) return
    try {
      await onMute(muteTarget.userId, muteDays, muteReason)
    } catch {
      // Toast already shown by hook
    }
    setMuteTarget(null)
    setMuteDays(7)
    setMuteReason('')
  }, [muteTarget, muteDays, muteReason, onMute])

  const handleUnblock = useCallback(
    async (userId) => {
      if (!onUnblock) return
      if (!window.confirm('Unblock this user? They will be able to rejoin the group.')) return
      try {
        await onUnblock(userId)
        // Reload blocked list
        if (onLoadBlocked) onLoadBlocked()
      } catch {
        // Toast already shown by hook
      }
    },
    [onUnblock, onLoadBlocked],
  )

  const handleUnmute = useCallback(
    async (userId) => {
      if (!onUnmute) return
      try {
        await onUnmute(userId)
      } catch {
        // Toast already shown by hook
      }
    },
    [onUnmute],
  )

  const isMuted = (member) => {
    if (!member.mutedUntil) return false
    return new Date(member.mutedUntil) > new Date()
  }

  if (!members || members.length === 0) {
    return (
      <div style={styles.tabContainer}>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon} aria-label="People icon">
            Members
          </div>
          <div style={styles.emptyTitle}>No Members</div>
          <p style={styles.emptyText}>
            {isAdminOrMod ? 'Invite your first member!' : 'No members yet'}
          </p>
          {isAdminOrMod && (
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
                <h3 style={styles.sectionTitle} id="invite-member-title">
                  Invite Member
                </h3>
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
          document.body,
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
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {isAdminOrMod && (
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
        ]
          .filter((g) => g.list.length > 0)
          .map((group) => (
            <div key={group.label} style={{ marginBottom: 'var(--space-4)' }}>
              <h3
                style={{
                  fontSize: 'var(--type-sm)',
                  fontWeight: 600,
                  color: 'var(--sh-muted)',
                  marginBottom: 'var(--space-3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {group.label} ({group.list.length})
              </h3>
              <div style={styles.memberGrid}>
                {group.list.map((member) => {
                  const canUpdateRole = isAdmin && member.userId !== currentUserId
                  const canApproveMember = isAdmin && member.status === 'pending'
                  const canRemoveMember =
                    isAdminOrMod &&
                    member.userId !== currentUserId &&
                    !(viewerRole === 'moderator' && member.role === 'admin')
                  const canModerate =
                    isAdminOrMod && member.userId !== currentUserId && member.role !== 'admin'
                  const statusBadge =
                    member.status === 'invited'
                      ? { label: 'Invited', style: styles.badgeOrange }
                      : member.status === 'pending'
                        ? { label: 'Pending', style: styles.badgeOrange }
                        : member.status === 'banned'
                          ? { label: 'Banned', style: styles.badgeRed }
                          : null

                  return (
                    <div key={member.id || member.userId} style={styles.memberCard}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'center',
                          marginBottom: 'var(--space-2)',
                        }}
                      >
                        <UserAvatar
                          username={member.username || 'User'}
                          avatarUrl={member.avatarUrl || member.user?.avatarUrl}
                          size={48}
                        />
                      </div>
                      <div style={styles.memberName}>
                        {member.username || member.user?.username || 'Unknown'}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: 4,
                          justifyContent: 'center',
                          flexWrap: 'wrap',
                          marginBottom: 'var(--space-2)',
                        }}
                      >
                        <span style={{ ...styles.badge, display: 'inline-block' }}>
                          {getRoleLabel(member.role)}
                        </span>
                        {statusBadge && (
                          <span
                            style={{
                              ...styles.badge,
                              ...statusBadge.style,
                              display: 'inline-block',
                            }}
                          >
                            {statusBadge.label}
                          </span>
                        )}
                        <MutedBadge mutedUntil={member.mutedUntil} />
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--type-xs)',
                          color: 'var(--sh-muted)',
                          marginBottom: 'var(--space-2)',
                        }}
                      >
                        Joined {formatRelativeTime(member.joinedAt)}
                      </div>

                      {(canUpdateRole || canApproveMember || canRemoveMember || canModerate) && (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'var(--space-2)',
                          }}
                        >
                          {canUpdateRole ? (
                            <select
                              value={member.role}
                              onChange={(e) =>
                                onUpdateMember(member.userId, { role: e.target.value })
                              }
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
                          ) : null}
                          {canApproveMember ? (
                            <button
                              onClick={() => onUpdateMember(member.userId, { status: 'active' })}
                              style={{
                                ...styles.button,
                                ...styles.buttonPrimary,
                                ...styles.buttonSmall,
                                fontSize: 'var(--type-xs)',
                              }}
                            >
                              Approve
                            </button>
                          ) : null}

                          {/* Mute / Unmute button */}
                          {canModerate && member.status === 'active' ? (
                            isMuted(member) ? (
                              <button
                                onClick={() => handleUnmute(member.userId)}
                                style={{
                                  ...styles.button,
                                  ...styles.buttonSecondary,
                                  ...styles.buttonSmall,
                                  fontSize: 'var(--type-xs)',
                                }}
                              >
                                Unmute
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setMuteTarget(member)
                                  setMuteDays(7)
                                  setMuteReason('')
                                }}
                                style={{
                                  ...styles.button,
                                  ...styles.buttonSecondary,
                                  ...styles.buttonSmall,
                                  fontSize: 'var(--type-xs)',
                                  borderColor: 'var(--sh-warning-border)',
                                  color: 'var(--sh-warning-text)',
                                }}
                              >
                                Mute
                              </button>
                            )
                          ) : null}

                          {/* Block button */}
                          {canModerate ? (
                            <button
                              onClick={() => {
                                setBlockTarget(member)
                                setBlockReason('')
                              }}
                              style={{
                                ...styles.button,
                                ...styles.buttonDanger,
                                ...styles.buttonSmall,
                                fontSize: 'var(--type-xs)',
                              }}
                            >
                              Block
                            </button>
                          ) : null}

                          {canRemoveMember ? (
                            <button
                              onClick={() => {
                                if (window.confirm('Remove this member?')) {
                                  onRemoveMember(member.userId)
                                }
                              }}
                              style={{
                                ...styles.button,
                                ...styles.buttonSmall,
                                fontSize: 'var(--type-xs)',
                                backgroundColor: 'transparent',
                                color: 'var(--sh-muted)',
                                border: '1px solid var(--sh-border)',
                              }}
                            >
                              Remove
                            </button>
                          ) : null}
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

      {/* Blocked Users sub-section (admin/mod only) */}
      {isAdminOrMod && (
        <div style={{ ...styles.section, marginTop: 'var(--space-4)' }}>
          <button
            type="button"
            onClick={() => setShowBlocked((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              width: '100%',
              padding: 0,
              fontFamily: 'inherit',
            }}
          >
            <h3
              style={{
                fontSize: 'var(--type-sm)',
                fontWeight: 600,
                color: 'var(--sh-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                margin: 0,
              }}
            >
              {showBlocked ? '\u25BE' : '\u25B8'} Blocked Users
              {blockedUsers && blockedUsers.length > 0 ? ` (${blockedUsers.length})` : ''}
            </h3>
          </button>

          {showBlocked && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              {blockedLoading && (
                <div style={{ fontSize: 'var(--type-sm)', color: 'var(--sh-muted)' }}>
                  Loading...
                </div>
              )}
              {!blockedLoading && (!blockedUsers || blockedUsers.length === 0) && (
                <div style={{ fontSize: 'var(--type-sm)', color: 'var(--sh-muted)' }}>
                  No blocked users.
                </div>
              )}
              {!blockedLoading && blockedUsers && blockedUsers.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {blockedUsers.map((block) => (
                    <div
                      key={block.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        padding: 'var(--space-3)',
                        backgroundColor: 'var(--sh-soft)',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--sh-border)',
                      }}
                    >
                      <UserAvatar
                        username={block.user?.username || 'User'}
                        avatarUrl={block.user?.avatarUrl}
                        size={36}
                      />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 'var(--type-sm)',
                            fontWeight: 500,
                            color: 'var(--sh-heading)',
                          }}
                        >
                          {block.user?.username || 'Unknown'}
                        </div>
                        <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-muted)' }}>
                          Blocked {formatRelativeTime(block.createdAt)}
                          {block.blockedBy?.username ? ` by ${block.blockedBy.username}` : ''}
                          {block.reason ? ` -- ${block.reason}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnblock(block.userId)}
                        style={{
                          ...styles.button,
                          ...styles.buttonSecondary,
                          ...styles.buttonSmall,
                          fontSize: 'var(--type-xs)',
                          flexShrink: 0,
                        }}
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Block confirmation modal */}
      {blockTarget && (
        <ActionModal
          title={`Block ${blockTarget.username || 'this user'}?`}
          description="This will remove them from the group and prevent them from rejoining. You can unblock them later."
          confirmLabel="Block"
          confirmDanger
          onCancel={() => {
            setBlockTarget(null)
            setBlockReason('')
          }}
          onConfirm={handleBlockConfirm}
        >
          <div style={styles.formGroup}>
            <label style={styles.label}>Reason (optional)</label>
            <textarea
              style={styles.textarea}
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Why is this user being blocked?"
              maxLength={500}
              rows={3}
            />
          </div>
        </ActionModal>
      )}

      {/* Mute modal with duration picker */}
      {muteTarget && (
        <ActionModal
          title={`Mute ${muteTarget.username || 'this user'}?`}
          description="Muted users can still read group content but cannot post, reply, or upload until the mute expires."
          confirmLabel={`Mute for ${MUTE_DURATIONS.find((d) => d.value === muteDays)?.label || muteDays + ' days'}`}
          confirmDanger={false}
          onCancel={() => {
            setMuteTarget(null)
            setMuteReason('')
          }}
          onConfirm={handleMuteConfirm}
        >
          <div style={styles.formGroup}>
            <label style={styles.label}>Duration</label>
            <select
              style={styles.select}
              value={muteDays}
              onChange={(e) => setMuteDays(Number(e.target.value))}
            >
              {MUTE_DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Reason (optional)</label>
            <textarea
              style={styles.textarea}
              value={muteReason}
              onChange={(e) => setMuteReason(e.target.value)}
              placeholder="Why is this user being muted?"
              maxLength={500}
              rows={3}
            />
          </div>
        </ActionModal>
      )}

      {/* Invite modal */}
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
              <h3 style={styles.sectionTitle} id="invite-member-title-2">
                Invite Member
              </h3>
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
        document.body,
      )}
    </div>
  )
}
