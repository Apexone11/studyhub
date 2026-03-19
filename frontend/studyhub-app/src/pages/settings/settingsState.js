import { useEffect, useState } from 'react'
import { API } from '../../config'

export const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

export function usePreferences() {
  const [prefs, setPrefs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError('')

    fetch(`${API}/api/settings/preferences`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load preferences.')
        return response.json()
      })
      .then((data) => {
        if (active) {
          setPrefs(data)
          setLoadError('')
        }
      })
      .catch(() => {
        if (active) {
          setPrefs(null)
          setLoadError('Could not load preferences.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [reloadCount])

  function retry() {
    setMsg(null)
    setReloadCount((current) => current + 1)
  }

  function toggle(key) {
    setPrefs((current) => ({ ...current, [key]: !current[key] }))
  }

  async function save(fields, successText) {
    setSaving(true)
    setMsg(null)

    try {
      const body = {}
      for (const key of fields) {
        body[key] = prefs[key]
      }

      const response = await fetch(`${API}/api/settings/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await response.json()

      if (!response.ok) {
        setMsg({ type: 'error', text: data.error || 'Could not save.' })
        return false
      }

      setMsg({ type: 'success', text: successText })
      return true
    } catch {
      setMsg({ type: 'error', text: 'Could not connect to the server.' })
      return false
    } finally {
      setSaving(false)
    }
  }

  return { prefs, setPrefs, loading, saving, msg, loadError, toggle, save, retry }
}