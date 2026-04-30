/**
 * useCreatorConsent — fetches the current user's creator-responsibility-doc
 * consent status, exposes a gated `requireConsent(action)` helper, and provides
 * `acceptConsent` to record acceptance.
 *
 * Used by surfaces that must block publish until the user accepts the current
 * doc version (e.g., sheet upload, sheet edit). See CLAUDE.md §12 (fail-closed
 * flag evaluation) and the Creator Audit backend module for the contract.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { API } from '../config'
import { authHeaders } from '../pages/shared/pageUtils'

const CONSENT_PATH = '/api/creator-audit/consent'

/** GET /api/creator-audit/consent */
async function fetchConsent({ signal } = {}) {
  try {
    const res = await fetch(`${API}${CONSENT_PATH}`, {
      headers: authHeaders(),
      credentials: 'include',
      signal,
    })
    if (!res.ok) return { accepted: false, currentDocVersion: null, docVersion: null }
    return await res.json()
  } catch {
    return { accepted: false, currentDocVersion: null, docVersion: null }
  }
}

/** POST /api/creator-audit/consent */
async function acceptConsentRequest(docVersion) {
  const res = await fetch(`${API}${CONSENT_PATH}`, {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({ docVersion }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || `Consent request failed (${res.status})`)
  }
  return res.json()
}

export function useCreatorConsent({ enabled = true } = {}) {
  // When the gate is disabled, the hook never enters a loading state — it
  // returns immediately with `accepted: false` so consumers fall through to the
  // ungated path. When enabled, the effect fetches and updates state once.
  const [state, setState] = useState(() => ({
    loading: enabled,
    accepted: false,
    docVersion: null,
    currentDocVersion: null,
    error: null,
  }))
  const [showModal, setShowModal] = useState(false)
  const pendingActionRef = useRef(null)

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    const ctrl = new AbortController()
    fetchConsent({ signal: ctrl.signal }).then((data) => {
      if (cancelled) return
      setState({
        loading: false,
        accepted: Boolean(data?.accepted),
        docVersion: data?.docVersion || null,
        currentDocVersion: data?.currentDocVersion || null,
        error: null,
      })
    })
    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [enabled])

  /* Gate a callback behind consent. If already accepted, runs immediately.
   * Otherwise stashes the callback and opens the modal; after the user accepts
   * (or dismisses), the modal owner calls confirmAccept() / closeModal(). */
  const requireConsent = useCallback(
    (action) => {
      if (!enabled) {
        // Flag off — pass through, do not gate.
        if (typeof action === 'function') action()
        return
      }
      if (state.accepted) {
        if (typeof action === 'function') action()
        return
      }
      pendingActionRef.current = typeof action === 'function' ? action : null
      setShowModal(true)
    },
    [enabled, state.accepted],
  )

  /* Called by the modal when the user accepts. POSTs consent, then runs any
   * pending action that was queued behind the gate. */
  const confirmAccept = useCallback(async () => {
    const docVersion = state.currentDocVersion
    if (!docVersion) {
      throw new Error('Consent doc version not available — cannot accept.')
    }
    const result = await acceptConsentRequest(docVersion)
    setState((s) => ({
      ...s,
      accepted: true,
      docVersion: result?.docVersion || docVersion,
    }))
    setShowModal(false)
    const action = pendingActionRef.current
    pendingActionRef.current = null
    if (typeof action === 'function') action()
  }, [state.currentDocVersion])

  const dismissModal = useCallback(() => {
    pendingActionRef.current = null
    setShowModal(false)
  }, [])

  return {
    ...state,
    showModal,
    requireConsent,
    confirmAccept,
    dismissModal,
  }
}
