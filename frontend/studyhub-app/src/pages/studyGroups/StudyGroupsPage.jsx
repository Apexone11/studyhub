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
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import UserAvatar from '../../components/UserAvatar'
import { useResponsiveAppLayout, pageShell } from '../../lib/ui'
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
    createGroup, joinGroup,
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
              <section style={styles.titleCard}>
                <div style={styles.titleRow}>
                  <div>
                    <h1 style={styles.title}>Study Groups</h1>
                    <p style={styles.subtitle}>{subtitle}</p>
                  </div>
                  {isAuthenticated && (
                    <button
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
                  {groupsError}
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
                <section style={styles.gridSection}>
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
    </>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   DETAIL VIEW — Single group with tabs
───────────────────────────────────────────────────────────────────────────── */
function GroupDetailView({ groupId }) {
  const navigate = useNavigate()
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  const {
    activeGroup, activeGroupLoading, activeGroupError,
    loadGroupDetails, updateGroup, deleteGroup, joinGroup, leaveGroup,
    courses: allCourses,
    // Sub-resources
    members, membersLoading, loadMembers, removeMember, updateMember,
    resources, resourcesLoading, loadResources, addResource, deleteResource,
    sessions, sessionsLoading, loadSessions, createSession, deleteSession, rsvpSession,
    discussions, discussionsLoading, loadDiscussions, createPost, addReply, resolvePost, deletePost,
  } = useStudyGroupsData()

  // Load group details on mount
  useEffect(() => {
    loadGroupDetails(groupId)
  }, [groupId, loadGroupDetails])

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
                <GroupOverviewTab group={activeGroup} />
              )}
              {activeTab === 'resources' && (
                <GroupResourcesTab
                  groupId={groupId}
                  resources={resources}
                  loading={resourcesLoading}
                  loadResources={loadResources}
                  addResource={addResource}
                  deleteResource={deleteResource}
                  isMember={isMember}
                  isAdmin={isAdmin}
                />
              )}
              {activeTab === 'sessions' && (
                <GroupSessionsTab
                  groupId={groupId}
                  sessions={sessions}
                  loading={sessionsLoading}
                  loadSessions={loadSessions}
                  createSession={createSession}
                  deleteSession={deleteSession}
                  rsvpSession={rsvpSession}
                  isMember={isMember}
                  isAdmin={isAdmin}
                />
              )}
              {activeTab === 'discussions' && (
                <GroupDiscussionsTab
                  groupId={groupId}
                  discussions={discussions}
                  loading={discussionsLoading}
                  loadDiscussions={loadDiscussions}
                  createPost={createPost}
                  addReply={addReply}
                  resolvePost={resolvePost}
                  deletePost={deletePost}
                  isMember={isMember}
                  isAdmin={isAdmin}
                />
              )}
              {activeTab === 'members' && (
                <GroupMembersTab
                  groupId={groupId}
                  members={members}
                  loading={membersLoading}
                  loadMembers={loadMembers}
                  removeMember={removeMember}
                  updateMember={updateMember}
                  isAdmin={isAdmin}
                  isMember={isMember}
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
   TAB: OVERVIEW
───────────────────────────────────────────────────────────────────────────── */
function GroupOverviewTab({ group }) {
  if (!group) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 'var(--type-base)', fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 'var(--space-3)' }}>About this group</h3>
        <p style={{ margin: 0, fontSize: 'var(--type-sm)', color: 'var(--sh-text)', lineHeight: 1.6 }}>
          {group.description || 'No description provided.'}
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--space-4)' }}>
        <div style={tabStyles.statCard}>
          <div style={tabStyles.statValue}>{group.memberCount || 0}</div>
          <div style={tabStyles.statLabel}>Members</div>
        </div>
        <div style={tabStyles.statCard}>
          <div style={tabStyles.statValue}>{group.privacy === 'public' ? 'Public' : group.privacy === 'private' ? 'Private' : 'Invite Only'}</div>
          <div style={tabStyles.statLabel}>Privacy</div>
        </div>
        {group.courseName && (
          <div style={tabStyles.statCard}>
            <div style={tabStyles.statValue}>{group.courseName}</div>
            <div style={tabStyles.statLabel}>Course</div>
          </div>
        )}
        <div style={tabStyles.statCard}>
          <div style={tabStyles.statValue}>{group.maxMembers || 50}</div>
          <div style={tabStyles.statLabel}>Max Members</div>
        </div>
      </div>
      <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-muted)' }}>
        Created {new Date(group.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   TAB: MEMBERS
───────────────────────────────────────────────────────────────────────────── */
function GroupMembersTab({ groupId, members, loading, loadMembers, removeMember, updateMember, isAdmin }) {
  useEffect(() => { loadMembers(groupId) }, [groupId, loadMembers])

  if (loading) return <div style={tabStyles.loadingText}>Loading members...</div>

  if (members.length === 0) return <div style={tabStyles.emptyText}>No members yet.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {members.map((m) => (
        <div key={m.userId} style={tabStyles.memberRow}>
          <UserAvatar username={m.username} avatarUrl={m.avatarUrl} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--type-sm)', fontWeight: 600, color: 'var(--sh-heading)' }}>{m.username}</div>
            <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-muted)' }}>
              {m.role === 'admin' ? 'Admin' : m.role === 'moderator' ? 'Moderator' : 'Member'}
              {' -- Joined '}{new Date(m.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
          {isAdmin && m.role !== 'admin' && (
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {m.role !== 'moderator' && (
                <button
                  onClick={() => updateMember(groupId, m.userId, { role: 'moderator' })}
                  style={tabStyles.smallActionBtn}
                >
                  Promote
                </button>
              )}
              <button
                onClick={() => { if (window.confirm(`Remove ${m.username}?`)) removeMember(groupId, m.userId) }}
                style={{ ...tabStyles.smallActionBtn, color: 'var(--sh-danger-text)', borderColor: 'var(--sh-danger-border)' }}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   TAB: RESOURCES
───────────────────────────────────────────────────────────────────────────── */
function GroupResourcesTab({ groupId, resources, loading, loadResources, addResource, deleteResource, isMember, isAdmin }) {
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [resourceType, setResourceType] = useState('link')

  useEffect(() => { if (isMember) loadResources(groupId) }, [groupId, isMember, loadResources])

  if (!isMember) return <div style={tabStyles.emptyText}>Join the group to see resources.</div>
  if (loading) return <div style={tabStyles.loadingText}>Loading resources...</div>

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    try {
      await addResource(groupId, { title: title.trim(), description: description.trim(), resourceType, resourceUrl: url.trim() || null })
      setTitle(''); setUrl(''); setDescription(''); setResourceType('link'); setShowForm(false)
    } catch { /* toast handled in hook */ }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--type-sm)', fontWeight: 600, color: 'var(--sh-text)' }}>{resources.length} resource{resources.length === 1 ? '' : 's'}</span>
        <button onClick={() => setShowForm(!showForm)} style={tabStyles.addBtn}>{showForm ? 'Cancel' : 'Add Resource'}</button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} style={tabStyles.inlineForm}>
          <input type="text" placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} style={tabStyles.formInput} maxLength={200} />
          <input type="text" placeholder="URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)} style={tabStyles.formInput} />
          <textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} style={tabStyles.formTextarea} rows={2} maxLength={500} />
          <select value={resourceType} onChange={(e) => setResourceType(e.target.value)} style={tabStyles.formInput}>
            <option value="link">Link</option>
            <option value="sheet">Study Sheet</option>
            <option value="note">Note</option>
            <option value="file">File</option>
          </select>
          <button type="submit" disabled={!title.trim()} style={tabStyles.submitSmallBtn}>Add</button>
        </form>
      )}

      {resources.length === 0 ? (
        <div style={tabStyles.emptyText}>No resources shared yet. Be the first to add one!</div>
      ) : (
        resources.map((r) => (
          <div key={r.id} style={tabStyles.resourceCard}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                <span style={tabStyles.typeBadge}>{r.resourceType}</span>
                <span style={{ fontSize: 'var(--type-sm)', fontWeight: 600, color: 'var(--sh-heading)' }}>{r.title}</span>
                {r.pinned && <span style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-warning-text)', fontWeight: 600 }}>Pinned</span>}
              </div>
              {r.description && <p style={{ margin: 0, fontSize: 'var(--type-xs)', color: 'var(--sh-muted)', marginBottom: 'var(--space-2)' }}>{r.description}</p>}
              {r.resourceUrl && (
                <a href={r.resourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-brand)', textDecoration: 'none' }}>
                  Open link
                </a>
              )}
              <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-muted)', marginTop: 'var(--space-2)' }}>
                Shared by {r.user?.username || 'Unknown'} -- {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
            {(isAdmin || r.userId === r.user?.id) && (
              <button onClick={() => { if (window.confirm('Delete this resource?')) deleteResource(groupId, r.id) }} style={tabStyles.deleteSmallBtn}>Delete</button>
            )}
          </div>
        ))
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   TAB: SESSIONS
───────────────────────────────────────────────────────────────────────────── */
function GroupSessionsTab({ groupId, sessions, loading, loadSessions, createSession, deleteSession, rsvpSession, isMember, isAdmin }) {
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [durationMins, setDurationMins] = useState('60')

  useEffect(() => { if (isMember) loadSessions(groupId) }, [groupId, isMember, loadSessions])

  if (!isMember) return <div style={tabStyles.emptyText}>Join the group to see sessions.</div>
  if (loading) return <div style={tabStyles.loadingText}>Loading sessions...</div>

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!title.trim() || !scheduledAt) return
    try {
      await createSession(groupId, { title: title.trim(), description: description.trim(), location: location.trim(), scheduledAt, durationMins: parseInt(durationMins, 10) || 60 })
      setTitle(''); setDescription(''); setLocation(''); setScheduledAt(''); setDurationMins('60'); setShowForm(false)
    } catch { /* toast handled in hook */ }
  }

  const upcoming = sessions.filter((s) => new Date(s.scheduledAt) >= new Date() && s.status !== 'cancelled')
  const past = sessions.filter((s) => new Date(s.scheduledAt) < new Date() || s.status === 'cancelled')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--type-sm)', fontWeight: 600, color: 'var(--sh-text)' }}>{sessions.length} session{sessions.length === 1 ? '' : 's'}</span>
        {isAdmin && <button onClick={() => setShowForm(!showForm)} style={tabStyles.addBtn}>{showForm ? 'Cancel' : 'Schedule Session'}</button>}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={tabStyles.inlineForm}>
          <input type="text" placeholder="Session title *" value={title} onChange={(e) => setTitle(e.target.value)} style={tabStyles.formInput} maxLength={200} />
          <textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} style={tabStyles.formTextarea} rows={2} maxLength={500} />
          <input type="text" placeholder="Location (e.g., Library Room 204, Zoom link)" value={location} onChange={(e) => setLocation(e.target.value)} style={tabStyles.formInput} />
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} style={{ ...tabStyles.formInput, flex: 1 }} />
            <input type="number" placeholder="Minutes" value={durationMins} onChange={(e) => setDurationMins(e.target.value)} style={{ ...tabStyles.formInput, width: 100 }} min={1} max={1440} />
          </div>
          <button type="submit" disabled={!title.trim() || !scheduledAt} style={tabStyles.submitSmallBtn}>Schedule</button>
        </form>
      )}

      {sessions.length === 0 ? (
        <div style={tabStyles.emptyText}>No study sessions scheduled yet.</div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--type-sm)', fontWeight: 700, color: 'var(--sh-heading)' }}>Upcoming</h4>
              {upcoming.map((s) => (
                <SessionCard key={s.id} session={s} groupId={groupId} isAdmin={isAdmin} deleteSession={deleteSession} rsvpSession={rsvpSession} />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--type-sm)', fontWeight: 700, color: 'var(--sh-muted)' }}>Past</h4>
              {past.map((s) => (
                <SessionCard key={s.id} session={s} groupId={groupId} isAdmin={isAdmin} deleteSession={deleteSession} rsvpSession={rsvpSession} isPast />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SessionCard({ session, groupId, isAdmin, deleteSession, rsvpSession, isPast }) {
  const date = new Date(session.scheduledAt)
  const endDate = new Date(date.getTime() + (session.durationMins || 60) * 60000)

  return (
    <div style={{ ...tabStyles.resourceCard, opacity: isPast ? 0.65 : 1, marginBottom: 'var(--space-3)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 'var(--type-sm)', fontWeight: 600, color: 'var(--sh-heading)', marginBottom: 'var(--space-2)' }}>{session.title}</div>
        {session.description && <p style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--type-xs)', color: 'var(--sh-muted)' }}>{session.description}</p>}
        <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-text)', marginBottom: 'var(--space-2)' }}>
          {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - {endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </div>
        {session.location && <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-muted)' }}>Location: {session.location}</div>}
        {session.recurring && <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-info-text)', fontWeight: 600, marginTop: 'var(--space-1)' }}>Repeats {session.recurring}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
        {!isPast && (
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button onClick={() => rsvpSession(groupId, session.id, { status: 'going' })} style={{ ...tabStyles.rsvpBtn, ...(session.userRsvpStatus === 'going' ? tabStyles.rsvpActive : {}) }}>Going</button>
            <button onClick={() => rsvpSession(groupId, session.id, { status: 'maybe' })} style={{ ...tabStyles.rsvpBtn, ...(session.userRsvpStatus === 'maybe' ? tabStyles.rsvpActive : {}) }}>Maybe</button>
          </div>
        )}
        {isAdmin && !isPast && (
          <button onClick={() => { if (window.confirm('Delete this session?')) deleteSession(groupId, session.id) }} style={tabStyles.deleteSmallBtn}>Delete</button>
        )}
        {session.status === 'cancelled' && <span style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-danger-text)', fontWeight: 600 }}>Cancelled</span>}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   TAB: DISCUSSIONS
───────────────────────────────────────────────────────────────────────────── */
function GroupDiscussionsTab({ groupId, discussions, loading, loadDiscussions, createPost, addReply, resolvePost, deletePost, isMember, isAdmin }) {
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [expandedPost, setExpandedPost] = useState(null)
  const [replyText, setReplyText] = useState('')

  useEffect(() => { if (isMember) loadDiscussions(groupId) }, [groupId, isMember, loadDiscussions])

  if (!isMember) return <div style={tabStyles.emptyText}>Join the group to see discussions.</div>
  if (loading) return <div style={tabStyles.loadingText}>Loading discussions...</div>

  const handleCreatePost = async (e) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return
    try {
      await createPost(groupId, { title: title.trim(), content: content.trim() })
      setTitle(''); setContent(''); setShowForm(false)
    } catch { /* toast handled in hook */ }
  }

  const handleReply = async (postId) => {
    if (!replyText.trim()) return
    try {
      await addReply(groupId, postId, { content: replyText.trim() })
      setReplyText('')
    } catch { /* toast handled in hook */ }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--type-sm)', fontWeight: 600, color: 'var(--sh-text)' }}>{discussions.length} discussion{discussions.length === 1 ? '' : 's'}</span>
        <button onClick={() => setShowForm(!showForm)} style={tabStyles.addBtn}>{showForm ? 'Cancel' : 'New Discussion'}</button>
      </div>

      {showForm && (
        <form onSubmit={handleCreatePost} style={tabStyles.inlineForm}>
          <input type="text" placeholder="Discussion title *" value={title} onChange={(e) => setTitle(e.target.value)} style={tabStyles.formInput} maxLength={200} />
          <textarea placeholder="What would you like to discuss? *" value={content} onChange={(e) => setContent(e.target.value)} style={tabStyles.formTextarea} rows={3} maxLength={2000} />
          <button type="submit" disabled={!title.trim() || !content.trim()} style={tabStyles.submitSmallBtn}>Post</button>
        </form>
      )}

      {discussions.length === 0 ? (
        <div style={tabStyles.emptyText}>No discussions yet. Start a conversation!</div>
      ) : (
        discussions.map((post) => (
          <div key={post.id} style={tabStyles.discussionCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  {post.resolved && <span style={{ fontSize: 'var(--type-xs)', fontWeight: 600, color: 'var(--sh-success-text)', background: 'var(--sh-success-bg)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>Resolved</span>}
                  <span style={{ fontSize: 'var(--type-sm)', fontWeight: 600, color: 'var(--sh-heading)' }}>{post.title}</span>
                </div>
                <p style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--type-sm)', color: 'var(--sh-text)', lineHeight: 1.5 }}>{post.content}</p>
                <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-muted)' }}>
                  by {post.user?.username || 'Unknown'} -- {new Date(post.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {post.replyCount > 0 && ` -- ${post.replyCount} repl${post.replyCount === 1 ? 'y' : 'ies'}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
                {isAdmin && !post.resolved && (
                  <button onClick={() => resolvePost(groupId, post.id)} style={tabStyles.smallActionBtn}>Resolve</button>
                )}
                {isAdmin && (
                  <button onClick={() => { if (window.confirm('Delete this discussion?')) deletePost(groupId, post.id) }} style={tabStyles.deleteSmallBtn}>Delete</button>
                )}
              </div>
            </div>

            {/* Expand/collapse replies */}
            <button
              onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--type-xs)', color: 'var(--sh-brand)', fontWeight: 600, padding: 0, marginTop: 'var(--space-3)', fontFamily: PAGE_FONT }}
            >
              {expandedPost === post.id ? 'Hide replies' : `View replies (${post.replyCount || 0})`}
            </button>

            {expandedPost === post.id && (
              <div style={{ marginTop: 'var(--space-3)', paddingLeft: 'var(--space-6)', borderLeft: '2px solid var(--sh-border)' }}>
                {post.replies?.length > 0 ? post.replies.map((reply) => (
                  <div key={reply.id} style={{ marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: 'var(--type-sm)', color: 'var(--sh-text)', lineHeight: 1.5 }}>{reply.content}</div>
                    <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-muted)', marginTop: 'var(--space-1)' }}>
                      {reply.user?.username || 'Unknown'} -- {new Date(reply.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                )) : (
                  <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-muted)' }}>No replies yet.</div>
                )}

                {/* Reply form */}
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                  <input
                    type="text"
                    placeholder="Write a reply..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && replyText.trim()) handleReply(post.id) }}
                    style={{ ...tabStyles.formInput, flex: 1 }}
                    maxLength={2000}
                  />
                  <button onClick={() => handleReply(post.id)} disabled={!replyText.trim()} style={tabStyles.submitSmallBtn}>Reply</button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   TAB SHARED STYLES
───────────────────────────────────────────────────────────────────────────── */
const tabStyles = {
  loadingText: { padding: 'var(--space-12)', textAlign: 'center', color: 'var(--sh-muted)', fontSize: 'var(--type-sm)', fontFamily: PAGE_FONT },
  emptyText: { padding: 'var(--space-12)', textAlign: 'center', color: 'var(--sh-muted)', fontSize: 'var(--type-sm)', fontFamily: PAGE_FONT },
  statCard: { background: 'var(--sh-soft)', border: '1px solid var(--sh-border)', borderRadius: 'var(--radius-card)', padding: 'var(--space-6)', textAlign: 'center', fontFamily: PAGE_FONT },
  statValue: { fontSize: 'var(--type-lg)', fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 'var(--space-1)' },
  statLabel: { fontSize: 'var(--type-xs)', color: 'var(--sh-muted)', fontWeight: 600 },
  memberRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--sh-soft)', borderRadius: 'var(--radius-card)', border: '1px solid var(--sh-border)', fontFamily: PAGE_FONT },
  addBtn: { padding: '8px 16px', borderRadius: 'var(--radius-control)', border: 'none', background: 'var(--sh-brand)', color: 'white', fontSize: 'var(--type-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: PAGE_FONT, transition: 'opacity 0.12s' },
  smallActionBtn: { padding: '4px 10px', borderRadius: 'var(--radius-control)', border: '1px solid var(--sh-border)', background: 'var(--sh-surface)', color: 'var(--sh-text)', fontSize: 'var(--type-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: PAGE_FONT },
  deleteSmallBtn: { padding: '4px 10px', borderRadius: 'var(--radius-control)', border: '1px solid var(--sh-danger-border)', background: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)', fontSize: 'var(--type-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: PAGE_FONT },
  inlineForm: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)', background: 'var(--sh-soft)', borderRadius: 'var(--radius-card)', border: '1px solid var(--sh-border)', fontFamily: PAGE_FONT },
  formInput: { padding: '8px 12px', borderRadius: 'var(--radius-control)', border: '1px solid var(--sh-border)', background: 'var(--sh-input-bg)', color: 'var(--sh-input-text)', fontSize: 'var(--type-sm)', fontFamily: PAGE_FONT, boxSizing: 'border-box' },
  formTextarea: { padding: '8px 12px', borderRadius: 'var(--radius-control)', border: '1px solid var(--sh-border)', background: 'var(--sh-input-bg)', color: 'var(--sh-input-text)', fontSize: 'var(--type-sm)', fontFamily: PAGE_FONT, resize: 'vertical', boxSizing: 'border-box' },
  submitSmallBtn: { padding: '8px 16px', borderRadius: 'var(--radius-control)', border: 'none', background: 'var(--sh-brand)', color: 'white', fontSize: 'var(--type-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: PAGE_FONT, alignSelf: 'flex-end' },
  typeBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 'var(--radius-full)', background: 'var(--sh-pill-bg)', color: 'var(--sh-pill-text)', fontSize: 'var(--type-xs)', fontWeight: 600, textTransform: 'capitalize' },
  resourceCard: { display: 'flex', gap: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--sh-soft)', borderRadius: 'var(--radius-card)', border: '1px solid var(--sh-border)', fontFamily: PAGE_FONT },
  discussionCard: { padding: 'var(--space-4)', background: 'var(--sh-soft)', borderRadius: 'var(--radius-card)', border: '1px solid var(--sh-border)', fontFamily: PAGE_FONT },
  rsvpBtn: { padding: '4px 10px', borderRadius: 'var(--radius-control)', border: '1px solid var(--sh-border)', background: 'var(--sh-surface)', color: 'var(--sh-text)', fontSize: 'var(--type-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: PAGE_FONT },
  rsvpActive: { background: 'var(--sh-brand)', color: 'white', borderColor: 'var(--sh-brand)' },
}

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
