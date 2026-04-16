/* ═══════════════════════════════════════════════════════════════════════════
 * lib/useSocket.js — React hook for Socket.io client connection management
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { API } from '../config'
import { useSession } from './session-context'
import { isNativePlatform } from './mobile/detectMobile'
import { getNativeToken } from './mobile/nativeToken'

export function useSocket() {
  const socketRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [connectionError, setConnectionError] = useState(null)
  const [onlineUsers, setOnlineUsers] = useState(new Set())
  const { isAuthenticated } = useSession()

  useEffect(() => {
    if (!isAuthenticated) {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        setConnected(false)
        setConnectionError(null)
        setOnlineUsers(new Set())
      }
      return
    }

    if (!socketRef.current) {
      // On the Capacitor native shell, cookies cannot be relied on across
      // the Railway origin, so we pass the stored bearer token through
      // Socket.io's `auth` field. The backend middleware accepts either the
      // cookie or `handshake.auth.token` (see backend/src/lib/socketio.js).
      const socketOptions = {
        withCredentials: true,
        autoConnect: false,
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      }
      if (isNativePlatform()) {
        const nativeToken = getNativeToken()
        if (nativeToken) {
          socketOptions.auth = { token: nativeToken }
        }
      }
      socketRef.current = io(API, socketOptions)

      socketRef.current.on('connect', () => {
        setConnected(true)
        setConnectionError(null)
      })

      socketRef.current.on('disconnect', (reason) => {
        setConnected(false)
        // Server-initiated disconnects that won't auto-reconnect
        if (reason === 'io server disconnect') {
          setConnectionError('Disconnected by server. Please refresh the page.')
        }
      })

      socketRef.current.on('connect_error', (err) => {
        setConnected(false)
        // Use structured error fields where available; fall back to message matching.
        // err.data may contain { code, reason } from the server.
        const code = err?.data?.code || err?.code || ''
        const msg = err?.message || 'Connection failed'
        const isAuthError =
          code === 'AUTH_REQUIRED' || msg === 'Auth required' || msg === 'Invalid token'
        const isTransportError =
          code === 'TRANSPORT_ERROR' ||
          msg.includes('xhr poll error') ||
          msg.includes('websocket error')

        if (import.meta.env.DEV) {
          // Log raw error for diagnosis in development
          console.warn('[useSocket] connect_error:', { code, message: msg, data: err?.data })
        }

        // Only surface persistent errors — transient ones will auto-retry
        if (isAuthError || isTransportError) {
          setConnectionError('Real-time connection unavailable. Messages will update on refresh.')
        }
      })

      socketRef.current.on('user:online', (data) => {
        const id = typeof data === 'object' ? data.userId : data
        setOnlineUsers((prev) => new Set([...prev, id]))
      })

      socketRef.current.on('user:offline', (data) => {
        const id = typeof data === 'object' ? data.userId : data
        setOnlineUsers((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      })

      // Cross-device role-change reload (docs §8.7).
      socketRef.current.on('user:roleChanged', () => {
        try {
          localStorage.setItem(
            'pending_role_reload',
            JSON.stringify({ targetRole: null, startedAt: Date.now() }),
          )
        } catch {
          /* ignore */
        }
        // Defer so any in-flight UI updates settle before we replace the page.
        window.setTimeout(() => {
          window.location.reload()
        }, 1500)
      })

      // Socket.io fires this after exhausting reconnection attempts
      socketRef.current.io.on('reconnect_failed', () => {
        setConnectionError('Unable to reconnect. Please check your connection and refresh.')
      })

      socketRef.current.io.on('reconnect', () => {
        setConnected(true)
        setConnectionError(null)
      })
    }

    socketRef.current.connect()

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [isAuthenticated])

  return {
    get socket() {
      return socketRef.current
    },
    connected,
    connectionError,
    onlineUsers,
  }
}
