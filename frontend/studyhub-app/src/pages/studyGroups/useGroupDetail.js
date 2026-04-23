import { useState, useCallback } from 'react'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { showToast } from '../../lib/toast'

function normalizeGroupId(groupId) {
  const parsed = Number.parseInt(groupId, 10)
  return Number.isNaN(parsed) ? null : parsed
}

async function readResponseError(response, fallback) {
  const data = await response.json().catch(() => ({}))
  return data?.error || fallback
}

/**
 * Hook for managing a single study group's detail view
 * Handles loading, updating, deleting, and membership actions
 */
export function useGroupDetail() {
  // Active group state (for detail view)
  const [activeGroup, setActiveGroup] = useState(null)
  const [activeGroupLoading, setActiveGroupLoading] = useState(false)
  const [activeGroupError, setActiveGroupError] = useState(null)

  /**
   * Load a single group's details
   */
  const loadGroupDetails = useCallback(async (groupId) => {
    const normalizedGroupId = normalizeGroupId(groupId)
    setActiveGroupLoading(true)
    setActiveGroupError(null)
    try {
      const response = await fetch(`${API}/api/study-groups/${normalizedGroupId ?? groupId}`, {
        credentials: 'include',
        headers: authHeaders(),
      })

      if (!response.ok) {
        throw new Error(await readResponseError(response, 'Failed to load group'))
      }

      const data = await response.json()
      setActiveGroup(data)
    } catch (error) {
      setActiveGroupError(error.message)
      showToast('Failed to load group details', 'error')
    } finally {
      setActiveGroupLoading(false)
    }
  }, [])

  /**
   * Update an existing group
   */
  const updateGroup = useCallback(
    async (groupId, updates) => {
      const normalizedGroupId = normalizeGroupId(groupId)
      try {
        const response = await fetch(`${API}/api/study-groups/${normalizedGroupId ?? groupId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: authHeaders(),
          body: JSON.stringify(updates),
        })

        if (!response.ok) {
          throw new Error(await readResponseError(response, 'Failed to update group'))
        }

        const updatedGroup = await response.json()

        // Update active group if it's the one being edited
        if (activeGroup?.id === normalizedGroupId) {
          setActiveGroup(updatedGroup)
        }

        showToast('Group updated successfully', 'success')
        return updatedGroup
      } catch (error) {
        showToast(error.message, 'error')
        throw error
      }
    },
    [activeGroup?.id],
  )

  /**
   * Delete a group
   */
  const deleteGroup = useCallback(
    async (groupId) => {
      const normalizedGroupId = normalizeGroupId(groupId)
      try {
        const response = await fetch(`${API}/api/study-groups/${normalizedGroupId ?? groupId}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: authHeaders(),
        })

        if (!response.ok) {
          throw new Error(await readResponseError(response, 'Failed to delete group'))
        }

        // Clear active group if it was deleted
        if (activeGroup?.id === normalizedGroupId) {
          setActiveGroup(null)
        }

        showToast('Group deleted successfully', 'success')
      } catch (error) {
        showToast(error.message, 'error')
        throw error
      }
    },
    [activeGroup?.id],
  )

  /**
   * Join a study group
   */
  const joinGroup = useCallback(
    async (groupId) => {
      const normalizedGroupId = normalizeGroupId(groupId)
      try {
        const response = await fetch(
          `${API}/api/study-groups/${normalizedGroupId ?? groupId}/join`,
          {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders(),
          },
        )

        if (!response.ok) {
          throw new Error(await readResponseError(response, 'Failed to join group'))
        }

        const membership = await response.json()

        if (activeGroup?.id === normalizedGroupId) {
          await loadGroupDetails(normalizedGroupId)
        }

        showToast(
          membership.status === 'pending'
            ? 'Join request sent successfully'
            : membership.status === 'active'
              ? 'Joined group successfully'
              : 'Group membership updated successfully',
          'success',
        )

        return membership
      } catch (error) {
        showToast(error.message, 'error')
        throw error
      }
    },
    [activeGroup?.id, loadGroupDetails],
  )

  /**
   * Leave a study group
   */
  const leaveGroup = useCallback(
    async (groupId) => {
      const normalizedGroupId = normalizeGroupId(groupId)
      try {
        const response = await fetch(
          `${API}/api/study-groups/${normalizedGroupId ?? groupId}/leave`,
          {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders(),
          },
        )

        if (!response.ok) {
          throw new Error(await readResponseError(response, 'Failed to leave group'))
        }

        if (activeGroup?.id === normalizedGroupId) {
          setActiveGroup((prev) => {
            if (!prev || prev.id !== normalizedGroupId) return prev
            return {
              ...prev,
              isMember: false,
              userRole: null,
              userMembership: null,
              memberCount: Math.max(0, (prev.memberCount || 1) - 1),
            }
          })
        }

        showToast('Left group successfully', 'success')
      } catch (error) {
        showToast(error.message, 'error')
        throw error
      }
    },
    [activeGroup?.id],
  )

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
  }
}
