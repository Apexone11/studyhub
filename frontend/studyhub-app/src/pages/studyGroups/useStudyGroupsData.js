import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { API } from '../../config';
import { authHeaders } from '../shared/pageUtils';
import { showToast } from '../../lib/toast';

/**
 * Comprehensive hook for managing Study Groups data
 * Handles list view, detail view, CRUD operations, and all sub-resources
 */
export function useStudyGroupsData() {
  // URL params for filtering and pagination
  const [searchParams, setSearchParams] = useSearchParams();

  // Group list state
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState(null);
  const [groupsTotal, setGroupsTotal] = useState(0);

  // Active group state (for detail view)
  const [activeGroup, setActiveGroup] = useState(null);
  const [activeGroupLoading, setActiveGroupLoading] = useState(false);
  const [activeGroupError, setActiveGroupError] = useState(null);

  // Active group sub-resources
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [resources, setResources] = useState([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [discussions, setDiscussions] = useState([]);
  const [discussionsLoading, setDiscussionsLoading] = useState(false);

  // Extract filter params from URL
  const search = searchParams.get('search') || '';
  const courseId = searchParams.get('courseId') || '';
  const mine = searchParams.get('mine') === 'true';
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  /**
   * Load groups list with current filters
   */
  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    setGroupsError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (courseId) params.append('courseId', courseId);
      if (mine) params.append('mine', 'true');
      params.append('limit', limit.toString());
      params.append('offset', offset.toString());

      const response = await fetch(`${API}/api/study-groups?${params}`, {
        credentials: 'include',
        headers: authHeaders(),
      });

      if (!response.ok) throw new Error('Failed to load groups');

      const data = await response.json();
      setGroups(data.groups || []);
      setGroupsTotal(data.total || 0);
    } catch (error) {
      setGroupsError(error.message);
      showToast('Failed to load study groups', 'error');
    } finally {
      setGroupsLoading(false);
    }
  }, [search, courseId, mine, limit, offset]);

  /**
   * Load a single group's details
   */
  const loadGroupDetails = useCallback(async (groupId) => {
    setActiveGroupLoading(true);
    setActiveGroupError(null);
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}`, {
        credentials: 'include',
        headers: authHeaders(),
      });

      if (!response.ok) throw new Error('Failed to load group');

      const data = await response.json();
      setActiveGroup(data);
    } catch (error) {
      setActiveGroupError(error.message);
      showToast('Failed to load group details', 'error');
    } finally {
      setActiveGroupLoading(false);
    }
  }, []);

  /**
   * Create a new study group
   */
  const createGroup = useCallback(async (groupData) => {
    try {
      const response = await fetch(`${API}/api/study-groups`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify(groupData),
      });

      if (!response.ok) throw new Error('Failed to create group');

      const newGroup = await response.json();
      setGroups((prev) => [newGroup, ...prev]);
      showToast('Study group created successfully', 'success');
      return newGroup;
    } catch (error) {
      showToast(error.message, 'error');
      throw error;
    }
  }, []);

  /**
   * Update an existing group
   */
  const updateGroup = useCallback(async (groupId, updates) => {
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error('Failed to update group');

      const updatedGroup = await response.json();

      // Update in list
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? updatedGroup : g))
      );

      // Update active group if it's the one being edited
      if (activeGroup?.id === groupId) {
        setActiveGroup(updatedGroup);
      }

      showToast('Group updated successfully', 'success');
      return updatedGroup;
    } catch (error) {
      showToast(error.message, 'error');
      throw error;
    }
  }, [activeGroup?.id]);

  /**
   * Delete a group
   */
  const deleteGroup = useCallback(async (groupId) => {
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(),
      });

      if (!response.ok) throw new Error('Failed to delete group');

      // Remove from list
      setGroups((prev) => prev.filter((g) => g.id !== groupId));

      // Clear active group if it was deleted
      if (activeGroup?.id === groupId) {
        setActiveGroup(null);
      }

      showToast('Group deleted successfully', 'success');
    } catch (error) {
      showToast(error.message, 'error');
      throw error;
    }
  }, [activeGroup?.id]);

  /**
   * Join a study group
   */
  const joinGroup = useCallback(
    async (groupId) => {
      try {
        // Optimistic update
        setActiveGroup((prev) => {
          if (!prev || prev.id !== groupId) return prev;
          return {
            ...prev,
            isMember: true,
            memberCount: (prev.memberCount || 0) + 1,
          };
        });

        const response = await fetch(`${API}/api/study-groups/${groupId}/join`, {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(),
        });

        if (!response.ok) {
          // Revert optimistic update
          setActiveGroup((prev) => {
            if (!prev || prev.id !== groupId) return prev;
            return {
              ...prev,
              isMember: false,
              memberCount: Math.max(0, (prev.memberCount || 1) - 1),
            };
          });
          throw new Error('Failed to join group');
        }

        showToast('Joined group successfully', 'success');
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    []
  );

  /**
   * Leave a study group
   */
  const leaveGroup = useCallback(
    async (groupId) => {
      try {
        // Optimistic update
        setActiveGroup((prev) => {
          if (!prev || prev.id !== groupId) return prev;
          return {
            ...prev,
            isMember: false,
            memberCount: Math.max(0, (prev.memberCount || 1) - 1),
          };
        });

        const response = await fetch(`${API}/api/study-groups/${groupId}/leave`, {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(),
        });

        if (!response.ok) {
          // Revert optimistic update
          setActiveGroup((prev) => {
            if (!prev || prev.id !== groupId) return prev;
            return {
              ...prev,
              isMember: true,
              memberCount: (prev.memberCount || 0) + 1,
            };
          });
          throw new Error('Failed to leave group');
        }

        showToast('Left group successfully', 'success');
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    []
  );

  /**
   * Load members of active group
   */
  const loadMembers = useCallback(async (groupId) => {
    setMembersLoading(true);
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}/members`, {
        credentials: 'include',
        headers: authHeaders(),
      });

      if (!response.ok) throw new Error('Failed to load members');

      const data = await response.json();
      setMembers(data.members || []);
    } catch {
      showToast('Failed to load members', 'error');
    } finally {
      setMembersLoading(false);
    }
  }, []);

  /**
   * Invite a user to the group
   */
  const inviteMember = useCallback(async (groupId, userId) => {
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}/invite`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) throw new Error('Failed to invite member');

      showToast('Member invited successfully', 'success');
      // Reload members to reflect the invite
      await loadMembers(groupId);
    } catch (error) {
      showToast(error.message, 'error');
      throw error;
    }
  }, [loadMembers]);

  /**
   * Update a member's role or status
   */
  const updateMember = useCallback(
    async (groupId, userId, updates) => {
      try {
        const response = await fetch(
          `${API}/api/study-groups/${groupId}/members/${userId}`,
          {
            method: 'PATCH',
            credentials: 'include',
            headers: authHeaders(),
            body: JSON.stringify(updates),
          }
        );

        if (!response.ok) throw new Error('Failed to update member');

        const updatedMember = await response.json();

        // Update in members list
        setMembers((prev) =>
          prev.map((m) => (m.userId === userId ? updatedMember : m))
        );

        showToast('Member updated successfully', 'success');
        return updatedMember;
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    []
  );

  /**
   * Remove a member from the group
   */
  const removeMember = useCallback(
    async (groupId, userId) => {
      try {
        const response = await fetch(
          `${API}/api/study-groups/${groupId}/members/${userId}`,
          {
            method: 'DELETE',
            credentials: 'include',
            headers: authHeaders(),
          }
        );

        if (!response.ok) throw new Error('Failed to remove member');

        // Remove from members list
        setMembers((prev) => prev.filter((m) => m.userId !== userId));

        showToast('Member removed successfully', 'success');
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    []
  );

  /**
   * Load resources for active group
   */
  const loadResources = useCallback(async (groupId) => {
    setResourcesLoading(true);
    try {
      const response = await fetch(
        `${API}/api/study-groups/${groupId}/resources`,
        {
          credentials: 'include',
          headers: authHeaders(),
        }
      );

      if (!response.ok) throw new Error('Failed to load resources');

      const data = await response.json();
      setResources(data.resources || []);
    } catch {
      showToast('Failed to load resources', 'error');
    } finally {
      setResourcesLoading(false);
    }
  }, []);

  /**
   * Add a resource to the group
   */
  const addResource = useCallback(
    async (groupId, resourceData) => {
      try {
        const response = await fetch(
          `${API}/api/study-groups/${groupId}/resources`,
          {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders(),
            body: JSON.stringify(resourceData),
          }
        );

        if (!response.ok) throw new Error('Failed to add resource');

        const newResource = await response.json();
        setResources((prev) => [newResource, ...prev]);
        showToast('Resource added successfully', 'success');
        return newResource;
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    []
  );

  /**
   * Update a resource in the group
   */
  const updateResource = useCallback(
    async (groupId, resourceId, updates) => {
      try {
        const response = await fetch(
          `${API}/api/study-groups/${groupId}/resources/${resourceId}`,
          {
            method: 'PATCH',
            credentials: 'include',
            headers: authHeaders(),
            body: JSON.stringify(updates),
          }
        );

        if (!response.ok) throw new Error('Failed to update resource');

        const updatedResource = await response.json();
        setResources((prev) =>
          prev.map((r) => (r.id === resourceId ? updatedResource : r))
        );
        showToast('Resource updated successfully', 'success');
        return updatedResource;
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    []
  );

  /**
   * Delete a resource from the group
   */
  const deleteResource = useCallback(
    async (groupId, resourceId) => {
      try {
        const response = await fetch(
          `${API}/api/study-groups/${groupId}/resources/${resourceId}`,
          {
            method: 'DELETE',
            credentials: 'include',
            headers: authHeaders(),
          }
        );

        if (!response.ok) throw new Error('Failed to delete resource');

        setResources((prev) => prev.filter((r) => r.id !== resourceId));
        showToast('Resource deleted successfully', 'success');
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    []
  );

  /**
   * Load study sessions for active group
   */
  const loadSessions = useCallback(async (groupId) => {
    setSessionsLoading(true);
    try {
      const response = await fetch(
        `${API}/api/study-groups/${groupId}/sessions`,
        {
          credentials: 'include',
          headers: authHeaders(),
        }
      );

      if (!response.ok) throw new Error('Failed to load sessions');

      const data = await response.json();
      setSessions(data.sessions || []);
    } catch {
      showToast('Failed to load sessions', 'error');
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  /**
   * Create a study session
   */
  const createSession = useCallback(
    async (groupId, sessionData) => {
      try {
        const response = await fetch(
          `${API}/api/study-groups/${groupId}/sessions`,
          {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders(),
            body: JSON.stringify(sessionData),
          }
        );

        if (!response.ok) throw new Error('Failed to create session');

        const newSession = await response.json();
        setSessions((prev) => [newSession, ...prev]);
        showToast('Session created successfully', 'success');
        return newSession;
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    []
  );

  /**
   * Update a study session
   */
  const updateSession = useCallback(
    async (groupId, sessionId, updates) => {
      try {
        const response = await fetch(
          `${API}/api/study-groups/${groupId}/sessions/${sessionId}`,
          {
            method: 'PATCH',
            credentials: 'include',
            headers: authHeaders(),
            body: JSON.stringify(updates),
          }
        );

        if (!response.ok) throw new Error('Failed to update session');

        const updatedSession = await response.json();
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? updatedSession : s))
        );
        showToast('Session updated successfully', 'success');
        return updatedSession;
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    []
  );

  /**
   * Delete a study session
   */
  const deleteSession = useCallback(
    async (groupId, sessionId) => {
      try {
        const response = await fetch(
          `${API}/api/study-groups/${groupId}/sessions/${sessionId}`,
          {
            method: 'DELETE',
            credentials: 'include',
            headers: authHeaders(),
          }
        );

        if (!response.ok) throw new Error('Failed to delete session');

        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        showToast('Session deleted successfully', 'success');
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    []
  );

  /**
   * RSVP to a study session
   */
  const rsvpSession = useCallback(
    async (groupId, sessionId, status) => {
      try {
        const response = await fetch(
          `${API}/api/study-groups/${groupId}/sessions/${sessionId}/rsvp`,
          {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders(),
            body: JSON.stringify({ status }),
          }
        );

        if (!response.ok) throw new Error('Failed to RSVP');

        showToast('RSVP updated successfully', 'success');
        // Reload sessions to reflect RSVP change
        await loadSessions(groupId);
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    [loadSessions]
  );

  /**
   * Load discussions for active group
   */
  const loadDiscussions = useCallback(async (groupId) => {
    setDiscussionsLoading(true);
    try {
      const response = await fetch(
        `${API}/api/study-groups/${groupId}/discussions`,
        {
          credentials: 'include',
          headers: authHeaders(),
        }
      );

      if (!response.ok) throw new Error('Failed to load discussions');

      const data = await response.json();
      setDiscussions(data.discussions || []);
    } catch {
      showToast('Failed to load discussions', 'error');
    } finally {
      setDiscussionsLoading(false);
    }
  }, []);

  /**
   * Create a discussion post
   */
  const createPost = useCallback(
    async (groupId, postData) => {
      try {
        const response = await fetch(
          `${API}/api/study-groups/${groupId}/discussions`,
          {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders(),
            body: JSON.stringify(postData),
          }
        );

        if (!response.ok) throw new Error('Failed to create post');

        const newPost = await response.json();
        setDiscussions((prev) => [newPost, ...prev]);
        showToast('Post created successfully', 'success');
        return newPost;
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    []
  );

  /**
   * Update a discussion post
   */
  const updatePost = useCallback(
    async (groupId, postId, updates) => {
      try {
        const response = await fetch(
          `${API}/api/study-groups/${groupId}/discussions/${postId}`,
          {
            method: 'PATCH',
            credentials: 'include',
            headers: authHeaders(),
            body: JSON.stringify(updates),
          }
        );

        if (!response.ok) throw new Error('Failed to update post');

        const updatedPost = await response.json();
        setDiscussions((prev) =>
          prev.map((p) => (p.id === postId ? updatedPost : p))
        );
        showToast('Post updated successfully', 'success');
        return updatedPost;
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    []
  );

  /**
   * Delete a discussion post
   */
  const deletePost = useCallback(
    async (groupId, postId) => {
      try {
        const response = await fetch(
          `${API}/api/study-groups/${groupId}/discussions/${postId}`,
          {
            method: 'DELETE',
            credentials: 'include',
            headers: authHeaders(),
          }
        );

        if (!response.ok) throw new Error('Failed to delete post');

        setDiscussions((prev) => prev.filter((p) => p.id !== postId));
        showToast('Post deleted successfully', 'success');
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    []
  );

  /**
   * Add a reply to a discussion post
   */
  const addReply = useCallback(
    async (groupId, postId, replyData) => {
      try {
        const response = await fetch(
          `${API}/api/study-groups/${groupId}/discussions/${postId}/replies`,
          {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders(),
            body: JSON.stringify(replyData),
          }
        );

        if (!response.ok) throw new Error('Failed to add reply');

        const newReply = await response.json();
        showToast('Reply added successfully', 'success');
        // Reload discussions to reflect new reply
        await loadDiscussions(groupId);
        return newReply;
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    [loadDiscussions]
  );

  /**
   * Resolve a Q&A post
   */
  const resolvePost = useCallback(
    async (groupId, postId) => {
      try {
        const response = await fetch(
          `${API}/api/study-groups/${groupId}/discussions/${postId}/resolve`,
          {
            method: 'PATCH',
            credentials: 'include',
            headers: authHeaders(),
          }
        );

        if (!response.ok) throw new Error('Failed to resolve post');

        const resolvedPost = await response.json();
        setDiscussions((prev) =>
          prev.map((p) => (p.id === postId ? resolvedPost : p))
        );
        showToast('Post resolved successfully', 'success');
        return resolvedPost;
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    []
  );

  /**
   * Update search filters and reset pagination
   */
  const setFilters = useCallback(
    (filters) => {
      const newParams = new URLSearchParams(searchParams);

      if (filters.search !== undefined) {
        if (filters.search) {
          newParams.set('search', filters.search);
        } else {
          newParams.delete('search');
        }
      }

      if (filters.courseId !== undefined) {
        if (filters.courseId) {
          newParams.set('courseId', filters.courseId);
        } else {
          newParams.delete('courseId');
        }
      }

      if (filters.mine !== undefined) {
        if (filters.mine) {
          newParams.set('mine', 'true');
        } else {
          newParams.delete('mine');
        }
      }

      // Reset pagination when filters change
      newParams.set('offset', '0');

      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );

  /**
   * Update pagination
   */
  const setPagination = useCallback(
    (newLimit, newOffset) => {
      const newParams = new URLSearchParams(searchParams);
      newParams.set('limit', newLimit.toString());
      newParams.set('offset', newOffset.toString());
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );

  // ── Activity feed ──────────────────────────────────────────────────
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [upcomingSessionsPreview, setUpcomingSessionsPreview] = useState([]);

  const loadActivity = useCallback(async (groupId) => {
    setActivitiesLoading(true);
    try {
      const resp = await fetch(`${API}/api/study-groups/${groupId}/activity?limit=10`, {
        credentials: 'include',
        headers: authHeaders(),
      });
      if (resp.ok) {
        const data = await resp.json();
        setActivities(data.activities || []);
        setUpcomingSessionsPreview(data.upcomingSessions || []);
      }
    } catch { /* silent */ }
    setActivitiesLoading(false);
  }, []);

  // ── Upvote toggle ────────────────────────────────────────────────
  const toggleUpvote = useCallback(async (groupId, postId) => {
    try {
      const resp = await fetch(`${API}/api/study-groups/${groupId}/discussions/${postId}/upvote`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
      });
      if (resp.ok) {
        const data = await resp.json();
        setDiscussions((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, upvoteCount: data.upvoteCount, userHasUpvoted: data.upvoted }
              : p
          )
        );
        return data;
      }
    } catch {
      showToast('Failed to toggle upvote', 'error');
    }
    return null;
  }, []);

  // Load groups when filters/pagination change
  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  return {
    // Group list
    groups,
    groupsLoading,
    groupsError,
    groupsTotal,
    loadGroups,
    search,
    courseId,
    mine,
    limit,
    offset,

    // Group CRUD
    createGroup,
    updateGroup,
    deleteGroup,

    // Active group
    activeGroup,
    activeGroupLoading,
    activeGroupError,
    loadGroupDetails,

    // Membership
    joinGroup,
    leaveGroup,

    // Members
    members,
    membersLoading,
    loadMembers,
    inviteMember,
    updateMember,
    removeMember,

    // Resources
    resources,
    resourcesLoading,
    loadResources,
    addResource,
    updateResource,
    deleteResource,

    // Sessions
    sessions,
    sessionsLoading,
    loadSessions,
    createSession,
    updateSession,
    deleteSession,
    rsvpSession,

    // Discussions
    discussions,
    discussionsLoading,
    loadDiscussions,
    createPost,
    updatePost,
    deletePost,
    addReply,
    resolvePost,

    // Activity feed
    activities,
    activitiesLoading,
    upcomingSessionsPreview,
    loadActivity,

    // Upvotes
    toggleUpvote,

    // Filter and pagination utilities
    setFilters,
    setPagination,
  };
}
