import { useState, useCallback } from 'react';
import { API } from '../../config';
import { authHeaders } from '../shared/pageUtils';
import { showToast } from '../../lib/toast';

/**
 * Hook for managing group members
 * Handles loading members, inviting, updating roles, and removing members
 */
export function useGroupMembers() {
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);

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
  const inviteMember = useCallback(
    async (groupId, userId) => {
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
    },
    [loadMembers]
  );

  /**
   * Update a member's role or status
   */
  const updateMember = useCallback(async (groupId, userId, updates) => {
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
  }, []);

  /**
   * Remove a member from the group
   */
  const removeMember = useCallback(async (groupId, userId) => {
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
  }, []);

  return {
    // State
    members,
    membersLoading,

    // Actions
    loadMembers,
    inviteMember,
    updateMember,
    removeMember,
  };
}
