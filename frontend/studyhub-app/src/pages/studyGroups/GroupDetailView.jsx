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
import { useResponsiveAppLayout, pageShell } from '../../lib/ui'
import { EditGroupModal } from './GroupModals'
import { styles } from './studyGroupsStyles'

export default function GroupDetailView({ groupId }) {
  const navigate = useNavigate()
  const { user } = useSession()
  const currentUserId = user?.id || null
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  const {
    activeGroup, activeGroupLoading, activeGroupError,
    loadGroupDetails, updateGroup, deleteGroup, joinGroup, leaveGroup,
    courses: allCourses,
    // Sub-resources
    members, membersLoading, loadMembers, removeMember, updateMember, inviteMember,
    resources, addResource, deleteResource,
    sessions, sessionsLoading, loadSessions, createSession, rsvpSession,
    discussions, discussionsLoading, loadDiscussions, createPost, addReply, resolvePost, deletePost,
    // Activity + upvotes
    activities, activitiesLoading, upcomingSessionsPreview, loadActivity, toggleUpvote,
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
      <>
        <Navbar />
        <div style={styles.page}>
          <div style={pageShell('app', 26, 48)}>
            <div style={styles.loadingPlaceholder}>Loading group...</div>
          </div>
        </div>
      </>
    )
  }

  if (activeGroupError) {
    return (
      <>
        <Navbar />
        <div style={styles.page}>
          <div style={pageShell('app', 26, 48)}>
            <div style={styles.alert('danger')}>
              {activeGroupError}
            </div>
            <Link to="/study-groups" style={styles.backLink}>Back to Study Groups</Link>
          </div>
        </div>
      </>
    )
  }

  if (!activeGroup) {
    return (
      <>
        <Navbar />
        <div style={styles.page}>
          <div style={pageShell('app', 26, 48)}>
            <div style={styles.alert('danger')}>
              Group not found
            </div>
            <Link to="/study-groups" style={styles.backLink}>Back to Study Groups</Link>
          </div>
        </div>
      </>
    )
  }

  const isAdmin = activeGroup.userRole === 'admin'
  const isMember = activeGroup.isMember

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

  const handleJoin = () => {
    joinGroup(groupId)
  }

  const handleLeave = () => {
    if (window.confirm('Are you sure you want to leave this group?')) {
      leaveGroup(groupId)
      navigate('/study-groups')
    }
  }

  return (
    <>
      <Navbar />
      <div style={styles.page}>
        <div style={pageShell('app', 26, 48)}>
          <main id="main-content">
            {/* Back link */}
            <Link to="/study-groups" style={styles.backLink}>
              Back to Study Groups
            </Link>

            {/* Group header */}
            <section style={styles.detailHeader}>
              <div>
                <h1 style={styles.detailTitle}>{activeGroup.name}</h1>
                <p style={styles.detailDesc}>{activeGroup.description}</p>

                <div style={styles.detailMeta}>
                  <span style={styles.privacyBadge}>
                    {getPrivacyLabel(activeGroup.privacy)}
                  </span>
                  <span style={styles.memberBadge}>
                    {activeGroup.memberCount} member{activeGroup.memberCount === 1 ? '' : 's'}
                  </span>
                  {activeGroup.courseId && (
                    <span style={styles.courseBadge}>
                      Course: {activeGroup.courseName}
                    </span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div style={styles.actionButtons}>
                {!isMember ? (
                  <button
                    onClick={handleJoin}
                    style={styles.joinBtn}
                  >
                    Join Group
                  </button>
                ) : (
                  <>
                    {isAdmin && (
                      <button
                        onClick={() => setEditModalOpen(true)}
                        style={styles.editBtn}
                      >
                        Edit Group
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={handleDelete}
                        style={styles.deleteBtn}
                      >
                        Delete Group
                      </button>
                    )}
                    <button
                      onClick={handleLeave}
                      style={styles.leaveBtn}
                    >
                      Leave Group
                    </button>
                  </>
                )}
              </div>
            </section>

            {/* Tab navigation */}
            <div style={styles.tabBar} role="tablist">
              {['overview', 'resources', 'sessions', 'discussions', 'members'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    ...styles.tabButton,
                    ...(activeTab === tab ? styles.tabButtonActive : {}),
                  }}
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-current={activeTab === tab ? 'page' : undefined}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
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
                />
              )}
              {activeTab === 'resources' && (
                <GroupResourcesTab
                  groupId={groupId}
                  resources={resources}
                  onAdd={(data) => addResource(groupId, data)}
                  onDelete={(resourceId) => deleteResource(groupId, resourceId)}
                  isAdminOrMod={isAdmin || activeGroup?.userRole === 'moderator'}
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
                  isAdminOrMod={isAdmin || activeGroup?.userRole === 'moderator'}
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
                  isAdminOrMod={isAdmin || activeGroup?.userRole === 'moderator'}
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
                  currentUserId={currentUserId}
                />
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Edit Group Modal */}
      {editModalOpen && createPortal(
        <EditGroupModal
          open={editModalOpen}
          group={activeGroup}
          onClose={() => setEditModalOpen(false)}
          onSubmit={handleEdit}
          courses={allCourses}
        />,
        document.body
      )}
    </>
  )
}
