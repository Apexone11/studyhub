import { useState, useCallback } from 'react';
import { API } from '../../config';
import { authHeaders } from '../shared/pageUtils';
import { showToast } from '../../lib/toast';

/**
 * Hook for managing a single study group's detail view
 * Handles loading, updating, deleting, and membership actions
 */
export function useGroupDetail() {
  // Active group state (for detail view)
  const [activeGroup, setActiveGroup] = useState(null);
  const [activeGroupLoading, setActiveGroupLoading] = useState(false);
  const [activeGroupError, setActiveGroupError] = useState(null);

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
  const joinGroup = useCallback(async (groupId) => {
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
  }, []);

  /**
   * Leave a study group
   */
  const leaveGroup = useCallback(async (groupId) => {
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
  }, []);

  return {
    // State
    activeGroup,
    activeGroupLoading,
    activeGroupError,

    // Actions
    loadGroupDetails,
    updateGroup,
    deleteGroup,
    joinGroup,
    leaveGroup,
  };
}
