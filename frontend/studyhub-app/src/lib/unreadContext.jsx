/**
 * UnreadProvider — single source of truth for the messages-unread badge.
 * Polls `/api/messages/unread-total` every 30s and broadcasts the value
 * to every consumer (Navbar bell, MobileBottomNav badge, anywhere else
 * that needs it). Pre-2026-05-14 each consumer had its own poller, so
 * we were hitting the endpoint 2x per 30s per session. Decision #L1-2.
 *
 * Phase 2 will swap the polling for a Socket.io-fed update; this
 * provider's context API stays stable so consumers don't need to change.
 *
 * Non-component exports (context object, useUnread hook) live in the
 * sibling .js file to satisfy react-refresh/only-export-components.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { API } from '../config'
import { authHeaders } from '../pages/shared/pageUtils'
import { useSession } from './session-context'
import { UnreadContext } from './unreadContext.js'

const POLL_INTERVAL_MS = 30_000

export function UnreadProvider({ children }) {
  const { isAuthenticated } = useSession()
  const [total, setTotal] = useState(0)
  // The polling effect re-installs its own fetcher on each auth change; we
  // keep the latest one in a ref so `refresh()` (called after the chat panel
  // closes) can re-fetch on demand without re-running the effect.
  const fetchRef = useRef(() => {})

  useEffect(() => {
    if (!isAuthenticated) {
      // Zero the badge when the session ends. Guarded so we don't enqueue a
      // setState on every render — only when there's something to clear.
      setTotal((prev) => (prev === 0 ? prev : 0))
      fetchRef.current = () => {}
      return undefined
    }
    let cancelled = false

    async function fetchTotal() {
      try {
        const res = await fetch(`${API}/api/messages/unread-total`, {
          headers: authHeaders(),
          credentials: 'include',
        })
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (!cancelled) setTotal(Number(data?.total) || 0)
      } catch {
        // Network/server hiccup — leave the prior value visible rather
        // than zeroing the badge.
      }
    }

    fetchRef.current = fetchTotal
    fetchTotal()
    const id = setInterval(fetchTotal, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      fetchRef.current = () => {}
      clearInterval(id)
    }
  }, [isAuthenticated])

  const refresh = useCallback(() => {
    fetchRef.current()
  }, [])

  return <UnreadContext.Provider value={{ total, refresh }}>{children}</UnreadContext.Provider>
}
