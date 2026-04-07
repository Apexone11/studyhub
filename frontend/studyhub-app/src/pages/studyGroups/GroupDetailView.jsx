/* ═══════════════════════════════════════════════════════════════════════════
 * GroupDetailView.jsx — Single group detail view with tabs
 *
 * Displays a single study group with tabs for Overview, Resources, Sessions,
 * Discussions, and Members. Handles editing, deletion, joining, and leaving.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useSession } from '../../lib/session-context'
import { useStudyGroupsData } from './useStudyGroupsData'
import { getPrivacyLabel } from './studyGroupsHelpers'
import {
  GroupOverviewTab,
  GroupResourcesTab,
  GroupSessionsTab,
  GroupDiscussionsTab,
  GroupMembersTab,
} from './GroupDetailTabs'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { PageShell } from '../shared/pageScaffold'
import { EditGroupModal } from './GroupModals'
import { styles } from './studyGroupsStyles'

export default function GroupDetailView({ groupId }) {
  const navigate = useNavigate()
  const { user } = useSession()
  const currentUserId = user?.id || null
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  const {
    activeGroup,
    activeGroupLoading,
    activeGroupError,
    loadGroupDetails,
    updateGroup,
    deleteGroup,
    joinGroup,
    leaveGroup,
    courses: allCourses,
    // Sub-resources
    members,
    membersLoading,
    loadMembers,
    removeMember,
    updateMember,
    inviteMember,
    resources,
    addResource,
    deleteResource,
    sessions,
    sessionsLoading,
    loadSessions,
    createSession,
    rsvpSession,
    discussions,
    discussionsLoading,
    loadDiscussions,
    createPost,
    addReply,
    resolvePost,
    deletePost,
    // Activity + upvotes
    activities,
    activitiesLoading,
    upcomingSessionsPreview,
    loadActivity,
    toggleUpvote,
  } = useStudyGroupsData()

  // Load group details on mount
  useEffect(() => {
    loadGroupDetails(groupId)
  }, [groupId, loadGroupDetails])

  // Load activity when overview tab is active
  useEffect(() => {
    if (activeTab === 'overview' && activeGroup?.isMember) {
      loadActivity(groupId)
    }
  }, [activeTab, activeGroup, groupId, loadActivity])

  // Load members when members tab is active
  useEffect(() => {
    if (activeTab === 'members') {
      loadMembers(groupId)
    }
  }, [activeTab, groupId, loadMembers])

  if (activeGroupLoading) {
    return (
      <PageShell
        nav={<Navbar crumbs={[{ label: 'Study Groups', to: '/study-groups' }]} />}
        sidebar={<AppSidebar />}
      >
        <div style={styles.loadingPlaceholder}>Loading group...</div>
      </PageShell>
    )
  }

  if (activeGroupError) {
    return (
      <PageShell
        nav={<Navbar crumbs={[{ label: 'Study Groups', to: '/study-groups' }]} />}
        sidebar={<AppSidebar />}
      >
        <div style={styles.alert('danger')}>{activeGroupError}</div>
        <Link to="/study-groups" style={styles.backLink}>
          Back to Study Groups
        </Link>
      </PageShell>
    )
  }

  if (!activeGroup) {
    return (
      <PageShell
        nav={<Navbar crumbs={[{ label: 'Study Groups', to: '/study-groups' }]} />}
        sidebar={<AppSidebar />}
      >
        <div style={styles.alert('danger')}>Group not found</div>
        <Link to="/study-groups" style={styles.backLink}>
          Back to Study Groups
        </Link>
      </PageShell>
    )
  }

  const isAdmin = activeGroup.userRole === 'admin'
  const membershipStatus = activeGroup.userMembership?.status || (activeGroup.isMember ? 'active' : null)
  const isMember = membershipStatus === 'active'
  const isPending = membershipStatus === 'pending'
  const isInvited = membershipStatus === 'invited'
  const isAdminOrMod = isAdmin || activeGroup.userRole === 'moderator'

  const handleEdit = async (updates) => {
    try {
      await updateGroup(groupId, updates)
      setEditModalOpen(false)
    } catch {
      // Error shown via toast
    }
  }

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this group? This cannot be undone.')) {
      try {
        await deleteGroup(groupId)
        navigate('/study-groups')
      } catch {
        // Error shown via toast
      }
    }
  }

  const handleJoin = async () => {
    try {
      await joinGroup(groupId)
    } catch {
      // Error shown via toast
    }
  }

  const handleLeave = async () => {
    if (window.confirm('Are you sure you want to leave this group?')) {
      try {
        await leaveGroup(groupId)
        navigate('/study-groups')
      } catch {
        // Error shown via toast
      }
    }
  }

  return (
    <PageShell
      nav={<Navbar crumbs={[{ label: 'Study Groups', to: '/study-groups' }]} />}
      sidebar={<AppSidebar />}
    >
      <div>
        {/* Back link */}
        <Link to="/study-groups" style={styles.backLink}>
          Back to Study Groups
        </Link>

        {/* Group header */}
        <section style={styles.detailHeader}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {/* Group avatar */}
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: activeGroup.avatarUrl
                  ? 'transparent'
                  : 'linear-gradient(135deg, var(--sh-brand), var(--sh-brand-accent))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                overflow: 'hidden',
                border: '2px solid var(--sh-border)',
              }}
            >
              {activeGroup.avatarUrl ? (
                <img
                  src={activeGroup.avatarUrl}
                  alt={activeGroup.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>
                  {activeGroup.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={styles.detailTitle}>{activeGroup.name}</h1>
              <p style={styles.detailDesc}>{activeGroup.description}</p>

              <div style={styles.detailMeta}>
                <span style={styles.privacyBadge}>{getPrivacyLabel(activeGroup.privacy)}</span>
                <span style={styles.memberBadge}>
                  {activeGroup.memberCount}
                  {activeGroup.maxMembers ? `/${activeGroup.maxMembers}` : ''} member
                  {activeGroup.memberCount === 1 ? '' : 's'}
                </span>
                {activeGroup.courseId && (
                  <span style={styles.courseBadge}>{activeGroup.courseName}</span>
                )}
                {activeGroup.createdAt && (
                  <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
                    Created{' '}
                    {new Date(activeGroup.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ ...styles.actionButtons, flexDirection: 'row', flexWrap: 'wrap' }}>
            {!membershipStatus ? (
              <button onClick={handleJoin} style={styles.joinBtn}>
                {activeGroup.privacy === 'private' ? 'Request to Join' : 'Join Group'}
              </button>
            ) : isPending ? (
              <button
                type="button"
                disabled
                style={{ ...styles.joinBtn, opacity: 0.72, cursor: 'not-allowed' }}
              >
                Request Pending
              </button>
            ) : isInvited ? (
              <button onClick={handleJoin} style={styles.joinBtn}>
                Accept Invitation
              </button>
            ) : (
              <>
                {isAdmin && (
                  <button onClick={() => setEditModalOpen(true)} style={styles.editBtn}>
                    Edit Group
                  </button>
                )}
                {isAdmin && (
                  <button onClick={handleDelete} style={styles.deleteBtn}>
                    Delete Group
                  </button>
                )}
                <button onClick={handleLeave} style={styles.leaveBtn}>
                  Leave Group
                </button>
              </>
            )}
          </div>
        </section>

        {/* Tab navigation */}
        <div style={styles.tabBar} role="tablist">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'resources', label: 'Resources', count: activeGroup.resourceCount },
            { key: 'sessions', label: 'Sessions', count: activeGroup.upcomingSessionCount },
            { key: 'discussions', label: 'Discussions', count: activeGroup.discussionCount },
            { key: 'members', label: 'Members', count: activeGroup.memberCount },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                ...styles.tabButton,
                ...(activeTab === tab.key ? styles.tabButtonActive : {}),
              }}
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-current={activeTab === tab.key ? 'page' : undefined}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  style={{
                    marginLeft: 5,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 8,
                    background: activeTab === tab.key ? 'var(--sh-brand)' : 'var(--sh-soft)',
                    color: activeTab === tab.key ? '#fff' : 'var(--sh-muted)',
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={styles.tabContent}>
          {activeTab === 'overview' && (
            <GroupOverviewTab
              group={activeGroup}
              activities={activities}
              activitiesLoading={activitiesLoading}
              upcomingSessions={upcomingSessionsPreview}
              isAdminOrMod={isAdminOrMod}
            />
          )}
          {activeTab === 'resources' && (
            <GroupResourcesTab
              groupId={groupId}
              resources={resources}
              onAdd={(data) => addResource(groupId, data)}
              onDelete={(resourceId) => deleteResource(groupId, resourceId)}
              isAdminOrMod={isAdminOrMod}
              isMember={isMember}
            />
          )}
          {activeTab === 'sessions' && (
            <GroupSessionsTab
              groupId={groupId}
              sessions={sessions}
              loading={sessionsLoading}
              loadSessions={loadSessions}
              onAdd={(data) => createSession(groupId, data)}
              onRsvp={(sessionId, status) => rsvpSession(groupId, sessionId, { status })}
              isAdminOrMod={isAdminOrMod}
              isMember={isMember}
            />
          )}
          {activeTab === 'discussions' && (
            <GroupDiscussionsTab
              groupId={groupId}
              discussions={discussions}
              loading={discussionsLoading}
              loadDiscussions={loadDiscussions}
              onCreatePost={createPost}
              onAddReply={addReply}
              onResolve={resolvePost}
              onDeletePost={deletePost}
              onUpvote={(postId) => toggleUpvote(groupId, postId)}
              isMember={isMember}
              isAdminOrMod={isAdminOrMod}
              userId={currentUserId}
            />
          )}
          {activeTab === 'members' && (
            <GroupMembersTab
              groupId={groupId}
              members={members}
              loading={membersLoading}
              loadMembers={loadMembers}
              onRemoveMember={(userId) => removeMember(groupId, userId)}
              onUpdateMember={(userId, data) => updateMember(groupId, userId, data)}
              onInvite={(data) => inviteMember(groupId, data)}
              isAdmin={isAdmin}
              isAdminOrMod={isAdminOrMod}
              viewerRole={activeGroup.userRole || null}
              currentUserId={currentUserId}
            />
          )}
        </div>
      </div>

      {/* Edit Group Modal */}
      {editModalOpen &&
        createPortal(
          <EditGroupModal
            open={editModalOpen}
            group={activeGroup}
            onClose={() => setEditModalOpen(false)}
            onSubmit={handleEdit}
            courses={allCourses}
          />,
          document.body,
        )}
    </PageShell>
  )
}
