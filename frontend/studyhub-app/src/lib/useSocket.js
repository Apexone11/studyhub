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
  const [onlineUsers, setOnlineUsers] = useState(new Set())
  const { isAuthenticated } = useSession()

  useEffect(() => {
    if (!isAuthenticated) {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        setConnected(false)
        setOnlineUsers(new Set())
      }
      return
    }

    if (!socketRef.current) {
      socketRef.current = io(API, {
        withCredentials: true,
        autoConnect: false,
        transports: ['websocket', 'polling'],
      })

      socketRef.current.on('connect', () => {
        setConnected(true)
      })

      socketRef.current.on('disconnect', () => {
        setConnected(false)
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
    onlineUsers,
  }
}
