import { useState, useCallback } from 'react'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { showToast } from '../../lib/toast'

/**
 * Hook for managing group resources (study materials, links, files)
 * Handles loading, adding, updating, and deleting resources
 */
export function useGroupResources() {
  const [resources, setResources] = useState([])
  const [resourcesLoading, setResourcesLoading] = useState(false)

  /**
   * Load resources for active group
   */
  const loadResources = useCallback(async (groupId) => {
    setResourcesLoading(true)
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}/resources`, {
        credentials: 'include',
        headers: authHeaders(),
      })

      if (!response.ok) throw new Error('Failed to load resources')

      const data = await response.json()
      setResources(data.resources || [])
    } catch {
      showToast('Failed to load resources', 'error')
    } finally {
      setResourcesLoading(false)
    }
  }, [])

  /**
   * Add a resource to the group
   */
  const addResource = useCallback(async (groupId, resourceData) => {
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}/resources`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify(resourceData),
      })

      if (!response.ok) throw new Error('Failed to add resource')

      const newResource = await response.json()
      setResources((prev) => [newResource, ...prev])
      showToast('Resource added successfully', 'success')
      return newResource
    } catch (error) {
      showToast(error.message, 'error')
      throw error
    }
  }, [])

  /**
   * Update a resource in the group
   */
  const updateResource = useCallback(async (groupId, resourceId, updates) => {
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}/resources/${resourceId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify(updates),
      })

      if (!response.ok) throw new Error('Failed to update resource')

      const updatedResource = await response.json()
      setResources((prev) => prev.map((r) => (r.id === resourceId ? updatedResource : r)))
      showToast('Resource updated successfully', 'success')
      return updatedResource
    } catch (error) {
      showToast(error.message, 'error')
      throw error
    }
  }, [])

  /**
   * Delete a resource from the group
   */
  const deleteResource = useCallback(async (groupId, resourceId) => {
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}/resources/${resourceId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(),
      })

      if (!response.ok) throw new Error('Failed to delete resource')

      setResources((prev) => prev.filter((r) => r.id !== resourceId))
      showToast('Resource deleted successfully', 'success')
    } catch (error) {
      showToast(error.message, 'error')
      throw error
    }
  }, [])

  return {
    // State
    resources,
    resourcesLoading,

    // Actions
    loadResources,
    addResource,
    updateResource,
    deleteResource,
  }
}
