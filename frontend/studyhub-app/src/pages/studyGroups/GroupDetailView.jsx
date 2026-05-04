/* ═══════════════════════════════════════════════════════════════════════════
 * GroupDetailView.jsx — Single group detail view with tabs
 *
 * Displays a single study group with tabs for Overview, Resources, Sessions,
 * Discussions, and Members. Handles editing, deletion, joining, and leaving.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useSession } from '../../lib/session-context'
import { useStudyGroupsData } from './useStudyGroupsData'
import { getPrivacyLabel, resolveGroupImageUrl } from './studyGroupsHelpers'
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
import GroupBackgroundPicker from './GroupBackgroundPicker'
import ReportGroupModal from './ReportGroupModal'
import { styles } from './studyGroupsStyles'
import { IconPen, IconFlag, IconLock } from '../../components/Icons'

function RailCard({ title, children }) {
  return (
    <section
      style={{
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        borderRadius: 14,
        padding: '14px 16px',
        boxShadow: '0 2px 10px rgba(15,23,42,0.04)',
      }}
    >
      <h3
        style={{
          margin: '0 0 10px',
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--sh-muted)',
        }}
      >
        {title}
      </h3>
      <div style={{ display: 'grid', gap: 10, fontSize: 13, lineHeight: 1.5 }}>{children}</div>
    </section>
  )
}

export default function GroupDetailView({ groupId }) {
  const navigate = useNavigate()
  const { user } = useSession()
  const currentUserId = user?.id || null
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false)
  const [reportModalOpen, setReportModalOpen] = useState(false)
  // Tab + post-id deep-link via `?tab=discussions&post=<id>`. Notifications
  // emit this URL shape so a click on a "post approved" / "replied to your
  // post" / "pinned" notification lands the user directly on the affected
  // thread instead of the Overview tab (Copilot finding 2026-05-03).
  const [searchParams] = useSearchParams()
  const initialTabParam = searchParams.get('tab')
  const initialPostParam = Number.parseInt(searchParams.get('post') || '', 10)
  const VALID_TABS = ['overview', 'discussions', 'resources', 'sessions', 'members']
  const [activeTab, setActiveTab] = useState(
    VALID_TABS.includes(initialTabParam) ? initialTabParam : 'overview',
  )
  const initialFocusedPostId =
    Number.isInteger(initialPostParam) && initialPostParam > 0 ? initialPostParam : null

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
    enrolledSchoolIds,
    // Sub-resources
    members,
    membersLoading,
    loadMembers,
    removeMember,
    updateMember,
    inviteMember,
    blockMember,
    unblockMember,
    muteMember,
    unmuteMember,
    blockedUsers,
    blockedLoading,
    loadBlockedUsers,
    resources,
    loadResources,
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
    updatePost,
    addReply,
    resolvePost,
    deletePost,
    // Activity + upvotes
    activities,
    activitiesLoading,
    upcomingSessionsPreview,
    loadActivity,
    toggleUpvote,
    approvePost,
    rejectPost,
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

  // Load resources when resources tab is active
  useEffect(() => {
    if (activeTab === 'resources' && activeGroup?.isMember) {
      loadResources(groupId)
    }
  }, [activeTab, groupId, activeGroup, loadResources])

  // Load members when members tab is active
  useEffect(() => {
    if (activeTab === 'members') {
      loadMembers(groupId)
    }
  }, [activeTab, groupId, loadMembers])

  // Load discussions when the Discussions tab is active. Sibling tabs
  // already had their own loaders (resources at line 131, members at
  // line 138) but the discussions equivalent was missing, so the
  // Discussions tab rendered an empty list on first visit and only
  // populated via Socket.io push events. Combined with the response-
  // key fix in useGroupDiscussions.js this gets the tab to actually
  // show data on initial mount.
  useEffect(() => {
    if (activeTab === 'discussions' && activeGroup?.isMember) {
      loadDiscussions(groupId)
    }
  }, [activeTab, groupId, activeGroup, loadDiscussions])

  // Light prefetch of members for the right rail "Members online now"
  // card on the Discussions tab. Without this, opening Discussions
  // before ever visiting Members leaves the rail card stuck on
  // "Loading…" because `members` is `[]`. This fires the same loader
  // the Members tab uses, so by the time the user clicks Members the
  // data is already cached.
  useEffect(() => {
    if (activeTab === 'discussions' && activeGroup?.isMember && members.length === 0) {
      loadMembers(groupId)
    }
  }, [activeTab, groupId, activeGroup, members.length, loadMembers])

  // Same prefetch for the right-rail "Recent activity" card. Without
  // this, opening Discussions before ever visiting Overview leaves
  // the activity card on "No activity yet." even though there's
  // plenty of data — `activities` is just unfetched. (Copilot
  // 2026-05-03 finding.)
  useEffect(() => {
    if (activeTab === 'discussions' && activeGroup?.isMember && activities.length === 0) {
      loadActivity(groupId)
    }
  }, [activeTab, groupId, activeGroup, activities.length, loadActivity])

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
  const membershipStatus =
    activeGroup.userMembership?.status || (activeGroup.isMember ? 'active' : null)
  const isMember = membershipStatus === 'active'
  const isPending = membershipStatus === 'pending'
  const isInvited = membershipStatus === 'invited'
  const isAdminOrMod = isAdmin || activeGroup.userRole === 'moderator'
  const groupImageUrl = resolveGroupImageUrl(activeGroup.avatarUrl)
  // Phase 4: owner-curated banner image. Falls back to the avatar image,
  // then to the default gradient when neither is set.
  const headerBackgroundUrl = activeGroup.backgroundUrl
    ? resolveGroupImageUrl(activeGroup.backgroundUrl)
    : groupImageUrl
  const detailDescription =
    activeGroup.description ||
    'Use this space to coordinate sessions, share resources, and keep your study rhythm together.'

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
          <div
            style={{
              position: 'relative',
              minHeight: 220,
              background: headerBackgroundUrl
                ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.18), rgba(15, 23, 42, 0.48))'
                : 'linear-gradient(135deg, rgba(37, 99, 235, 0.92), rgba(124, 58, 237, 0.9))',
            }}
          >
            {headerBackgroundUrl ? (
              <img
                src={headerBackgroundUrl}
                alt=""
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            ) : null}

            {/* Phase 4: admin/mod can open the background picker */}
            {isAdminOrMod ? (
              <button
                type="button"
                onClick={() => setBackgroundPickerOpen(true)}
                aria-label="Change group background"
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  zIndex: 2,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  background: 'rgba(15, 23, 42, 0.55)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  backdropFilter: 'blur(6px)',
                }}
              >
                <IconPen size={12} />
                Change background
              </button>
            ) : null}

            {/* Phase 4: attribution line in the bottom-right if set */}
            {activeGroup.backgroundCredit ? (
              <div
                aria-label="Background attribution"
                style={{
                  position: 'absolute',
                  right: 14,
                  bottom: 10,
                  zIndex: 2,
                  fontSize: 11,
                  color: 'rgba(255, 255, 255, 0.85)',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.55)',
                  pointerEvents: 'none',
                  maxWidth: '60%',
                  textAlign: 'right',
                }}
              >
                {activeGroup.backgroundCredit}
              </div>
            ) : null}

            <div
              style={{
                position: 'relative',
                zIndex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 20,
                minHeight: 220,
                padding: '24px',
                background: headerBackgroundUrl
                  ? 'linear-gradient(180deg, rgba(15, 23, 42, 0.16), rgba(15, 23, 42, 0.68))'
                  : 'transparent',
              }}
            >
              <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: 'rgba(255,255,255,0.72)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  Study Group
                </div>
                <div
                  style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}
                >
                  <div
                    style={{
                      width: 82,
                      height: 82,
                      borderRadius: 24,
                      overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.24)',
                      boxShadow: '0 20px 36px rgba(15, 23, 42, 0.25)',
                      background: groupImageUrl
                        ? 'rgba(255,255,255,0.14)'
                        : 'rgba(255,255,255,0.18)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {groupImageUrl ? (
                      <img
                        src={groupImageUrl}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{ fontSize: 34, fontWeight: 800, color: '#fff' }}>
                        {activeGroup.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 12 }}>
                    <h1 style={{ ...styles.detailTitle, color: '#fff', marginBottom: 0 }}>
                      {activeGroup.name}
                    </h1>
                    <p
                      style={{
                        ...styles.detailDesc,
                        color: 'rgba(255,255,255,0.82)',
                        margin: 0,
                        maxWidth: 760,
                      }}
                    >
                      {detailDescription}
                    </p>

                    <div style={{ ...styles.detailMeta, gap: 10 }}>
                      <span
                        style={{
                          ...styles.privacyBadge,
                          background: 'rgba(255,255,255,0.12)',
                          color: '#fff',
                        }}
                      >
                        {getPrivacyLabel(activeGroup.privacy)}
                      </span>
                      <span
                        style={{
                          ...styles.memberBadge,
                          background: 'rgba(255,255,255,0.12)',
                          color: '#fff',
                        }}
                      >
                        {activeGroup.memberCount}
                        {activeGroup.maxMembers ? `/${activeGroup.maxMembers}` : ''} member
                        {activeGroup.memberCount === 1 ? '' : 's'}
                      </span>
                      {activeGroup.courseId ? (
                        <span
                          style={{
                            ...styles.courseBadge,
                            background: 'rgba(255,255,255,0.12)',
                            color: '#fff',
                          }}
                        >
                          {activeGroup.courseName}
                        </span>
                      ) : null}
                      {activeGroup.createdAt ? (
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
                          Created{' '}
                          {new Date(activeGroup.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div style={styles.actionButtons}>
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
                    {isAdmin ? (
                      <button onClick={() => setEditModalOpen(true)} style={styles.editBtn}>
                        Edit Group
                      </button>
                    ) : null}
                    {isAdmin ? (
                      <button onClick={handleDelete} style={styles.deleteBtn}>
                        Delete Group
                      </button>
                    ) : null}
                    <button onClick={handleLeave} style={styles.leaveBtn}>
                      Leave Group
                    </button>
                    {/* Report — anyone except the owner can report */}
                    {activeGroup.createdById !== currentUserId ? (
                      <button
                        onClick={() => setReportModalOpen(true)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 14px',
                          borderRadius: 10,
                          border: '1px solid var(--sh-danger-border)',
                          background: 'var(--sh-danger-bg)',
                          color: 'var(--sh-danger-text)',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                        title="Report this group"
                      >
                        <IconFlag size={13} />
                        Report
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={{ padding: '24px', display: 'grid', gap: 18 }}>
            {/* Phase 5: moderation banners */}
            {activeGroup.moderationStatus === 'warned' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 16px',
                  borderRadius: 12,
                  background: 'var(--sh-warning-bg)',
                  border: '1px solid var(--sh-warning-border)',
                  color: 'var(--sh-warning-text)',
                  fontSize: 13,
                  fontWeight: 600,
                  lineHeight: 1.5,
                }}
              >
                <IconFlag size={16} style={{ flexShrink: 0 }} />
                <div>
                  This group received a warning from our review team. Please review the community
                  guidelines to avoid further action.
                  {activeGroup.warnedUntil ? (
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--sh-muted)',
                        marginTop: 4,
                      }}
                    >
                      Warning expires: {new Date(activeGroup.warnedUntil).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
            {activeGroup.moderationStatus === 'locked' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 16px',
                  borderRadius: 12,
                  background: 'var(--sh-danger-bg)',
                  border: '1px solid var(--sh-danger-border)',
                  color: 'var(--sh-danger-text)',
                  fontSize: 13,
                  fontWeight: 600,
                  lineHeight: 1.5,
                }}
              >
                <IconLock size={16} style={{ flexShrink: 0 }} />
                <div>
                  This group has been locked (read-only) by our review team. Members can view
                  existing content but cannot post or upload.
                  {activeGroup.createdById === currentUserId ? (
                    <span style={{ display: 'block', fontSize: 11, marginTop: 4 }}>
                      You can appeal this decision using the Appeal button above.
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 12,
              }}
            >
              {[
                { label: 'Members', value: activeGroup.memberCount },
                { label: 'Resources', value: activeGroup.resourceCount },
                { label: 'Upcoming Sessions', value: activeGroup.upcomingSessionCount },
                { label: 'Discussions', value: activeGroup.discussionPostCount },
              ].map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 18,
                    border: '1px solid var(--sh-border)',
                    background: 'var(--sh-soft)',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--sh-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {stat.label}
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--sh-heading)' }}>
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <div
                style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--sh-subtext)', maxWidth: 640 }}
              >
                Everything your group needs stays here: shared resources, upcoming sessions,
                discussion threads, and the current member roster.
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-muted)' }}>
                {isMember
                  ? 'Member access enabled'
                  : activeGroup.privacy === 'public'
                    ? 'Open to all students'
                    : 'Membership approval required'}
              </div>
            </div>
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
                  aria-hidden
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: activeTab === tab.key ? 'var(--sh-brand)' : 'var(--sh-soft)',
                    color: activeTab === tab.key ? '#fff' : 'var(--sh-muted)',
                    minWidth: 22,
                    textAlign: 'center',
                    border:
                      activeTab === tab.key
                        ? '1px solid var(--sh-brand)'
                        : '1px solid var(--sh-border)',
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
              userId={currentUserId}
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
            <div className="sh-group-discussions-layout" style={styles.discussionsLayout}>
              <div style={{ minWidth: 0 }}>
                <GroupDiscussionsTab
                  groupId={groupId}
                  discussions={discussions}
                  loading={discussionsLoading}
                  loadDiscussions={loadDiscussions}
                  initialFocusedPostId={initialFocusedPostId}
                  // Every callback below MUST close over `groupId` because the
                  // child components call them with only the post-scoped args
                  // (`postId`, etc.). Wiring `onDeletePost={deletePost}` raw
                  // made `deletePost(postId)` resolve to
                  // `deletePost(groupId=postId, postId=undefined)` and the URL
                  // became `/api/study-groups/<postId>/discussions/undefined`
                  // which 400'd with "Invalid group ID." Same shape was
                  // broken on create, reply, and resolve — fixed in one pass
                  // here by wrapping all of them.
                  onCreatePost={(postData) => createPost(groupId, postData)}
                  onAddReply={(postId, replyData) => addReply(groupId, postId, replyData)}
                  onResolve={(postId) => resolvePost(groupId, postId)}
                  onDeletePost={(postId) => deletePost(groupId, postId)}
                  onTogglePin={(postId, nextPinned) =>
                    updatePost(groupId, postId, { pinned: nextPinned })
                  }
                  onUpvote={(postId) => toggleUpvote(groupId, postId)}
                  onApprovePost={(postId) => approvePost(groupId, postId)}
                  onRejectPost={(postId) => rejectPost(groupId, postId)}
                  isMember={isMember}
                  isAdminOrMod={isAdminOrMod}
                  userId={currentUserId}
                />
              </div>
              {/* Right rail (320px wide, hidden under 1024px via the
                  matching @media query in studyGroupsStyles.js). */}
              <aside
                className="sh-group-discussions-rail"
                style={styles.discussionsRail}
                aria-label="Group sidebar"
              >
                <RailCard title="Upcoming sessions">
                  {upcomingSessionsPreview && upcomingSessionsPreview.length > 0 ? (
                    upcomingSessionsPreview.slice(0, 3).map((s) => (
                      <div key={s.id} style={styles.railRow}>
                        <div style={{ fontWeight: 700, color: 'var(--sh-heading)' }}>
                          {s.title || 'Untitled session'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
                          {s.startsAt
                            ? new Date(s.startsAt).toLocaleString(undefined, {
                                weekday: 'short',
                                hour: 'numeric',
                                minute: '2-digit',
                              })
                            : 'TBD'}
                          {s.location ? ` · ${s.location}` : ''}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={styles.railEmpty}>No sessions scheduled.</div>
                  )}
                </RailCard>
                <RailCard title="Recent activity">
                  {Array.isArray(activities) && activities.length > 0 ? (
                    activities.slice(0, 5).map((a, idx) => (
                      <div key={a.id ?? idx} style={styles.railRow}>
                        <span style={{ color: 'var(--sh-text)' }}>
                          {a.actorUsername ? <strong>{a.actorUsername}</strong> : 'Someone'}{' '}
                          {a.summary || a.action || 'made an update'}
                        </span>
                        {a.createdAt ? (
                          <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
                            {' · '}
                            {new Date(a.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div style={styles.railEmpty}>No activity yet.</div>
                  )}
                </RailCard>
                <RailCard title="Members">
                  {Array.isArray(members) && members.length > 0 ? (
                    members.slice(0, 6).map((m) => (
                      <div
                        key={m.id || m.userId}
                        style={{
                          ...styles.railRow,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--sh-success)',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ color: 'var(--sh-text)' }}>
                          {m.user?.username || m.username || 'Member'}
                        </span>
                      </div>
                    ))
                  ) : (
                    // Honest copy: there's no real online-presence wire
                    // yet, and members may not be loaded if the user
                    // hasn't visited the Members tab. Point them at
                    // that tab instead of pretending a fetch is in
                    // flight forever.
                    <div style={styles.railEmpty}>
                      Open the Members tab to see who&rsquo;s here.
                    </div>
                  )}
                </RailCard>
              </aside>
            </div>
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
              onBlock={(userId, reason) => blockMember(groupId, userId, reason)}
              onUnblock={(userId) => unblockMember(groupId, userId)}
              onMute={(userId, days, reason) => muteMember(groupId, userId, days, reason)}
              onUnmute={(userId) => unmuteMember(groupId, userId)}
              blockedUsers={blockedUsers}
              blockedLoading={blockedLoading}
              onLoadBlocked={() => loadBlockedUsers(groupId)}
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
            enrolledSchoolIds={enrolledSchoolIds}
          />,
          document.body,
        )}

      {/* Phase 4: group background picker (admins/mods only) */}
      <GroupBackgroundPicker
        open={backgroundPickerOpen}
        groupId={activeGroup.id}
        currentBackgroundUrl={activeGroup.backgroundUrl}
        currentBackgroundCredit={activeGroup.backgroundCredit}
        onClose={() => setBackgroundPickerOpen(false)}
        onSaved={() => {
          setBackgroundPickerOpen(false)
          loadGroupDetails(activeGroup.id)
        }}
      />

      {/* Phase 5: report group modal */}
      <ReportGroupModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        groupId={activeGroup.id}
        groupName={activeGroup.name}
        onReported={() => {
          // After reporting, navigate back to the list — the backend
          // will now hide this group from the user's view.
          navigate('/study-groups')
        }}
      />
    </PageShell>
  )
}
