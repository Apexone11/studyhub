import { useState, useCallback } from 'react'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'

/**
 * Hook for managing group activity feed
 * Tracks recent activity and upcoming sessions preview
 */
export function useGroupActivity() {
  const [activities, setActivities] = useState([])
  const [activitiesLoading, setActivitiesLoading] = useState(false)
  const [upcomingSessionsPreview, setUpcomingSessionsPreview] = useState([])

  const loadActivity = useCallback(async (groupId) => {
    setActivitiesLoading(true)
    try {
      const response = await fetch(`${API}/api/study-groups/${groupId}/activity?limit=10`, {
        credentials: 'include',
        headers: authHeaders(),
      })
      if (response.ok) {
        const data = await response.json()
        setActivities(data.activities || [])
        setUpcomingSessionsPreview(data.upcomingSessions || [])
      }
    } catch {
      // Silent failure for activity feed (non-critical)
    }
    setActivitiesLoading(false)
  }, [])

  return {
    // State
    activities,
    activitiesLoading,
    upcomingSessionsPreview,

    // Actions
    loadActivity,
  }
}
