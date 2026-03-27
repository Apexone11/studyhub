import { useState, useEffect } from 'react'
import { API } from '../config'

const flagCache = new Map()

export function useFeatureFlag(flagName) {
  const [enabled, setEnabled] = useState(() => flagCache.get(flagName) ?? false)
  const [loading, setLoading] = useState(!flagCache.has(flagName))

  useEffect(() => {
    if (flagCache.has(flagName)) return
    let cancelled = false
    fetch(`${API}/api/flags/evaluate/${flagName}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        flagCache.set(flagName, data.enabled)
        setEnabled(data.enabled)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [flagName])

  return { enabled, loading }
}
