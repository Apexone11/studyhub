/* ═══════════════════════════════════════════════════════════════════════════
 * pages/messages/useMessagingData.js — Custom hook for messaging state & actions
 *
 * Wired to:
 *   GET  /api/messages/conversations
 *   GET  /api/messages/conversations/:id
 *   GET  /api/messages/conversations/:id/messages
 *   POST /api/messages/conversations (create)
 *   POST /api/messages/conversations/:id/messages (send)
 *   PATCH /api/messages/:messageId (edit)
 *   DELETE /api/messages/:messageId (soft delete)
 *   DELETE /api/messages/conversations/:id (archive/leave)
 *   PATCH /api/messages/conversations/:id (mute/archive/rename)
 *   POST /api/messages/:messageId/reactions (add reaction)
 *   DELETE /api/messages/:messageId/reactions/:emoji (remove reaction)
 *
 * Socket.io events (backend names):
 *   emit:   conversation:join, typing:start, typing:stop, message:read
 *   listen: message:new, message:edit, message:delete,
 *           typing:start, typing:stop, reaction:add, reaction:remove
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useRef, useState } from 'react'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { showToast } from '../../lib/toast'
import { SOCKET_EVENTS } from '../../lib/socketEvents'

export function useMessagingData(socket, currentUserId) {
  /* ── State ───────────────────────────────────────────────────────────── */
  const [conversations, setConversations] = useState([])
  const [activeConversation, setActiveConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [typingUsers, setTypingUsers] = useState(new Map())
  const typingTimerRef = useRef(null)
  // Ref tracks activeConversation.id so socket handlers always see the latest value
  // (avoids stale closure bug where incoming messages increment unread on the active conversation)
  const activeConversationIdRef = useRef(null)

  /* ── Requests & Archived state ──────────────────────────────────────── */
  const [messageRequests, setMessageRequests] = useState([])
  const [totalPending, setTotalPending] = useState(0)
  const [archivedConversations, setArchivedConversations] = useState([])
  const [archivedCount, setArchivedCount] = useState(0)
  const [sendBlocked, setSendBlocked] = useState(false)

  /* ── Load conversations ──────────────────────────────────────────────── */
  const loadConversations = useCallback(async () => {
    setLoadingConversations(true)
    try {
      const response = await fetch(`${API}/api/messages/conversations`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!response.ok) {
        showToast('Failed to load conversations', 'error')
        return
      }
      const data = await response.json()
      setConversations(Array.isArray(data) ? data : data?.conversations || [])
    } catch {
      showToast('Failed to load conversations', 'error')
    } finally {
      setLoadingConversations(false)
    }
  }, [])

  /* ── Load message requests ────────────────────────────────────────────── */
  const loadRequests = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/messages/requests`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!response.ok) return
      const data = await response.json()
      setMessageRequests(data.requests || [])
      setTotalPending(data.totalPending || 0)
    } catch {
      // Silent failure
    }
  }, [])

  /* ── Load archived conversations ────────────────────────────────────── */
  const loadArchived = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/messages/archived`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!response.ok) return
      const data = await response.json()
      const list = Array.isArray(data) ? data : data?.conversations || []
      setArchivedConversations(list)
      setArchivedCount(list.length)
    } catch {
      // Silent failure
    }
  }, [])

  /* ── Accept message request ─────────────────────────────────────────── */
  const acceptRequest = useCallback(async (conversationId) => {
    try {
      const response = await fetch(`${API}/api/messages/requests/${conversationId}/accept`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!response.ok) {
        showToast('Failed to accept request', 'error')
        return false
      }
      const conversation = await response.json()
      // Normalize participants
      if (conversation.participants) {
        conversation.participants = conversation.participants.map((p) =>
          p.user ? { id: p.user.id, username: p.user.username, avatarUrl: p.user.avatarUrl } : p,
        )
      }
      // Move from requests to main list
      setMessageRequests((prev) => prev.filter((r) => r.id !== conversationId))
      setTotalPending((prev) => Math.max(0, prev - 1))
      setConversations((prev) => [conversation, ...prev])
      showToast('Request accepted', 'success')
      return true
    } catch {
      showToast('Failed to accept request', 'error')
      return false
    }
  }, [])

  /* ── Decline message request ────────────────────────────────────────── */
  const declineRequest = useCallback(async (conversationId) => {
    try {
      const response = await fetch(`${API}/api/messages/requests/${conversationId}/decline`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!response.ok) {
        showToast('Failed to decline request', 'error')
        return false
      }
      setMessageRequests((prev) => prev.filter((r) => r.id !== conversationId))
      setTotalPending((prev) => Math.max(0, prev - 1))
      showToast('Request declined', 'success')
      return true
    } catch {
      showToast('Failed to decline request', 'error')
      return false
    }
  }, [])

  /* ── Unarchive conversation ─────────────────────────────────────────── */
  const unarchiveConversation = useCallback(async (id) => {
    try {
      const response = await fetch(`${API}/api/messages/conversations/${id}/unarchive`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!response.ok) {
        showToast('Failed to unarchive conversation', 'error')
        return
      }
      // Move from archived to main list
      const conv = archivedConversations.find((c) => c.id === id)
      setArchivedConversations((prev) => prev.filter((c) => c.id !== id))
      setArchivedCount((prev) => Math.max(0, prev - 1))
      if (conv) {
        setConversations((prev) => [conv, ...prev])
      }
      showToast('Conversation unarchived', 'success')
    } catch {
      showToast('Failed to unarchive conversation', 'error')
    }
  }, [archivedConversations])

  /* ── Block user (DM context) ────────────────────────────────────────── */
  const blockUser = useCallback(async (username) => {
    try {
      const response = await fetch(`${API}/api/users/${encodeURIComponent(username)}/block`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        showToast(errData.error || 'Failed to block user', 'error')
        return false
      }
      showToast(`Blocked ${username}`, 'success')
      return true
    } catch {
      showToast('Failed to block user', 'error')
      return false
    }
  }, [])

  /* ── Load messages for active conversation ────────────────────────────– */
  const loadMessages = useCallback(async (conversationId, beforeMessageId = null) => {
    setLoadingMessages(true)
    try {
      const params = new URLSearchParams()
      if (beforeMessageId) params.append('before', beforeMessageId)

      const response = await fetch(
        `${API}/api/messages/conversations/${conversationId}/messages?${params}`,
        {
          headers: authHeaders(),
          credentials: 'include',
        },
      )
      if (!response.ok) {
        showToast('Failed to load messages', 'error')
        return
      }
      const data = await response.json()
      const newMessages = Array.isArray(data) ? data : data?.messages || []

      if (beforeMessageId) {
        setMessages((prev) => [...newMessages, ...prev])
      } else {
        setMessages(newMessages)
      }

      if (newMessages.length === 0 || data?.hasMore === false) {
        setHasMoreMessages(false)
      }
    } catch {
      showToast('Failed to load messages', 'error')
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  /* ── Mark conversation as read — socket preferred, HTTP fallback ──────── */
  const markConversationRead = useCallback(
    async (conversationId) => {
      if (socket && socket.connected) {
        socket.emit(SOCKET_EVENTS.MESSAGE_READ, { conversationId })
      } else {
        // HTTP fallback when socket is disconnected
        try {
          await fetch(`${API}/api/messages/conversations/${conversationId}/read`, {
            method: 'POST',
            headers: authHeaders(),
            credentials: 'include',
          })
        } catch {
          // Silent failure — unread will recalculate on next load
        }
      }
      // Always clear the local badge immediately
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
      )
    },
    [socket],
  )

  /* ── Select conversation and load messages ────────────────────────────– */
  const selectConversation = useCallback(
    async (id) => {
      try {
        const response = await fetch(`${API}/api/messages/conversations/${id}`, {
          headers: authHeaders(),
          credentials: 'include',
        })
        if (!response.ok) {
          showToast('Failed to load conversation', 'error')
          return
        }
        const conversation = await response.json()
        // Normalize participants to flat shape { id, username, avatarUrl }
        // GET /conversations/:id returns nested { user: { id, username, avatarUrl } }
        // but GET /conversations (list) returns flat { id, username, avatarUrl }
        if (conversation.participants) {
          conversation.participants = conversation.participants.map((p) =>
            p.user ? { id: p.user.id, username: p.user.username, avatarUrl: p.user.avatarUrl } : p,
          )
        }
        setActiveConversation(conversation)
        activeConversationIdRef.current = conversation.id
        setMessages([])
        setHasMoreMessages(true)
        setTypingUsers(new Map())
        setSendBlocked(false)

        // Join the conversation room via socket
        if (socket && socket.connected) {
          socket.emit(SOCKET_EVENTS.CONVERSATION_JOIN, { conversationId: id })
        }

        await loadMessages(id)

        // Mark as read on backend (clears unread badge + updates lastReadAt)
        markConversationRead(id)
      } catch {
        showToast('Failed to select conversation', 'error')
      }
    },
    [socket, loadMessages, markConversationRead],
  )

  /* ── Load more messages (pagination) ──────────────────────────────────– */
  const loadMoreMessages = useCallback(async () => {
    if (!activeConversation || !hasMoreMessages || loadingMessages || messages.length === 0) return
    const oldestMessageId = messages[0].id
    await loadMessages(activeConversation.id, oldestMessageId)
  }, [activeConversation, hasMoreMessages, loadingMessages, messages, loadMessages])

  /* ── Send message — POST /api/messages/conversations/:id/messages ────── */
  const sendMessage = useCallback(
    async (content, replyToId = null, options = {}) => {
      const hasAttachments = Array.isArray(options.attachments) && options.attachments.length > 0
      if (!activeConversation || (!content.trim() && !hasAttachments && !options.poll)) return

      const optimisticMessage = {
        id: `temp_${Date.now()}`,
        conversationId: activeConversation.id,
        content: content.trim(),
        replyToId,
        sender: { id: currentUserId, username: null },
        createdAt: new Date().toISOString(),
        pending: true,
        attachments: options.attachments || [],
        poll: options.poll || null,
      }
      setMessages((prev) => [...prev, optimisticMessage])

      try {
        const body = {
          content: content.trim(),
          replyToId: replyToId || null,
        }
        if (options.attachments && options.attachments.length > 0) {
          body.attachments = options.attachments
        }
        if (options.poll) {
          body.poll = options.poll
        }

        const response = await fetch(
          `${API}/api/messages/conversations/${activeConversation.id}/messages`,
          {
            method: 'POST',
            headers: authHeaders(),
            credentials: 'include',
            body: JSON.stringify(body),
          },
        )
        if (!response.ok) {
          if (response.status === 403) {
            setSendBlocked(true)
          }
          showToast('Failed to send message', 'error')
          setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id))
          return
        }
        const sentMessage = await response.json()
        setMessages((prev) => prev.map((m) => (m.id === optimisticMessage.id ? sentMessage : m)))

        // Update conversation list with latest message
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === activeConversation.id
              ? { ...conv, lastMessage: sentMessage, updatedAt: sentMessage.createdAt }
              : conv,
          ),
        )

        // Stop typing indicator
        if (socket) {
          socket.emit(SOCKET_EVENTS.TYPING_STOP, { conversationId: activeConversation.id })
        }
      } catch {
        showToast('Failed to send message', 'error')
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id))
      }
    },
    [activeConversation, currentUserId, socket],
  )

  /* ── Start conversation ──────────────────────────────────────────────── */
  const startConversation = useCallback(async (participantIds, type, name = null) => {
    try {
      const response = await fetch(`${API}/api/messages/conversations`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          participantIds,
          type,
          name: name || null,
        }),
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        showToast(errData.error || 'Failed to start conversation', 'error')
        return null
      }
      const conversation = await response.json()
      // Normalize participants to flat shape
      if (conversation.participants) {
        conversation.participants = conversation.participants.map((p) =>
          p.user ? { id: p.user.id, username: p.user.username, avatarUrl: p.user.avatarUrl } : p,
        )
      }
      setConversations((prev) => [conversation, ...prev.filter((c) => c.id !== conversation.id)])
      return conversation
    } catch {
      showToast('Failed to start conversation', 'error')
      return null
    }
  }, [])

  /* ── Edit message ────────────────────────────────────────────────────── */
  const editMessage = useCallback(
    async (messageId, content) => {
      if (!content.trim()) return

      const originalMessage = messages.find((m) => m.id === messageId)
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content, editing: true } : m)),
      )

      try {
        const response = await fetch(`${API}/api/messages/${messageId}`, {
          method: 'PATCH',
          headers: authHeaders(),
          credentials: 'include',
          body: JSON.stringify({ content: content.trim() }),
        })
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          showToast(errData.error || 'Failed to edit message', 'error')
          setMessages((prev) => prev.map((m) => (m.id === messageId ? originalMessage : m)))
          return
        }
        const updatedMessage = await response.json()
        setMessages((prev) => prev.map((m) => (m.id === messageId ? updatedMessage : m)))
      } catch {
        showToast('Failed to edit message', 'error')
        setMessages((prev) => prev.map((m) => (m.id === messageId ? originalMessage : m)))
      }
    },
    [messages],
  )

  /* ── Delete message ──────────────────────────────────────────────────── */
  const deleteMessage = useCallback(async (messageId) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m)),
    )

    try {
      const response = await fetch(`${API}/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!response.ok) {
        showToast('Failed to delete message', 'error')
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deletedAt: null } : m)))
      }
    } catch {
      showToast('Failed to delete message', 'error')
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deletedAt: null } : m)))
    }
  }, [])

  /* ── Delete / leave conversation ────────────────────────────────────── */
  const deleteConversation = useCallback(
    async (id) => {
      try {
        const response = await fetch(`${API}/api/messages/conversations/${id}`, {
          method: 'DELETE',
          headers: authHeaders(),
          credentials: 'include',
        })
        if (!response.ok) {
          showToast('Failed to delete conversation', 'error')
          return
        }
        setConversations((prev) => prev.filter((conv) => conv.id !== id))
        if (activeConversation?.id === id) {
          setActiveConversation(null)
          activeConversationIdRef.current = null
          setMessages([])
        }
        showToast('Conversation deleted', 'success')
      } catch {
        showToast('Failed to delete conversation', 'error')
      }
    },
    [activeConversation],
  )

  /* ── Add reaction to message ─────────────────────────────────────────── */
  const addReaction = useCallback(async (messageId, emoji) => {
    try {
      const response = await fetch(`${API}/api/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ emoji }),
      })
      if (!response.ok) {
        showToast('Failed to add reaction', 'error')
      }
    } catch {
      showToast('Failed to add reaction', 'error')
    }
  }, [])

  /* ── Remove reaction from message ────────────────────────────────────── */
  const removeReaction = useCallback(async (messageId, emoji) => {
    try {
      const response = await fetch(
        `${API}/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
        {
          method: 'DELETE',
          headers: authHeaders(),
          credentials: 'include',
        },
      )
      if (!response.ok) {
        showToast('Failed to remove reaction', 'error')
      }
    } catch {
      showToast('Failed to remove reaction', 'error')
    }
  }, [])

  /* ── Mark conversation as read ───────────────────────────────────────── */
  const markAsRead = useCallback(
    (conversationId) => {
      markConversationRead(conversationId)
    },
    [markConversationRead],
  )

  /* ── Archive conversation ────────────────────────────────────────────── */
  const archiveConversation = useCallback(
    async (id) => {
      try {
        const response = await fetch(`${API}/api/messages/conversations/${id}/archive`, {
          method: 'POST',
          headers: authHeaders(),
          credentials: 'include',
        })
        if (!response.ok) {
          showToast('Failed to archive conversation', 'error')
          return
        }
        const conv = conversations.find((c) => c.id === id)
        setConversations((prev) => prev.filter((c) => c.id !== id))
        if (conv) {
          setArchivedConversations((prev) => [conv, ...prev])
          setArchivedCount((prev) => prev + 1)
        }
        if (activeConversation?.id === id) {
          setActiveConversation(null)
          activeConversationIdRef.current = null
          setMessages([])
        }
        showToast('Conversation archived', 'success')
      } catch {
        showToast('Failed to archive conversation', 'error')
      }
    },
    [activeConversation, conversations],
  )

  /* ── Toggle mute on conversation ────────────────────────────────────── */
  const muteConversation = useCallback(
    async (id, muted) => {
      try {
        const endpoint = muted ? 'mute' : 'unmute'
        const response = await fetch(`${API}/api/messages/conversations/${id}/${endpoint}`, {
          method: 'POST',
          headers: authHeaders(),
          credentials: 'include',
        })
        if (!response.ok) {
          showToast('Failed to update mute status', 'error')
          return
        }
        setConversations((prev) => prev.map((conv) => (conv.id === id ? { ...conv, muted } : conv)))
        if (activeConversation?.id === id) {
          setActiveConversation((prev) => (prev ? { ...prev, muted } : prev))
        }
        showToast(muted ? 'Conversation muted' : 'Conversation unmuted', 'success')
      } catch {
        showToast('Failed to update mute status', 'error')
      }
    },
    [activeConversation],
  )

  /* ── Typing indicator helpers ────────────────────────────────────────── */
  const emitTypingStart = useCallback(() => {
    if (!socket || !activeConversation) return
    socket.emit(SOCKET_EVENTS.TYPING_START, { conversationId: activeConversation.id })

    // Auto-stop after 3 seconds of no input
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      if (socket && activeConversation) {
        socket.emit(SOCKET_EVENTS.TYPING_STOP, { conversationId: activeConversation.id })
      }
    }, 3000)
  }, [socket, activeConversation])

  const emitTypingStop = useCallback(() => {
    if (!socket || !activeConversation) return
    socket.emit(SOCKET_EVENTS.TYPING_STOP, { conversationId: activeConversation.id })
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current)
      typingTimerRef.current = null
    }
  }, [socket, activeConversation])

  /* ── Socket.io event listeners (matching backend event names) ────────── */
  useEffect(() => {
    if (!socket) return

    const handleNewMessage = (message) => {
      // Use ref for active conversation check to avoid stale closure issues
      const activeId = activeConversationIdRef.current
      const isActive = activeId != null && message.conversationId === activeId

      // Add message to current thread if viewing that conversation
      if (isActive) {
        setMessages((prev) => {
          // Avoid duplicates (optimistic message already added)
          if (prev.some((m) => m.id === message.id)) return prev
          // Remove optimistic if this is the real version
          const cleaned = prev.filter((m) => !m.pending || m.content !== message.content)
          return [...cleaned, message]
        })

        // Auto-mark as read — prefer socket, fall back to HTTP
        if (socket && socket.connected) {
          socket.emit(SOCKET_EVENTS.MESSAGE_READ, { conversationId: message.conversationId })
        } else {
          fetch(`${API}/api/messages/conversations/${message.conversationId}/read`, {
            method: 'POST',
            headers: authHeaders(),
            credentials: 'include',
          }).catch(() => {})
        }
      }
      // Update conversation list — clear unread if this is the active conversation
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === message.conversationId
            ? {
                ...conv,
                lastMessage: message,
                updatedAt: message.createdAt,
                // Clear unread if we're viewing this conversation; increment otherwise
                unreadCount: isActive
                  ? 0
                  : (conv.unreadCount || 0) + (message.sender?.id !== currentUserId ? 1 : 0),
              }
            : conv,
        ),
      )
    }

    const handleEditMessage = (message) => {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)))
    }

    const handleDeleteMessage = (data) => {
      const messageId = typeof data === 'object' ? data.messageId : data
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m)),
      )
    }

    const handleTypingStart = (data) => {
      if (!data.conversationId || !data.username) return
      if (data.userId === currentUserId) return // Ignore own typing
      setTypingUsers((prev) => {
        const next = new Map(prev)
        const typingSet = next.get(data.conversationId) || new Set()
        typingSet.add(data.username)
        next.set(data.conversationId, typingSet)
        return next
      })
    }

    const handleTypingStop = (data) => {
      if (!data.conversationId) return
      setTypingUsers((prev) => {
        const next = new Map(prev)
        const typingSet = next.get(data.conversationId) || new Set()
        if (data.username) {
          typingSet.delete(data.username)
        } else if (data.userId) {
          // Fallback: remove by userId if username not provided
          typingSet.delete(String(data.userId))
        }
        if (typingSet.size === 0) {
          next.delete(data.conversationId)
        } else {
          next.set(data.conversationId, typingSet)
        }
        return next
      })
    }

    const handleReactionAdd = (data) => {
      if (!data.messageId || !data.reaction) return
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === data.messageId) {
            const reactions = Array.isArray(m.reactions)
              ? [...m.reactions, data.reaction]
              : [data.reaction]
            return { ...m, reactions }
          }
          return m
        }),
      )
    }

    const handleReactionRemove = (data) => {
      if (!data.messageId || !data.emoji) return
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === data.messageId) {
            const reactions = Array.isArray(m.reactions)
              ? m.reactions.filter((r) => !(r.emoji === data.emoji && r.user?.id === data.userId))
              : []
            return { ...m, reactions }
          }
          return m
        }),
      )
    }

    // When the server confirms a read receipt from this user, ensure unread is cleared
    const handleMessageRead = (data) => {
      if (data.userId === currentUserId && data.conversationId) {
        setConversations((prev) =>
          prev.map((c) => (c.id === data.conversationId ? { ...c, unreadCount: 0 } : c)),
        )
      }
    }

    // Listen with correct backend event names
    socket.on(SOCKET_EVENTS.MESSAGE_NEW, handleNewMessage)
    socket.on(SOCKET_EVENTS.MESSAGE_READ, handleMessageRead)
    socket.on(SOCKET_EVENTS.MESSAGE_EDIT, handleEditMessage)
    socket.on(SOCKET_EVENTS.MESSAGE_DELETE, handleDeleteMessage)
    socket.on(SOCKET_EVENTS.TYPING_START, handleTypingStart)
    socket.on(SOCKET_EVENTS.TYPING_STOP, handleTypingStop)
    socket.on(SOCKET_EVENTS.REACTION_ADD, handleReactionAdd)
    socket.on(SOCKET_EVENTS.REACTION_REMOVE, handleReactionRemove)

    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_NEW, handleNewMessage)
      socket.off(SOCKET_EVENTS.MESSAGE_READ, handleMessageRead)
      socket.off(SOCKET_EVENTS.MESSAGE_EDIT, handleEditMessage)
      socket.off(SOCKET_EVENTS.MESSAGE_DELETE, handleDeleteMessage)
      socket.off(SOCKET_EVENTS.TYPING_START, handleTypingStart)
      socket.off(SOCKET_EVENTS.TYPING_STOP, handleTypingStop)
      socket.off(SOCKET_EVENTS.REACTION_ADD, handleReactionAdd)
      socket.off(SOCKET_EVENTS.REACTION_REMOVE, handleReactionRemove)
    }
  }, [socket, currentUserId])

  return {
    conversations,
    activeConversation,
    setActiveConversation,
    messages,
    loadingConversations,
    loadingMessages,
    hasMoreMessages,
    typingUsers,
    loadConversations,
    selectConversation,
    loadMoreMessages,
    sendMessage,
    startConversation,
    editMessage,
    deleteMessage,
    deleteConversation,
    addReaction,
    removeReaction,
    markAsRead,
    archiveConversation,
    unarchiveConversation,
    muteConversation,
    emitTypingStart,
    emitTypingStop,
    // Requests
    messageRequests,
    totalPending,
    loadRequests,
    acceptRequest,
    declineRequest,
    // Archived
    archivedConversations,
    archivedCount,
    loadArchived,
    // Block
    blockUser,
    sendBlocked,
  }
}
