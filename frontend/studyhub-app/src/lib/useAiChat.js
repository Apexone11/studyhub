/**
 * useAiChat.js -- Custom hook for Hub AI chat state management.
 * Handles conversations, message sending with SSE streaming, and usage tracking.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import * as aiService from './aiService'

/**
 * Create an SSE parser that buffers partial chunks across reads.
 * Returns a function: feed(chunk) => Event[] that safely handles
 * data: lines split across network boundaries.
 */
function createSSEParser() {
  let buffer = ''

  return function feed(chunk) {
    buffer += chunk
    const events = []

    // SSE frames are delimited by double newlines.
    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)

      // Each frame may contain multiple lines; we only care about data: lines.
      for (const line of frame.split('\n')) {
        if (line.startsWith('data: ')) {
          try {
            events.push(JSON.parse(line.slice(6)))
          } catch {
            // Skip malformed JSON (non-JSON SSE comments, etc.)
          }
        }
      }

      boundary = buffer.indexOf('\n\n')
    }

    return events
  }
}

export function useAiChat() {
  // ── State ────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState(null)
  const [usage, setUsage] = useState(null)
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [truncated, setTruncated] = useState(false)

  const abortRef = useRef(null)
  const location = useLocation()

  // ── Load conversations on mount ──────────────────────────────────
  const loadConversations = useCallback(async () => {
    setLoadingConversations(true)
    try {
      const data = await aiService.listConversations({ limit: 50 })
      setConversations(data.conversations || [])
    } catch {
      // Silently fail -- the user may not have any conversations yet.
    } finally {
      setLoadingConversations(false)
    }
  }, [])

  // ── Load usage on mount ──────────────────────────────────────────
  const loadUsage = useCallback(async () => {
    try {
      const data = await aiService.getUsage()
      setUsage(data)
    } catch {
      // Non-critical
    }
  }, [])

  useEffect(() => {
    loadConversations()
    loadUsage()
  }, [loadConversations, loadUsage])

  // ── Select a conversation and load its messages ──────────────────
  const selectConversation = useCallback(async (id) => {
    if (id === activeConversationId) return
    setActiveConversationId(id)
    setMessages([])
    setStreamingText('')
    setError(null)

    if (!id) return

    setLoading(true)
    try {
      const data = await aiService.getConversation(id)
      setMessages(data.messages || [])
    } catch {
      setError('Failed to load conversation.')
    } finally {
      setLoading(false)
    }
  }, [activeConversationId])

  // ── Create a new conversation ────────────────────────────────────
  const startNewConversation = useCallback(async () => {
    try {
      const conv = await aiService.createConversation()
      setConversations((prev) => [conv, ...prev])
      setActiveConversationId(conv.id)
      setMessages([])
      setStreamingText('')
      setError(null)
      return conv
    } catch {
      setError('Failed to create conversation.')
      return null
    }
  }, [])

  // ── Send a message (with SSE streaming) ──────────────────────────
  const sendMessage = useCallback(async (content, { images } = {}) => {
    if (!content.trim() || streaming) return

    let convId = activeConversationId

    // Auto-create conversation if none is active.
    if (!convId) {
      const conv = await startNewConversation()
      if (!conv) return
      convId = conv.id
    }

    // Optimistically add the user message to the local list.
    const userMsg = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      hasImage: images && images.length > 0,
      imageDescription: images ? `${images.length} image(s)` : null,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setStreaming(true)
    setStreamingText('')
    setError(null)
    setTruncated(false)

    try {
      const reader = await aiService.sendMessage({
        conversationId: convId,
        content: content.trim(),
        currentPage: location.pathname,
        images: images || undefined,
      })

      abortRef.current = reader
      const decoder = new TextDecoder()
      const feedSSE = createSSEParser()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const events = feedSSE(chunk)

        for (const event of events) {
          switch (event.type) {
            case 'delta':
              fullText += event.text
              setStreamingText(fullText)
              break

            case 'title':
              // Update the conversation title in our list.
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === convId ? { ...c, title: event.title } : c
                )
              )
              break

            case 'done':
              // Replace streaming text with the final saved message.
              setMessages((prev) => [
                ...prev,
                {
                  id: event.messageId,
                  role: 'assistant',
                  content: fullText,
                  tokenCount: event.tokenCount,
                  createdAt: new Date().toISOString(),
                },
              ])
              setStreamingText('')
              // Update usage from the event.
              if (event.usage) {
                setUsage((prev) => ({
                  ...prev,
                  messagesUsed: event.usage.used,
                  messagesRemaining: event.usage.limit - event.usage.used,
                }))
              }
              break

            case 'truncated':
              setTruncated(true)
              break

            case 'error':
              setError(event.message)
              break
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Failed to get AI response.')
      }
      setStreamingText('')
    } finally {
      setStreaming(false)
      abortRef.current = null
      // Bump the conversation to the top of the list.
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === convId)
        if (idx <= 0) return prev
        const updated = [...prev]
        const [moved] = updated.splice(idx, 1)
        moved.updatedAt = new Date().toISOString()
        return [moved, ...updated]
      })
    }
  }, [activeConversationId, streaming, location.pathname, startNewConversation])

  // ── Delete a conversation ────────────────────────────────────────
  const removeConversation = useCallback(async (id) => {
    try {
      await aiService.deleteConversation(id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (id === activeConversationId) {
        setActiveConversationId(null)
        setMessages([])
      }
    } catch {
      setError('Failed to delete conversation.')
    }
  }, [activeConversationId])

  // ── Rename a conversation ────────────────────────────────────────
  const editConversationTitle = useCallback(async (id, title) => {
    try {
      await aiService.renameConversation(id, title)
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c))
      )
    } catch {
      setError('Failed to rename conversation.')
    }
  }, [])

  // ── Stop streaming ───────────────────────────────────────────────
  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.cancel()
      abortRef.current = null
      setStreaming(false)
      // Keep whatever text has streamed so far as the final message.
      if (streamingText) {
        setMessages((prev) => [
          ...prev,
          {
            id: `stopped-${Date.now()}`,
            role: 'assistant',
            content: streamingText,
            createdAt: new Date().toISOString(),
          },
        ])
        setStreamingText('')
      }
    }
  }, [streamingText])

  return {
    // State
    conversations,
    activeConversationId,
    messages,
    loading,
    loadingConversations,
    streaming,
    streamingText,
    truncated,
    error,
    usage,

    // Actions
    loadConversations,
    selectConversation,
    startNewConversation,
    sendMessage,
    removeConversation,
    editConversationTitle,
    stopStreaming,
    loadUsage,
  }
}
