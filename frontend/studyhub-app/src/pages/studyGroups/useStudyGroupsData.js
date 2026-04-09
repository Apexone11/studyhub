import { useGroupList } from './useGroupList';
import { useGroupDetail } from './useGroupDetail';
import { useGroupMembers } from './useGroupMembers';
import { useGroupResources } from './useGroupResources';
import { useGroupSessions } from './useGroupSessions';
import { useGroupDiscussions } from './useGroupDiscussions';
import { useGroupActivity } from './useGroupActivity';

/**
 * Comprehensive hook for managing Study Groups data
 * Composes focused sub-hooks and returns the complete interface for backward compatibility
 *
 * Sub-hooks:
 * - useGroupList: Group list state, filters, pagination
 * - useGroupDetail: Active group state and CRUD operations
 * - useGroupMembers: Members management
 * - useGroupResources: Resources management
 * - useGroupSessions: Sessions management
 * - useGroupDiscussions: Discussions management and real-time updates
 * - useGroupActivity: Activity feed
 */
export function useStudyGroupsData() {
  // Compose all sub-hooks
  const list = useGroupList();
  const detail = useGroupDetail();
  const members = useGroupMembers();
  const resources = useGroupResources();
  const sessions = useGroupSessions();
  const discussions = useGroupDiscussions(detail.activeGroup?.id);
  const activity = useGroupActivity();

  // Return the complete interface for backward compatibility
  return {
    // Group list
    groups: list.groups,
    groupsLoading: list.groupsLoading,
    groupsError: list.groupsError,
    groupsTotal: list.groupsTotal,
    loadGroups: list.loadGroups,
    search: list.search,
    schoolId: list.schoolId,
    courseId: list.courseId,
    mine: list.mine,
    limit: list.limit,
    offset: list.offset,
    schools: list.schools,
    courses: list.courses,

    // Group CRUD
    createGroup: list.createGroup,
    updateGroup: detail.updateGroup,
    deleteGroup: detail.deleteGroup,

    // Active group
    activeGroup: detail.activeGroup,
    activeGroupLoading: detail.activeGroupLoading,
    activeGroupError: detail.activeGroupError,
    loadGroupDetails: detail.loadGroupDetails,

    // Membership
    joinGroup: detail.joinGroup,
    leaveGroup: detail.leaveGroup,

    // Members
    membersLoading: members.membersLoading,
    members: members.members,
    loadMembers: members.loadMembers,
    inviteMember: members.inviteMember,
    updateMember: members.updateMember,
    removeMember: members.removeMember,
    blockMember: members.blockMember,
    unblockMember: members.unblockMember,
    muteMember: members.muteMember,
    unmuteMember: members.unmuteMember,
    blockedUsers: members.blockedUsers,
    blockedLoading: members.blockedLoading,
    loadBlockedUsers: members.loadBlockedUsers,

    // Resources
    resources: resources.resources,
    resourcesLoading: resources.resourcesLoading,
    loadResources: resources.loadResources,
    addResource: resources.addResource,
    updateResource: resources.updateResource,
    deleteResource: resources.deleteResource,

    // Sessions
    sessions: sessions.sessions,
    sessionsLoading: sessions.sessionsLoading,
    loadSessions: sessions.loadSessions,
    createSession: sessions.createSession,
    updateSession: sessions.updateSession,
    deleteSession: sessions.deleteSession,
    rsvpSession: sessions.rsvpSession,

    // Discussions
    discussions: discussions.discussions,
    discussionsLoading: discussions.discussionsLoading,
    loadDiscussions: discussions.loadDiscussions,
    createPost: discussions.createPost,
    updatePost: discussions.updatePost,
    deletePost: discussions.deletePost,
    addReply: discussions.addReply,
    resolvePost: discussions.resolvePost,
    toggleUpvote: discussions.toggleUpvote,

    // Activity feed
    activities: activity.activities,
    activitiesLoading: activity.activitiesLoading,
    upcomingSessionsPreview: activity.upcomingSessionsPreview,
    loadActivity: activity.loadActivity,

    // Filter and pagination utilities
    setFilters: list.setFilters,
    setPagination: list.setPagination,
  };
}
