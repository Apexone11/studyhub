/* ═══════════════════════════════════════════════════════════════════════════
 * StudyGroupsPage.jsx — Study Groups main page (list and detail views)
 *
 * Views:
 * - List view (/study-groups) — search, filter, create groups
 * - Detail view (/study-groups/:id) — group info, tabs for Resources/Sessions/etc
 *
 * Components: GroupListView, GroupDetailView, CreateGroupModal, EditGroupModal
 * Data: useStudyGroupsData
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useCallback, useEffect } from 'react'
import { useSearchParams, useParams, Link, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useSession } from '../../lib/session-context'
import { PAGE_FONT } from '../shared/pageUtils'
import { useStudyGroupsData } from './useStudyGroupsData'
import { getPrivacyLabel, truncateText } from './studyGroupsHelpers'
import {
  GroupOverviewTab,
  GroupResourcesTab,
  GroupSessionsTab,
  GroupDiscussionsTab,
  GroupMembersTab,
} from './GroupDetailTabs'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import SafeJoyride from '../../components/SafeJoyride'
import UserAvatar from '../../components/UserAvatar'
import { useResponsiveAppLayout, pageShell } from '../../lib/ui'
import { useTutorial } from '../../lib/useTutorial'
import { STUDY_GROUPS_STEPS, TUTORIAL_VERSIONS } from '../../lib/tutorialSteps'
import { usePageTitle } from '../../lib/usePageTitle'

/* ─────────────────────────────────────────────────────────────────────────
   Main Page Component — Routes to list or detail view
───────────────────────────────────────────────────────────────────────────── */
export default function StudyGroupsPage() {
  const { id: groupId } = useParams()

  if (groupId) {
    return <GroupDetailView groupId={groupId} />
  }

  return <GroupListView />
}

/* ─────────────────────────────────────────────────────────────────────────
   LIST VIEW — Browse, search, and create study groups
───────────────────────────────────────────────────────────────────────────── */
function GroupListView() {
  usePageTitle('Study Groups')
  const layout = useResponsiveAppLayout()
  const tutorial = useTutorial('studyGroups', STUDY_GROUPS_STEPS, { version: TUTORIAL_VERSIONS.studyGroups })
  const { isAuthenticated } = useSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false)

  // Extract URL params
  const search = searchParams.get('search') || ''
  const courseId = searchParams.get('courseId') || ''
  const mineOnly = searchParams.get('mine') === 'true'

  // Load data with current filters
  const {
    groups, groupsLoading, groupsError, groupsTotal,
    createGroup, joinGroup, loadGroups,
    courses: allCourses,
  } = useStudyGroupsData()

  const hasActiveFilters = search || courseId || mineOnly

  // Update search param
  const handleSearch = useCallback((value) => {
    if (value) {
      searchParams.set('search', value)
    } else {
      searchParams.delete('search')
    }
    searchParams.set('offset', '0') // Reset pagination
    setSearchParams(searchParams)
  }, [searchParams, setSearchParams])

  // Toggle "My Groups" filter
  const toggleMine = useCallback(() => {
    if (mineOnly) {
      searchParams.delete('mine')
    } else {
      searchParams.set('mine', 'true')
      searchParams.set('offset', '0')
    }
    setSearchParams(searchParams)
  }, [mineOnly, searchParams, setSearchParams])

  // Filter by course
  const handleCourseFilter = useCallback((cId) => {
    if (cId) {
      searchParams.set('courseId', cId)
    } else {
      searchParams.delete('courseId')
    }
    searchParams.set('offset', '0')
    setSearchParams(searchParams)
  }, [searchParams, setSearchParams])

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setSearchParams({})
  }, [setSearchParams])

  // Handle group creation
  const handleCreateGroup = useCallback(async (groupData) => {
    try {
      const newGroup = await createGroup(groupData)
      setCreateModalOpen(false)
      // Navigate to new group detail
      navigate(`/study-groups/${newGroup.id}`)
    } catch {
      // Error already shown via toast in hook
    }
  }, [createGroup, navigate])

  // Handle join group
  const handleJoinGroup = useCallback((groupId) => {
    joinGroup(groupId)
  }, [joinGroup])

  const selectedCourse = allCourses?.find(c => c.id === parseInt(courseId, 10))
  const subtitle = mineOnly ? 'Groups you are a member of' : 'All study groups'

  return (
    <>
      <Navbar />
      <div style={styles.page}>
        <div style={pageShell('app', 26, 48)}>
          <div style={styles.appGrid}>
            <AppSidebar mode={layout.sidebarMode} />

            <main id="main-content" style={styles.main}>
              {/* Title section with create button */}
              <section data-tutorial="groups-list" style={styles.titleCard}>
                <div style={styles.titleRow}>
                  <div>
                    <h1 style={styles.title}>Study Groups</h1>
                    <p style={styles.subtitle}>{subtitle}</p>
                  </div>
                  {isAuthenticated && (
                    <button
                      data-tutorial="groups-create"
                      onClick={() => setCreateModalOpen(true)}
                      style={styles.createBtn}
                    >
                      Create Group
                    </button>
                  )}
                </div>
              </section>

              {/* Search and filter bar */}
              <GroupListFilters
                search={search}
                courseId={courseId}
                mineOnly={mineOnly}
                allCourses={allCourses}
                onSearch={handleSearch}
                onToggleMine={toggleMine}
                onCourseFilter={handleCourseFilter}
                hasActiveFilters={hasActiveFilters}
                onClearFilters={clearAllFilters}
              />

              {/* Error state */}
              {groupsError && (
                <div style={styles.alert('danger')}>
                  <span>{groupsError}</span>
                  <button
                    onClick={loadGroups}
                    style={{
                      background: 'var(--sh-danger)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '6px 14px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      fontFamily: PAGE_FONT,
                      marginLeft: 12,
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Loading state */}
              {groupsLoading ? (
                <GroupListSkeleton />
              ) : groups.length === 0 ? (
                /* Empty state */
                <GroupListEmptyState
                  search={search}
                  mineOnly={mineOnly}
                  selectedCourse={selectedCourse}
                  onClearFilters={clearAllFilters}
                />
              ) : (
                /* Groups grid */
                <section data-tutorial="groups-resources" style={styles.gridSection}>
                  <div style={styles.gridHeader}>
                    <span style={styles.gridCount}>
                      {groupsTotal} group{groupsTotal === 1 ? '' : 's'}
                    </span>
                    {hasActiveFilters && (
                      <button
                        onClick={clearAllFilters}
                        style={styles.clearBtn}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>

                  <div style={styles.grid}>
                    {groups.map((group) => (
                      <GroupCard
                        key={group.id}
                        group={group}
                        onJoin={() => handleJoinGroup(group.id)}
                        onNavigateDetail={() => navigate(`/study-groups/${group.id}`)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </main>
          </div>
        </div>
      </div>

      {/* Create Group Modal */}
      {createModalOpen && createPortal(
        <CreateGroupModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onSubmit={handleCreateGroup}
          courses={allCourses}
        />,
        document.body
      )}

      <SafeJoyride {...tutorial.joyrideProps} />
    </>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   DETAIL VIEW — Single group with tabs
───────────────────────────────────────────────────────────────────────────── */
function GroupDetailView({ groupId }) {
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

/* ─────────────────────────────────────────────────────────────────────────
   FILTER BAR
───────────────────────────────────────────────────────────────────────────── */
function GroupListFilters({
  search, courseId, mineOnly, allCourses,
  onSearch, onToggleMine, onCourseFilter,
}) {
  return (
    <section style={styles.filterSection}>
      <input
        type="text"
        placeholder="Search study groups..."
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        style={styles.searchInput}
      />

      <div style={styles.filterRow}>
        <button
          onClick={onToggleMine}
          style={{
            ...styles.filterChip,
            ...(mineOnly ? styles.filterChipActive : {}),
          }}
        >
          My Groups
        </button>

        <select
          value={courseId}
          onChange={(e) => onCourseFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All Courses</option>
          {allCourses?.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   GROUP CARD
───────────────────────────────────────────────────────────────────────────── */
function GroupCard({ group, onJoin, onNavigateDetail }) {
  const isMember = group.isMember

  return (
    <div
      style={styles.card}
      onClick={onNavigateDetail}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onNavigateDetail()
        }
      }}
    >
      <h3 style={styles.cardTitle}>{group.name}</h3>
      <p style={styles.cardDesc}>
        {truncateText(group.description || '', 100)}
      </p>

      <div style={styles.cardMeta}>
        <span style={styles.privacyBadgeSmall}>
          {getPrivacyLabel(group.privacy)}
        </span>
        <span style={styles.memberCountSmall}>
          {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
        </span>
        {group.courseName && (
          <span style={styles.courseTagSmall}>
            {group.courseName}
          </span>
        )}
      </div>

      <div style={styles.cardFooter}>
        {isMember ? (
          <span style={styles.joinedLabel}>Joined</span>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onJoin()
            }}
            style={styles.joinBtnSmall}
            aria-label={`Join ${group.name} study group`}
          >
            Join
          </button>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   EMPTY STATE
───────────────────────────────────────────────────────────────────────────── */
function GroupListEmptyState({ search, mineOnly, selectedCourse, onClearFilters }) {
  let message = 'No study groups found.'
  if (search) {
    message = `No groups match "${search}".`
  } else if (mineOnly) {
    message = 'You have not joined any study groups yet.'
  } else if (selectedCourse) {
    message = `No groups found for ${selectedCourse.name}.`
  }

  return (
    <section style={styles.emptyState}>
      <p style={styles.emptyStateMessage}>{message}</p>
      {(search || mineOnly || selectedCourse) && (
        <button onClick={onClearFilters} style={styles.emptyStateClearBtn}>
          Clear filters
        </button>
      )}
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   SKELETON LOADER
───────────────────────────────────────────────────────────────────────────── */
function GroupListSkeleton() {
  return (
    <div style={styles.grid}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={styles.cardSkeleton} />
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   CREATE GROUP MODAL
───────────────────────────────────────────────────────────────────────────── */
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

          {submitError && (
            <div style={styles.alert('danger')}>
              {submitError}
            </div>
          )}

          <div style={styles.modalActions}>
            <button
              type="button"
              onClick={onClose}
              style={styles.cancelBtn}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={styles.submitBtn}
              disabled={submitting || !name.trim()}
            >
              {submitting ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   EDIT GROUP MODAL
───────────────────────────────────────────────────────────────────────────── */
function EditGroupModal({ open, group, onClose, onSubmit, courses }) {
  const [name, setName] = useState(group?.name || '')
  const [description, setDescription] = useState(group?.description || '')
  const [privacy, setPrivacy] = useState(group?.privacy || 'public')
  const [courseId, setCourseId] = useState(group?.courseId || '')
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

          {submitError && (
            <div style={styles.alert('danger')}>
              {submitError}
            </div>
          )}

          <div style={styles.modalActions}>
            <button
              type="button"
              onClick={onClose}
              style={styles.cancelBtn}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={styles.submitBtn}
              disabled={submitting || !name.trim()}
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   NOTE: Tab components are imported from GroupDetailTabs.jsx
   The inline tab components have been removed in favor of the shared components.
───────────────────────────────────────────────────────────────────────────── */


/* ─────────────────────────────────────────────────────────────────────────
   TAB SHARED STYLES
───────────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────────
   STYLES
───────────────────────────────────────────────────────────────────────────── */
const styles = {
  page: {
    background: 'var(--sh-page-bg)',
    minHeight: '100vh',
    paddingTop: 'var(--page-gutter)',
    paddingBottom: 'var(--page-gutter)',
  },

  appGrid: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    gap: 'var(--page-section-gap)',
  },

  main: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--page-section-gap)',
  },

  titleCard: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--card-pad)',
    boxShadow: 'var(--elevation-1)',
  },

  titleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 'var(--space-8)',
    fontFamily: PAGE_FONT,
  },

  title: {
    fontSize: 'var(--type-lg)',
    fontWeight: 700,
    color: 'var(--sh-heading)',
    margin: 0,
    marginBottom: 'var(--space-2)',
  },

  subtitle: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-subtext)',
    margin: 0,
  },

  createBtn: {
    padding: '10px 20px',
    borderRadius: 'var(--radius-control)',
    border: 'none',
    background: 'var(--sh-brand)',
    color: 'white',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'opacity 0.12s',
    whiteSpace: 'nowrap',
  },

  filterSection: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--card-pad)',
    boxShadow: 'var(--elevation-1)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    fontFamily: PAGE_FONT,
  },

  searchInput: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-input-bg)',
    color: 'var(--sh-input-text)',
    fontSize: 'var(--type-sm)',
    fontFamily: PAGE_FONT,
    boxSizing: 'border-box',
  },

  filterRow: {
    display: 'flex',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
  },

  filterChip: {
    padding: '7px 14px',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-soft)',
    color: 'var(--sh-text)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'all 0.12s',
  },

  filterChipActive: {
    background: 'var(--sh-brand)',
    color: 'white',
    borderColor: 'var(--sh-brand)',
  },

  filterSelect: {
    padding: '7px 12px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-soft)',
    color: 'var(--sh-text)',
    fontSize: 'var(--type-sm)',
    fontFamily: PAGE_FONT,
    cursor: 'pointer',
  },

  gridSection: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--card-pad)',
    boxShadow: 'var(--elevation-1)',
  },

  gridHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 'var(--space-6)',
    fontFamily: PAGE_FONT,
  },

  gridCount: {
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    color: 'var(--sh-text)',
  },

  clearBtn: {
    padding: '6px 12px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-soft)',
    color: 'var(--sh-text)',
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'background 0.12s',
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 'var(--space-6)',
  },

  card: {
    background: 'var(--sh-soft)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--card-pad)',
    cursor: 'pointer',
    transition: 'all 0.12s',
    fontFamily: PAGE_FONT,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },

  cardTitle: {
    fontSize: 'var(--type-base)',
    fontWeight: 700,
    color: 'var(--sh-heading)',
    margin: 0,
  },

  cardDesc: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-subtext)',
    margin: 0,
    lineHeight: 1.5,
    flexGrow: 1,
  },

  cardMeta: {
    display: 'flex',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
  },

  privacyBadgeSmall: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: 'var(--radius-full)',
    background: 'var(--sh-pill-bg)',
    color: 'var(--sh-pill-text)',
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
  },

  memberCountSmall: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: 'var(--radius-full)',
    background: 'var(--sh-info-bg)',
    color: 'var(--sh-info-text)',
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
  },

  courseTagSmall: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: 'var(--radius-full)',
    background: 'var(--sh-warning-bg)',
    color: 'var(--sh-warning-text)',
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
  },

  cardFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    borderTop: '1px solid var(--sh-border)',
    paddingTop: 'var(--space-4)',
    marginTop: 'var(--space-2)',
  },

  joinBtnSmall: {
    padding: '6px 14px',
    borderRadius: 'var(--radius-control)',
    border: 'none',
    background: 'var(--sh-brand)',
    color: 'white',
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'opacity 0.12s',
  },

  joinedLabel: {
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
    color: 'var(--sh-success)',
  },

  cardSkeleton: {
    background: 'var(--sh-soft)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    height: '200px',
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  },

  emptyState: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-16)',
    textAlign: 'center',
    fontFamily: PAGE_FONT,
  },

  emptyStateMessage: {
    fontSize: 'var(--type-base)',
    color: 'var(--sh-subtext)',
    margin: '0 0 var(--space-6)',
  },

  emptyStateClearBtn: {
    padding: '8px 16px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-soft)',
    color: 'var(--sh-text)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'background 0.12s',
  },

  /* Detail view styles */
  backLink: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-brand)',
    textDecoration: 'none',
    fontFamily: PAGE_FONT,
    fontWeight: 600,
    display: 'inline-block',
    marginBottom: 'var(--space-6)',
    transition: 'opacity 0.12s',
  },

  detailHeader: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--card-pad)',
    boxShadow: 'var(--elevation-1)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 'var(--space-8)',
    fontFamily: PAGE_FONT,
  },

  detailTitle: {
    fontSize: 'var(--type-xl)',
    fontWeight: 700,
    color: 'var(--sh-heading)',
    margin: 0,
    marginBottom: 'var(--space-3)',
  },

  detailDesc: {
    fontSize: 'var(--type-base)',
    color: 'var(--sh-subtext)',
    margin: '0 0 var(--space-4)',
    lineHeight: 1.6,
  },

  detailMeta: {
    display: 'flex',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
  },

  privacyBadge: {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: 'var(--radius-full)',
    background: 'var(--sh-pill-bg)',
    color: 'var(--sh-pill-text)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
  },

  memberBadge: {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: 'var(--radius-full)',
    background: 'var(--sh-info-bg)',
    color: 'var(--sh-info-text)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
  },

  courseBadge: {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: 'var(--radius-full)',
    background: 'var(--sh-warning-bg)',
    color: 'var(--sh-warning-text)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
  },

  actionButtons: {
    display: 'flex',
    gap: 'var(--space-3)',
    flexDirection: 'column',
  },

  joinBtn: {
    padding: '10px 20px',
    borderRadius: 'var(--radius-control)',
    border: 'none',
    background: 'var(--sh-brand)',
    color: 'white',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'opacity 0.12s',
    whiteSpace: 'nowrap',
  },

  editBtn: {
    padding: '10px 20px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-soft)',
    color: 'var(--sh-text)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'background 0.12s',
    whiteSpace: 'nowrap',
  },

  deleteBtn: {
    padding: '10px 20px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-danger-border)',
    background: 'var(--sh-danger-bg)',
    color: 'var(--sh-danger-text)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'opacity 0.12s',
    whiteSpace: 'nowrap',
  },

  leaveBtn: {
    padding: '10px 20px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-soft)',
    color: 'var(--sh-text)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'background 0.12s',
    whiteSpace: 'nowrap',
  },

  tabBar: {
    display: 'flex',
    gap: 'var(--space-4)',
    borderBottom: '1px solid var(--sh-border)',
    background: 'var(--sh-surface)',
    padding: '0 var(--card-pad)',
    fontFamily: PAGE_FONT,
  },

  tabButton: {
    padding: '12px 16px',
    border: 'none',
    background: 'transparent',
    color: 'var(--sh-muted)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    borderBottom: '2px solid transparent',
    transition: 'all 0.12s',
  },

  tabButtonActive: {
    color: 'var(--sh-brand)',
    borderBottomColor: 'var(--sh-brand)',
  },

  tabContent: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderTop: 'none',
    borderRadius: '0 0 var(--radius-card) var(--radius-card)',
    padding: 'var(--card-pad)',
    fontFamily: PAGE_FONT,
  },

  placeholder: {
    padding: 'var(--space-12)',
    textAlign: 'center',
    color: 'var(--sh-muted)',
    fontSize: 'var(--type-base)',
  },

  loadingPlaceholder: {
    padding: 'var(--space-12)',
    textAlign: 'center',
    color: 'var(--sh-muted)',
    fontSize: 'var(--type-base)',
    fontFamily: PAGE_FONT,
  },

  alert: (type) => {
    const typeStyles = {
      danger: {
        background: 'var(--sh-danger-bg)',
        border: '1px solid var(--sh-danger-border)',
        color: 'var(--sh-danger-text)',
      },
      success: {
        background: 'var(--sh-success-bg)',
        border: '1px solid var(--sh-success-border)',
        color: 'var(--sh-success-text)',
      },
    }
    return {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 'var(--space-4) var(--space-6)',
      borderRadius: 'var(--radius-control)',
      fontSize: 'var(--type-sm)',
      fontWeight: 600,
      fontFamily: PAGE_FONT,
      ...typeStyles[type],
    }
  },

  /* Modal styles */
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--sh-modal-overlay)',
    backdropFilter: 'blur(4px)',
    zIndex: 550,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: PAGE_FONT,
  },

  modal: {
    background: 'var(--sh-surface)',
    borderRadius: 18,
    border: '1px solid var(--sh-border)',
    padding: 'clamp(20px, 3vw, 28px)',
    width: 'min(500px, 92vw)',
    boxShadow: 'var(--elevation-4)',
    maxHeight: '90vh',
    overflowY: 'auto',
  },

  modalTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: 'var(--sh-heading)',
    lineHeight: 1.3,
    marginBottom: 'var(--space-6)',
  },

  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: 'var(--space-6)',
  },

  label: {
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    color: 'var(--sh-text)',
    marginBottom: 'var(--space-2)',
  },

  input: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-input-bg)',
    color: 'var(--sh-input-text)',
    fontSize: 'var(--type-sm)',
    fontFamily: PAGE_FONT,
    boxSizing: 'border-box',
  },

  textarea: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-input-bg)',
    color: 'var(--sh-input-text)',
    fontSize: 'var(--type-sm)',
    fontFamily: PAGE_FONT,
    boxSizing: 'border-box',
    resize: 'vertical',
    minHeight: 80,
  },

  charCount: {
    fontSize: 'var(--type-xs)',
    color: 'var(--sh-muted)',
    marginTop: 'var(--space-2)',
    textAlign: 'right',
  },

  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 'var(--space-4)',
    marginTop: 'var(--space-6)',
  },

  cancelBtn: {
    padding: '9px 18px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-surface)',
    color: 'var(--sh-muted)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'background 0.12s',
  },

  submitBtn: {
    padding: '9px 18px',
    borderRadius: 'var(--radius-control)',
    border: 'none',
    background: 'var(--sh-brand)',
    color: 'white',
    fontSize: 'var(--type-sm)',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'opacity 0.12s',
  },
}
