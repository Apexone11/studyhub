import { useState, useCallback } from 'react'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { showToast } from '../../lib/toast'

async function readResponseError(response, fallback) {
  const data = await response.json().catch(() => ({}))
  return data?.error || fallback
}

/**
 * Hook for managing group members
 * Handles loading members, inviting, updating roles, and removing members
 */
export function useGroupMembers() {
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)

  /**
   * Load members of active group
   */
  const loadMembers = useCallback(async (groupId) => {
    setMembersLoading(true)
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}/members`, {
        credentials: 'include',
        headers: authHeaders(),
      })

      if (!response.ok) throw new Error('Failed to load members')

      const data = await response.json()
      setMembers(data.members || [])
    } catch {
      showToast('Failed to load members', 'error')
    } finally {
      setMembersLoading(false)
    }
  }, [])

  /**
   * Invite a user to the group
   */
  const inviteMember = useCallback(
    async (groupId, inviteData) => {
      try {
        const response = await fetch(`${API}/api/study-groups/${groupId}/invite`, {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(),
          body: JSON.stringify(inviteData),
        })

        if (!response.ok) {
          throw new Error(await readResponseError(response, 'Failed to invite member'))
        }

        showToast('Member invited successfully', 'success')
        // Reload members to reflect the invite
        await loadMembers(groupId)
      } catch (error) {
        showToast(error.message, 'error')
        throw error
      }
    },
    [loadMembers],
  )

  /**
   * Update a member's role or status
   */
  const updateMember = useCallback(async (groupId, userId, updates) => {
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}/members/${userId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        throw new Error(await readResponseError(response, 'Failed to update member'))
      }

      const updatedMember = await response.json()

      // Update in members list
      setMembers((prev) =>
        prev.map((member) =>
          member.userId === updatedMember.userId ? { ...member, ...updatedMember } : member,
        ),
      )

      showToast('Member updated successfully', 'success')
      return updatedMember
    } catch (error) {
      showToast(error.message, 'error')
      throw error
    }
  }, [])

  /**
   * Remove a member from the group
   */
  const removeMember = useCallback(async (groupId, userId) => {
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}/members/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(),
      })

      if (!response.ok) {
        throw new Error(await readResponseError(response, 'Failed to remove member'))
      }

      // Remove from members list
      setMembers((prev) => prev.filter((m) => m.userId !== userId))

      showToast('Member removed successfully', 'success')
    } catch (error) {
      showToast(error.message, 'error')
      throw error
    }
  }, [])

  /**
   * Block a user from the group (removes membership, prevents rejoin)
   */
  const blockMember = useCallback(async (groupId, userId, reason = '') => {
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}/block/${userId}`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({ reason }),
      })

      if (!response.ok) {
        throw new Error(await readResponseError(response, 'Failed to block user'))
      }

      // Remove from members list since blocking removes membership
      setMembers((prev) => prev.filter((m) => m.userId !== userId))

      showToast('User blocked from group', 'success')
    } catch (error) {
      showToast(error.message, 'error')
      throw error
    }
  }, [])

  /**
   * Unblock a user from the group
   */
  const unblockMember = useCallback(async (groupId, userId) => {
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}/block/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(),
      })

      if (!response.ok) {
        throw new Error(await readResponseError(response, 'Failed to unblock user'))
      }

      showToast('User unblocked', 'success')
    } catch (error) {
      showToast(error.message, 'error')
      throw error
    }
  }, [])

  /**
   * Mute a member for N days (can read but not post/reply/upload)
   */
  const muteMember = useCallback(async (groupId, userId, days = 7, reason = '') => {
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}/mute/${userId}`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({ days, reason }),
      })

      if (!response.ok) {
        throw new Error(await readResponseError(response, 'Failed to mute user'))
      }

      const data = await response.json()

      // Update the member's mutedUntil in local state
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, mutedUntil: data.mutedUntil } : m)),
      )

      showToast(data.message || 'User muted', 'success')
    } catch (error) {
      showToast(error.message, 'error')
      throw error
    }
  }, [])

  /**
   * Lift a mute early
   */
  const unmuteMember = useCallback(async (groupId, userId) => {
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}/mute/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(),
      })

      if (!response.ok) {
        throw new Error(await readResponseError(response, 'Failed to unmute user'))
      }

      // Clear mute in local state
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, mutedUntil: null, mutedReason: '' } : m)),
      )

      showToast('User unmuted', 'success')
    } catch (error) {
      showToast(error.message, 'error')
      throw error
    }
  }, [])

  /**
   * Load blocked users for the group
   */
  const [blockedUsers, setBlockedUsers] = useState([])
  const [blockedLoading, setBlockedLoading] = useState(false)

  const loadBlockedUsers = useCallback(async (groupId) => {
    setBlockedLoading(true)
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}/blocks`, {
        credentials: 'include',
        headers: authHeaders(),
      })
      if (!response.ok) throw new Error('Failed to load blocked users')
      const data = await response.json()
      setBlockedUsers(data.blocks || [])
    } catch {
      // Silent — blocked list is secondary UI
    } finally {
      setBlockedLoading(false)
    }
  }, [])

  return {
    // State
    members,
    membersLoading,
    blockedUsers,
    blockedLoading,

    // Actions
    loadMembers,
    inviteMember,
    updateMember,
    removeMember,
    blockMember,
    unblockMember,
    muteMember,
    unmuteMember,
    loadBlockedUsers,
  }
}
