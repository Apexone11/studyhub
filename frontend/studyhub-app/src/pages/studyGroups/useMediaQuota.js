/**
 * Hook that owns the group media quota snapshot for a single group.
 * Used by MediaComposer to show "3/5 this week" and disable the upload
 * button when the user is out of budget.
 *
 * Shape: { plan, quota, used, remaining, resetsAt, unlimited }.
 *
 * Refreshes on mount and exposes a `refresh()` callback so callers can
 * re-fetch after a successful upload to keep the counter in sync.
 */
import { useCallback, useEffect, useState } from 'react'
import { fetchGroupMediaQuota } from './groupMediaService'

export default function useMediaQuota(groupId) {
  const [state, setState] = useState({ loading: true, error: '', quota: null })

  const refresh = useCallback(async () => {
    if (!groupId) return
    try {
      const quota = await fetchGroupMediaQuota(groupId)
      setState({ loading: false, error: '', quota })
    } catch (error) {
      setState({ loading: false, error: error.message || 'Could not load quota.', quota: null })
    }
  }, [groupId])

  useEffect(() => {
    if (!groupId) return
    let cancelled = false
    fetchGroupMediaQuota(groupId)
      .then((quota) => { if (!cancelled) setState({ loading: false, error: '', quota }) })
      .catch((error) => { if (!cancelled) setState({ loading: false, error: error.message || 'Could not load quota.', quota: null }) })
    return () => { cancelled = true }
  }, [groupId])

  return {
    ...state,
    refresh,
  }
}
