/* ═══════════════════════════════════════════════════════════════════════════
 * lib/useSocket.js — React hook for Socket.io client connection management
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { API } from '../config'
import { useSession } from './session-context'

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
      socketRef.current = io(API, {
        withCredentials: true,
        autoConnect: false,
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      })

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
        const msg = err?.message || 'Connection failed'
        // Only surface persistent errors — transient ones will auto-retry
        if (msg.includes('Auth required') || msg.includes('xhr poll error')) {
          setConnectionError('Real-time connection unavailable. Messages will update on refresh.')
        }
      })

      socketRef.current.on('user:online', (userId) => {
        setOnlineUsers((prev) => new Set([...prev, userId]))
      })

      socketRef.current.on('user:offline', (userId) => {
        setOnlineUsers((prev) => {
          const next = new Set(prev)
          next.delete(userId)
          return next
        })
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
