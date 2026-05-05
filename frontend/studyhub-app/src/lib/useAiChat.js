/**
 * useAiChat.js -- Custom hook for Hub AI chat state management.
 * Handles conversations, message sending with SSE streaming, and usage tracking.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import * as aiService from './aiService'
import {
  startStreaming as markStreamActive,
  stopStreaming as markStreamInactive,
} from './streamState'

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
    queueMicrotask(() => {
      loadConversations()
      loadUsage()
    })
  }, [loadConversations, loadUsage])

  // L16-HIGH-3: unmount cleanup. If the provider tears down mid-stream
  // (route change to /login, error boundary reset, hot reload), abort the
  // SSE controller and decrement the streamState refcount so the rest of
  // the app's polling does NOT stay suppressed for 5 minutes waiting on
  // the watchdog.
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        try {
          abortRef.current.abort()
        } catch {
          // ignore — we're tearing down
        }
        abortRef.current = null
        try {
          markStreamInactive()
        } catch {
          // ignore — refcount is already at 0
        }
      }
    }
  }, [])

  // ── Select a conversation and load its messages ──────────────────
  const selectConversation = useCallback(
    async (id) => {
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
    },
    [activeConversationId],
  )

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
  const sendMessage = useCallback(
    async (content, { images, hideFromChat } = {}) => {
      if (!content.trim() || streaming) return

      let convId = activeConversationId

      // Auto-create conversation if none is active.
      if (!convId) {
        const conv = await startNewConversation()
        if (!conv) return
        convId = conv.id
      }

      // Optimistically add the user message to the local list (unless hidden).
      if (!hideFromChat) {
        const userMsg = {
          id: `temp-${Date.now()}`,
          role: 'user',
          content: content.trim(),
          hasImage: images && images.length > 0,
          imageDescription: images ? `${images.length} image(s)` : null,
          createdAt: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, userMsg])
      }
      setStreaming(true)
      markStreamActive()
      setStreamingText('')
      setError(null)
      setTruncated(false)

      let reader = null
      let controller = null
      try {
        const sent = await aiService.sendMessage({
          conversationId: convId,
          content: content.trim(),
          currentPage: location.pathname,
          images: images || undefined,
        })
        reader = sent.reader
        controller = sent.controller

        // Store the controller so stopStreaming() can abort the underlying
        // fetch. Calling reader.cancel() alone leaves the connection open
        // long enough that the bubble's Stop button feels broken — abort
        // closes the socket and fires req.on('close') on the backend.
        abortRef.current = controller
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
                  prev.map((c) => (c.id === convId ? { ...c, title: event.title } : c)),
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
        markStreamInactive()
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
    },
    [activeConversationId, streaming, location.pathname, startNewConversation],
  )

  // ── Continue a truncated generation ──────────────────────────────
  const continueGeneration = useCallback(async () => {
    if (streaming || !truncated || !activeConversationId) return
    setTruncated(false)
    await sendMessage(
      'Continue generating from where you left off. Do not repeat what was already written -- pick up exactly where the previous response ended.',
      { hideFromChat: true },
    )
  }, [streaming, truncated, activeConversationId, sendMessage])

  // ── Delete a conversation ────────────────────────────────────────
  // CLAUDE.md A4: do NOT remove from list before server confirms 200.
  // Throw on failure so the caller can surface a toast and the row
  // stays visible. The caller is responsible for showing a "Deleting…"
  // spinner during the await.
  const removeConversation = useCallback(
    async (id) => {
      await aiService.deleteConversation(id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (id === activeConversationId) {
        setActiveConversationId(null)
        setMessages([])
      }
    },
    [activeConversationId],
  )

  // ── Rename a conversation ────────────────────────────────────────
  const editConversationTitle = useCallback(async (id, title) => {
    try {
      await aiService.renameConversation(id, title)
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
    } catch {
      setError('Failed to rename conversation.')
    }
  }, [])

  // ── Stop streaming ───────────────────────────────────────────────
  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      // abortRef holds an AbortController (see sendMessage). Calling
      // .abort() closes the underlying fetch, which makes the read()
      // loop reject with AbortError (caught silently below) and trips
      // req.on('close') on the backend so Claude stops generating
      // immediately instead of burning tokens we'll never display.
      try {
        abortRef.current.abort()
      } catch {
        /* already aborted */
      }
      abortRef.current = null
      setStreaming(false)
      markStreamInactive()
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
    continueGeneration,
    removeConversation,
    editConversationTitle,
    stopStreaming,
    loadUsage,
  }
}
