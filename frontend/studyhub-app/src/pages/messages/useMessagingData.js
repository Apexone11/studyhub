/* ═══════════════════════════════════════════════════════════════════════════
 * pages/messages/useMessagingData.js — Custom hook for messaging state & actions
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { showToast } from '../../lib/toast'

export function useMessagingData(socket) {
  /* ── State ───────────────────────────────────────────────────────────── */
  const [conversations, setConversations] = useState([])
  const [activeConversation, setActiveConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [typingUsers, setTypingUsers] = useState(new Map())

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
      setConversations(Array.isArray(data) ? data : (data?.conversations || []))
    } catch {
      showToast('Failed to load conversations', 'error')
    } finally {
      setLoadingConversations(false)
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
      const newMessages = Array.isArray(data) ? data : (data?.messages || [])

      if (beforeMessageId) {
        setMessages((prev) => [...newMessages, ...prev])
      } else {
        setMessages(newMessages)
      }

      if (newMessages.length === 0 || (data?.hasMore === false)) {
        setHasMoreMessages(false)
      }
    } catch {
      showToast('Failed to load messages', 'error')
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  /* ── Select conversation and load messages ────────────────────────────– */
  const selectConversation = useCallback(async (id) => {
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
      setActiveConversation(conversation)
      setMessages([])
      setHasMoreMessages(true)
      setTypingUsers(new Map())

      if (socket) {
        socket.emit('message:room:join', id)
      }

      await loadMessages(id)
    } catch {
      showToast('Failed to select conversation', 'error')
    }
  }, [socket, loadMessages])

  /* ── Load more messages (pagination) ──────────────────────────────────– */
  const loadMoreMessages = useCallback(async () => {
    if (!activeConversation || !hasMoreMessages || loadingMessages || messages.length === 0) return
    const oldestMessageId = messages[0].id
    await loadMessages(activeConversation.id, oldestMessageId)
  }, [activeConversation, hasMoreMessages, loadingMessages, messages, loadMessages])

  /* ── Send message ────────────────────────────────────────────────────── */
  const sendMessage = useCallback(async (content, replyToId = null) => {
    if (!activeConversation || !content.trim()) return

    const optimisticMessage = {
      id: `temp_${Date.now()}`,
      conversationId: activeConversation.id,
      content,
      replyToId,
      createdAt: new Date().toISOString(),
      pending: true,
    }
    setMessages((prev) => [...prev, optimisticMessage])

    try {
      const response = await fetch(`${API}/api/messages`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          conversationId: activeConversation.id,
          content,
          replyToId: replyToId || null,
        }),
      })
      if (!response.ok) {
        showToast('Failed to send message', 'error')
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id))
        return
      }
      const sentMessage = await response.json()
      setMessages((prev) => prev.map((m) => (m.id === optimisticMessage.id ? sentMessage : m)))

      setConversations((prev) => prev.map((conv) => (conv.id === activeConversation.id ? { ...conv, lastMessage: sentMessage } : conv)))
    } catch {
      showToast('Failed to send message', 'error')
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id))
    }
  }, [activeConversation])

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
        showToast('Failed to start conversation', 'error')
        return null
      }
      const conversation = await response.json()
      setConversations((prev) => [conversation, ...prev])
      return conversation
    } catch {
      showToast('Failed to start conversation', 'error')
      return null
    }
  }, [])

  /* ── Edit message ────────────────────────────────────────────────────– */
  const editMessage = useCallback(async (messageId, content) => {
    if (!content.trim()) return

    const originalMessage = messages.find((m) => m.id === messageId)
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content, editing: true } : m)))

    try {
      const response = await fetch(`${API}/api/messages/${messageId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ content }),
      })
      if (!response.ok) {
        showToast('Failed to edit message', 'error')
        setMessages((prev) => prev.map((m) => (m.id === messageId ? originalMessage : m)))
        return
      }
      const updatedMessage = await response.json()
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updatedMessage : m)))
    } catch {
      showToast('Failed to edit message', 'error')
      setMessages((prev) => prev.map((m) => (m.id === messageId ? originalMessage : m)))
    }
  }, [messages])

  /* ── Delete message ──────────────────────────────────────────────────– */
  const deleteMessage = useCallback(async (messageId) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deleted: true } : m)))

    try {
      const response = await fetch(`${API}/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!response.ok) {
        showToast('Failed to delete message', 'error')
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deleted: false } : m)))
      }
    } catch {
      showToast('Failed to delete message', 'error')
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deleted: false } : m)))
    }
  }, [])

  /* ── Add reaction to message ─────────────────────────────────────────– */
  const addReaction = useCallback(async (messageId, emoji) => {
    const message = messages.find((m) => m.id === messageId)
    if (!message) return

    const reactions = message.reactions || {}
    const currentCount = (reactions[emoji] || 0)
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: { ...reactions, [emoji]: currentCount + 1 } } : m)))

    try {
      const response = await fetch(`${API}/api/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ emoji }),
      })
      if (!response.ok) {
        showToast('Failed to add reaction', 'error')
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)))
      }
    } catch {
      showToast('Failed to add reaction', 'error')
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)))
    }
  }, [messages])

  /* ── Remove reaction from message ────────────────────────────────────– */
  const removeReaction = useCallback(async (messageId, emoji) => {
    const message = messages.find((m) => m.id === messageId)
    if (!message) return

    const reactions = message.reactions || {}
    const currentCount = reactions[emoji] || 0
    const nextReactions = { ...reactions }
    if (currentCount <= 1) {
      delete nextReactions[emoji]
    } else {
      nextReactions[emoji] = currentCount - 1
    }
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: nextReactions } : m)))

    try {
      const response = await fetch(`${API}/api/messages/${messageId}/reactions/${emoji}`, {
        method: 'DELETE',
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!response.ok) {
        showToast('Failed to remove reaction', 'error')
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)))
      }
    } catch {
      showToast('Failed to remove reaction', 'error')
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)))
    }
  }, [messages])

  /* ── Mark conversation as read ───────────────────────────────────────– */
  const markAsRead = useCallback((conversationId) => {
    if (socket) {
      socket.emit('message:read', { conversationId })
    }
  }, [socket])

  /* ── Archive conversation ────────────────────────────────────────────– */
  const archiveConversation = useCallback(async (id) => {
    try {
      const response = await fetch(`${API}/api/messages/conversations/${id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ archived: true }),
      })
      if (!response.ok) {
        showToast('Failed to archive conversation', 'error')
        return
      }
      setConversations((prev) => prev.filter((conv) => conv.id !== id))
      if (activeConversation?.id === id) {
        setActiveConversation(null)
        setMessages([])
      }
      showToast('Conversation archived', 'success')
    } catch {
      showToast('Failed to archive conversation', 'error')
    }
  }, [activeConversation])

  /* ── Toggle mute on conversation ────────────────────────────────────– */
  const muteConversation = useCallback(async (id, muted) => {
    try {
      const response = await fetch(`${API}/api/messages/conversations/${id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ muted }),
      })
      if (!response.ok) {
        showToast('Failed to update mute status', 'error')
        return
      }
      setConversations((prev) => prev.map((conv) => (conv.id === id ? { ...conv, muted } : conv)))
      if (activeConversation?.id === id) {
        setActiveConversation((prev) => prev ? { ...prev, muted } : prev)
      }
    } catch {
      showToast('Failed to update mute status', 'error')
    }
  }, [activeConversation])

  /* ── Socket.io event listeners ───────────────────────────────────────– */
  useEffect(() => {
    if (!socket || !activeConversation) return

    const handleNewMessage = (message) => {
      if (message.conversationId === activeConversation.id) {
        setMessages((prev) => [...prev, message])
      }
      setConversations((prev) => prev.map((conv) => (conv.id === message.conversationId ? { ...conv, lastMessage: message } : conv)))
    }

    const handleEditedMessage = (message) => {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)))
    }

    const handleDeletedMessage = (messageId) => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deleted: true } : m)))
    }

    const handleTypingUpdate = (data) => {
      const { conversationId, username, isTyping } = data
      if (conversationId !== activeConversation.id) return

      setTypingUsers((prev) => {
        const next = new Map(prev)
        const typingSet = next.get(conversationId) || new Set()
        if (isTyping) {
          typingSet.add(username)
        } else {
          typingSet.delete(username)
        }
        if (typingSet.size === 0) {
          next.delete(conversationId)
        } else {
          next.set(conversationId, typingSet)
        }
        return next
      })
    }

    const handleReactionAdded = (data) => {
      const { messageId, emoji } = data
      setMessages((prev) => prev.map((m) => {
        if (m.id === messageId) {
          const reactions = m.reactions || {}
          return { ...m, reactions: { ...reactions, [emoji]: (reactions[emoji] || 0) + 1 } }
        }
        return m
      }))
    }

    const handleReactionRemoved = (data) => {
      const { messageId, emoji } = data
      setMessages((prev) => prev.map((m) => {
        if (m.id === messageId) {
          const reactions = m.reactions || {}
          const count = reactions[emoji] || 0
          if (count <= 1) {
            const next = { ...reactions }
            delete next[emoji]
            return { ...m, reactions: next }
          }
          return { ...m, reactions: { ...reactions, [emoji]: count - 1 } }
        }
        return m
      }))
    }

    socket.on('message:new', handleNewMessage)
    socket.on('message:edited', handleEditedMessage)
    socket.on('message:deleted', handleDeletedMessage)
    socket.on('typing:update', handleTypingUpdate)
    socket.on('reaction:added', handleReactionAdded)
    socket.on('reaction:removed', handleReactionRemoved)

    return () => {
      socket.off('message:new', handleNewMessage)
      socket.off('message:edited', handleEditedMessage)
      socket.off('message:deleted', handleDeletedMessage)
      socket.off('typing:update', handleTypingUpdate)
      socket.off('reaction:added', handleReactionAdded)
      socket.off('reaction:removed', handleReactionRemoved)
    }
  }, [socket, activeConversation])

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
    addReaction,
    removeReaction,
    markAsRead,
    archiveConversation,
    muteConversation,
  }
}
