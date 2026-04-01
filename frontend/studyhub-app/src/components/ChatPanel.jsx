/* =====================================================================
 * ChatPanel.jsx -- Slide-out compact chat panel for quick replies
 *
 * Orchestrator component that manages state and socket.io connections.
 * Composes child components for:
 * - ConversationList: sidebar list of conversations
 * - ChatHeader: title bar
 * - MessageThread: main message display
 * - MessageInput: input area with attachments and controls
 * - SocketWarning: connection status indicator
 *
 * Renders as a fixed panel on the right side of the viewport.
 * Uses createPortal to avoid stacking context issues.
 * ===================================================================== */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { API } from '../config'
import { authHeaders } from '../pages/shared/pageUtils'
import { showToast } from '../lib/toast'
import { useSocket } from '../lib/useSocket'
import { useSession } from '../lib/session-context'
import { useFocusTrap } from '../lib/useFocusTrap'
import ComponentErrorBoundary from './ComponentErrorBoundary'
import ConversationList from './ChatPanel/ConversationList'
import ChatHeader from './ChatPanel/ChatHeader'
import MessageThread from './ChatPanel/MessageThread'
import MessageInput from './ChatPanel/MessageInput'
import SocketWarning from './ChatPanel/SocketWarning'

const PAGE_FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

/* ======================================================================= */
export default function ChatPanel({ open, onClose }) {
  const { socket, connectionError: socketError } = useSocket()
  const { user } = useSession()
  const currentUserId = user?.id

  // Conversation and message state
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)

  // Message input state
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [typingUsers, setTypingUsers] = useState([])

  // Feature state
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [showImageInput, setShowImageInput] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [attachmentPreviews, setAttachmentPreviews] = useState([])
  const [replyTo, setReplyTo] = useState(null)
  const [hoveredMsgId, setHoveredMsgId] = useState(null)

  // Refs
  const activeIdRef = useRef(null)
  const typingTimerRef = useRef(null)
  const panelTrapRef = useFocusTrap({ active: open, onClose, lockScroll: false })

  // Keep activeIdRef in sync
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      attachmentPreviews.forEach((a) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* -- Socket.io: real-time messages + typing ----------------------------- */
  useEffect(() => {
    if (!socket || !currentUserId) return

    function handleNewMessage(message) {
      const currentActiveId = activeIdRef.current
      // If message is for the active conversation, add it to thread
      if (currentActiveId && message.conversationId === currentActiveId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev
          return [...prev, message]
        })
        setTimeout(() => {
          const elem = document.querySelector('[data-chat-panel-messages-end]')
          elem?.scrollIntoView({ behavior: 'smooth' })
        }, 50)
        // Emit read receipt — prefer socket, fall back to HTTP
        if (socket.connected) {
          socket.emit('message:read', { conversationId: currentActiveId })
        } else {
          fetch(`${API}/api/messages/conversations/${currentActiveId}/read`, {
            method: 'POST',
            headers: authHeaders(),
            credentials: 'include',
          }).catch(() => {})
        }
      }
      // Update conversation list (last message + unread)
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== message.conversationId) return c
          return {
            ...c,
            lastMessage: { content: message.content, createdAt: message.createdAt },
            unreadCount: (c.id === currentActiveId) ? 0 : (c.unreadCount || 0) + 1,
          }
        })
      )
    }

    function handleMessageEdit(data) {
      setMessages((prev) =>
        prev.map((m) => m.id === data.id ? { ...m, content: data.content, editedAt: data.editedAt } : m)
      )
    }

    function handleMessageDelete(data) {
      // Backend emits { messageId, conversationId } — use messageId, not id
      const deletedId = data.messageId || data.id
      setMessages((prev) =>
        prev.map((m) => m.id === deletedId ? { ...m, deletedAt: data.deletedAt || new Date().toISOString() } : m)
      )
    }

    function handleTypingStart(data) {
      if (data.userId === currentUserId) return
      const currentActiveId = activeIdRef.current
      if (data.conversationId !== currentActiveId) return
      setTypingUsers((prev) => {
        if (prev.some((u) => u.userId === data.userId)) return prev
        return [...prev, { userId: data.userId, username: data.username }]
      })
    }

    function handleTypingStop(data) {
      if (data.userId === currentUserId) return
      setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId))
    }

    socket.on('message:new', handleNewMessage)
    socket.on('message:edit', handleMessageEdit)
    socket.on('message:delete', handleMessageDelete)
    socket.on('typing:start', handleTypingStart)
    socket.on('typing:stop', handleTypingStop)

    return () => {
      socket.off('message:new', handleNewMessage)
      socket.off('message:edit', handleMessageEdit)
      socket.off('message:delete', handleMessageDelete)
      socket.off('typing:start', handleTypingStart)
      socket.off('typing:stop', handleTypingStop)
    }
  }, [socket, currentUserId])

  /* -- Emit typing start (throttled) ------------------------------------- */
  function emitTypingStart() {
    if (!socket || !activeId) return
    if (typingTimerRef.current) return // Already typing
    socket.emit('typing:start', { conversationId: activeId })
    typingTimerRef.current = setTimeout(() => {
      // Emit typing:stop when the throttle window expires so other
      // participants do not see a permanent typing indicator.
      if (socket && activeId) socket.emit('typing:stop', { conversationId: activeId })
      typingTimerRef.current = null
    }, 3000)
  }

  /* -- Join conversation room when selecting ------------------------------ */
  function selectConversation(id) {
    // Clear typing for previous conversation
    setTypingUsers([])
    if (typingTimerRef.current) {
      if (socket && activeId) socket.emit('typing:stop', { conversationId: activeId })
      clearTimeout(typingTimerRef.current)
      typingTimerRef.current = null
    }
    setActiveId(id)
    if (socket && socket.connected) {
      socket.emit('conversation:join', { conversationId: id })
      socket.emit('message:read', { conversationId: id })
    } else {
      // HTTP fallback when socket is disconnected
      fetch(`${API}/api/messages/conversations/${id}/read`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      }).catch(() => {})
    }
    // Clear unread badge immediately
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
    )
  }

  /* -- Load conversations ------------------------------------------------ */
  const loadConversations = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/messages/conversations?limit=20`, {
        credentials: 'include', headers: authHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setConversations(Array.isArray(data) ? data : (data.conversations || []))
      }
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (open) loadConversations() }, [open, loadConversations])

  /* -- Load messages for active conversation ----------------------------- */
  useEffect(() => {
    if (!activeId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API}/api/messages/conversations/${activeId}/messages?limit=30`, {
          credentials: 'include', headers: authHeaders(),
        })
        if (res.ok && !cancelled) {
          const data = await res.json()
          const msgs = Array.isArray(data) ? data : (data.messages || [])
          setMessages(msgs)
          setTimeout(() => {
            const elem = document.querySelector('[data-chat-panel-messages-end]')
            elem?.scrollIntoView({ behavior: 'smooth' })
          }, 100)
        }
      } catch { /* silent */ }
    })()
    return () => { cancelled = true }
  }, [activeId])

  /* -- File selection handler -------------------------------------------- */
  function handleFileSelect(e) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const previews = files.slice(0, 5).map((file) => {
      const isImage = file.type.startsWith('image/')
      return {
        file,
        previewUrl: isImage ? URL.createObjectURL(file) : null,
        type: isImage ? 'image' : 'file',
        name: file.name,
        size: file.size,
      }
    })
    setAttachmentPreviews((prev) => [...prev, ...previews].slice(0, 5))
    e.target.value = ''
  }

  function removeAttachmentPreview(index) {
    setAttachmentPreviews((prev) => {
      const removed = prev[index]
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  /* -- Close all feature panels ----------------------------------------- */
  function closeAllPanels() {
    setShowGifPicker(false)
    setShowImageInput(false)
    setImageUrl('')
  }

  /* -- GIF select handler ------------------------------------------------ */
  function handleGifSelect(gif) {
    doSend('', {
      attachments: [{ type: 'image', url: gif.full, fileName: 'gif' }],
    })
    setShowGifPicker(false)
    setReplyTo(null)
  }

  /* -- Send message ------------------------------------------------------- */
  async function doSend(content, options = {}) {
    const text = (content || '').trim()
    const hasFiles = attachmentPreviews.length > 0
    const hasImage = showImageInput && imageUrl.trim()
    const hasOptionAttachments = Array.isArray(options.attachments) && options.attachments.length > 0

    if (!text && !hasFiles && !hasImage && !hasOptionAttachments) return
    if (!activeId || sending) return

    const allAttachments = [...(options.attachments || [])]

    if (hasImage) {
      allAttachments.push({ type: 'image', url: imageUrl.trim() })
    }

    if (hasFiles) {
      for (const ap of attachmentPreviews) {
        if (ap.previewUrl) {
          allAttachments.push({ type: ap.type, url: ap.previewUrl, fileName: ap.name, fileSize: ap.size })
        }
      }
    }

    const body = {
      content: text,
      replyToId: replyTo?.id || null,
    }
    if (allAttachments.length > 0) {
      body.attachments = allAttachments
    }

    setSending(true)
    try {
      const res = await fetch(`${API}/api/messages/conversations/${activeId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const msg = await res.json()
        setMessages(prev => [...prev, msg])
        setInput('')
        setReplyTo(null)
        setAttachmentPreviews([])
        closeAllPanels()
        setTimeout(() => {
          const elem = document.querySelector('[data-chat-panel-messages-end]')
          elem?.scrollIntoView({ behavior: 'smooth' })
        }, 50)
      } else {
        showToast('Failed to send message', 'error')
      }
    } catch {
      showToast('Failed to send message', 'error')
    } finally { setSending(false) }
  }

  function handleSend(e) {
    e.preventDefault()
    doSend(input)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      doSend(input)
    }
  }

  function handleBackButton() {
    setActiveId(null)
    setMessages([])
    setReplyTo(null)
    closeAllPanels()
    setAttachmentPreviews([])
    setTypingUsers([])
  }

  if (!open) return null

  const activeConvo = conversations.find(c => c.id === activeId)

  const panel = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, pointerEvents: 'none' }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.15)',
          pointerEvents: 'auto',
        }}
      />
      {/* Panel */}
      <div ref={panelTrapRef} style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(380px, 100vw)',
        background: 'var(--sh-surface)', borderLeft: '1px solid var(--sh-border)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
        display: 'flex', flexDirection: 'column', pointerEvents: 'auto',
        fontFamily: PAGE_FONT, animation: 'slideInRight .2s ease',
      }}>
        <ComponentErrorBoundary name="Chat">
          <ChatHeader
            activeId={activeId}
            activeConvo={activeConvo}
            onBack={handleBackButton}
            onClose={onClose}
          />

          <SocketWarning socketError={socketError} />

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!activeId ? (
              <ConversationList
                conversations={conversations}
                loading={loading}
                onSelectConversation={selectConversation}
                onOpenFull={onClose}
              />
            ) : (
              <>
                <MessageThread
                  messages={messages}
                  currentUserId={currentUserId}
                  typingUsers={typingUsers}
                  onReply={setReplyTo}
                  hoveredMsgId={hoveredMsgId}
                  onHoverChange={setHoveredMsgId}
                />
                <div data-chat-panel-messages-end />
              </>
            )}
          </div>

          {/* Message input area (only when in a conversation) */}
          {activeId && (
            <MessageInput
              input={input}
              onInputChange={setInput}
              onSend={handleSend}
              onKeyDown={handleKeyDown}
              sending={sending}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              attachmentPreviews={attachmentPreviews}
              onRemoveAttachment={removeAttachmentPreview}
              showImageInput={showImageInput}
              imageUrl={imageUrl}
              onImageUrlChange={setImageUrl}
              onToggleImageInput={(show) => {
                if (!show) {
                  setShowImageInput(false)
                  setImageUrl('')
                } else {
                  closeAllPanels()
                  setShowImageInput(true)
                }
              }}
              showGifPicker={showGifPicker}
              onToggleGifPicker={(show) => {
                if (!show) {
                  setShowGifPicker(false)
                } else {
                  closeAllPanels()
                  setShowGifPicker(true)
                }
              }}
              onGifSelect={handleGifSelect}
              onFileSelect={handleFileSelect}
              emitTypingStart={emitTypingStart}
            />
          )}
        </ComponentErrorBoundary>
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}
