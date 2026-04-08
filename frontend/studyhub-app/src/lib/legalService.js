import { useEffect, useState } from 'react'
import { API } from '../config'

async function parseJson(response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

export async function fetchCurrentLegalDocument(slug) {
  const response = await fetch(`${API}/api/legal/current/${slug}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  })
  const data = await parseJson(response)
  if (!response.ok) {
    throw new Error(data.error || 'Could not load the legal document.')
  }
  return data
}

export async function fetchMyLegalStatus() {
  const response = await fetch(`${API}/api/legal/me/status`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  })
  const data = await parseJson(response)
  if (!response.ok) {
    throw new Error(data.error || 'Could not load legal acceptance status.')
  }
  return data
}

export async function acceptCurrentLegalDocuments() {
  const response = await fetch(`${API}/api/legal/me/accept-current`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  })
  const data = await parseJson(response)
  if (!response.ok) {
    throw new Error(data.error || 'Could not save your legal acceptance.')
  }
  return data
}

export function useCurrentLegalDocument(slug, { enabled = true } = {}) {
  const [document, setDocument] = useState(null)
  const [loading, setLoading] = useState(Boolean(enabled && slug))
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!enabled || !slug) return undefined

    let active = true

    queueMicrotask(() => {
      if (!active) return
      setLoading(true)
      setError('')
    })

    fetchCurrentLegalDocument(slug)
      .then((data) => {
        if (!active) return
        setDocument(data)
      })
      .catch((nextError) => {
        if (!active) return
        setError(nextError.message || 'Could not load the legal document.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [enabled, reloadKey, slug])

  return {
    document: enabled ? document : null,
    error: enabled ? error : '',
    loading: enabled && slug ? loading : false,
    reload: () => setReloadKey((value) => value + 1),
  }
}