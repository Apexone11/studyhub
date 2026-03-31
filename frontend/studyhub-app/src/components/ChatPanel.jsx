/* =====================================================================
 * ChatPanel.jsx -- Slide-out compact chat panel for quick replies
 *
 * Renders as a fixed panel on the right side of the viewport.
 * Can be opened from any page via the chat icon in the navbar.
 * Uses createPortal to avoid stacking context issues.
 *
 * Features: conversation list, message thread, GIF search, file
 * attachments, image URL sharing, reply-to, and inline attachment
 * rendering in message bubbles.
 * ===================================================================== */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { API } from '../config'
import { authHeaders } from '../pages/shared/pageUtils'
import { showToast } from '../lib/toast'
import { useSocket } from '../lib/useSocket'
import { useSession } from '../lib/session-context'
import { useFocusTrap } from '../lib/useFocusTrap'
import UserAvatar from './UserAvatar'

const PAGE_FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

/* -- Helpers ------------------------------------------------------------- */
function relTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function truncate(text, max = 50) {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '...' : text
}

/* ── Compact GIF Search Panel ──────────────────────────────────────────── */
function GifSearchPanel({ onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef(null)

  const trimmedQuery = query.trim()
  const displayResults = trimmedQuery ? results : []
  const displayLoading = trimmedQuery ? loading : false

  useEffect(() => {
    if (!trimmedQuery) return undefined
    let cancelled = false
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      if (cancelled) return
      setLoading(true)
      try {
        const resp = await fetch(
          `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(trimmedQuery)}&key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&client_key=studyhub&limit=12&media_filter=tinygif,gif`
        )
        if (resp.ok && !cancelled) {
          const data = await resp.json()
          const gifs = (data.results || []).map((item) => ({
            id: item.id,
            preview: item.media_formats?.tinygif?.url || item.media_formats?.gif?.url || '',
            full: item.media_formats?.gif?.url || item.media_formats?.tinygif?.url || '',
            title: item.content_description || 'GIF',
          }))
          setResults(gifs)
        }
      } catch { /* silent */ }
      if (!cancelled) setLoading(false)
    }, 400)
    return () => { cancelled = true; if (timerRef.current) clearTimeout(timerRef.current) }
  }, [trimmedQuery])

  return (
    <div style={{
      marginBottom: 6, padding: '8px 10px',
      background: 'var(--sh-soft)', borderRadius: 8,
      border: '1px solid var(--sh-border)', maxHeight: 300, display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sh-heading)', fontFamily: PAGE_FONT }}>Search GIFs</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sh-muted)', fontSize: 11, fontFamily: PAGE_FONT }}>Cancel</button>
      </div>
      <input
        type="text"
        placeholder="Search for GIFs..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        style={{
          width: '100%', padding: '5px 8px', marginBottom: 4,
          background: 'var(--sh-surface)', color: 'var(--sh-text)',
          border: '1px solid var(--sh-border)', borderRadius: 6,
          fontSize: 12, fontFamily: PAGE_FONT, boxSizing: 'border-box',
        }}
      />
      <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
        {displayLoading && <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--sh-muted)', fontSize: 11, padding: 6 }}>Searching...</div>}
        {!displayLoading && displayResults.length === 0 && trimmedQuery && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--sh-muted)', fontSize: 11, padding: 6 }}>No GIFs found</div>
        )}
        {displayResults.map((gif) => (
          <button
            key={gif.id}
            onClick={() => onSelect(gif)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, borderRadius: 5, overflow: 'hidden' }}
          >
            <img src={gif.preview} alt={gif.title} loading="lazy" style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 5, display: 'block' }} />
          </button>
        ))}
      </div>
      <div style={{ textAlign: 'right', fontSize: 8, color: 'var(--sh-muted)', marginTop: 3 }}>Powered by Tenor</div>
    </div>
  )
}

/* ======================================================================= */
export default function ChatPanel({ open, onClose }) {
  const { socket, connectionError: socketError } = useSocket()
  const { user } = useSession()
  const currentUserId = user?.id

  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [typingUsers, setTypingUsers] = useState([])
  const messagesEndRef = useRef(null)
  const activeIdRef = useRef(null)
  const typingTimerRef = useRef(null)

  // Feature parity state
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [showImageInput, setShowImageInput] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [attachmentPreviews, setAttachmentPreviews] = useState([])
  const [replyTo, setReplyTo] = useState(null)
  const [hoveredMsgId, setHoveredMsgId] = useState(null)
  const fileInputRef = useRef(null)
  const panelTrapRef = useFocusTrap({ active: open, onClose, lockScroll: false })

  // Keep activeIdRef in sync
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  /* -- Close all feature panels ----------------------------------------- */
  function closeAllPanels() {
    setShowGifPicker(false)
    setShowImageInput(false)
    setImageUrl('')
  }

  /* -- Socket.io: real-time messages + typing ------------------------------ */
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
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        // Emit read receipt
        socket.emit('message:read', { conversationId: currentActiveId })
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
      setMessages((prev) =>
        prev.map((m) => m.id === data.id ? { ...m, deletedAt: data.deletedAt || new Date().toISOString() } : m)
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
    if (socket) {
      socket.emit('conversation:join', { conversationId: id })
      socket.emit('message:read', { conversationId: id })
    }
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
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        }
      } catch { /* silent */ }
    })()
    return () => { cancelled = true }
  }, [activeId])

  /* -- Clean up object URLs on unmount ----------------------------------- */
  useEffect(() => {
    return () => {
      attachmentPreviews.forEach((a) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
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

  if (!open) return null

  const activeConvo = conversations.find(c => c.id === activeId)

  /* -- Message bubble sub-component for thread view ---------------------- */
  function MessageBubble({ msg }) {
    const isOwn = msg.sender?.id === currentUserId || msg.senderId === currentUserId
    const isHovered = hoveredMsgId === msg.id
    const isDeleted = Boolean(msg.deletedAt)

    // Find reply-to message
    const replyToMsg = msg.replyToId
      ? (msg.replyTo || messages.find((m) => m.id === msg.replyToId))
      : null

    return (
      <div
        style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', position: 'relative' }}
        onMouseEnter={() => setHoveredMsgId(msg.id)}
        onMouseLeave={() => setHoveredMsgId(null)}
      >
        <div style={{ maxWidth: '80%', position: 'relative' }}>
          {/* Reply-to reference */}
          {replyToMsg && !isDeleted && (
            <div style={{
              padding: '3px 6px', marginBottom: 1,
              background: isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
              borderRadius: '6px 6px 0 0',
              borderLeft: '2px solid var(--sh-brand)',
              fontSize: 10, color: isOwn ? 'rgba(255,255,255,0.8)' : 'var(--sh-muted)',
            }}>
              <span style={{ fontWeight: 600 }}>{replyToMsg.sender?.username || 'User'}</span>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {truncate(replyToMsg.content, 40)}
              </div>
            </div>
          )}

          <div style={{
            padding: '8px 12px', borderRadius: replyToMsg && !isDeleted ? '0 0 12px 12px' : 12,
            background: isOwn ? 'var(--sh-brand)' : 'var(--sh-soft)',
            color: isOwn ? 'var(--sh-surface)' : 'var(--sh-text)',
            fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word',
          }}>
            {isDeleted ? (
              <em style={{ opacity: 0.6 }}>[Message deleted]</em>
            ) : (
              msg.content
            )}

            {/* Inline attachments */}
            {!isDeleted && Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
              <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {msg.attachments.map((att, idx) => (
                  att.type === 'image' ? (
                    <a key={att.id || idx} href={att.url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={att.url}
                        alt={att.fileName || 'Image'}
                        style={{ maxWidth: '100%', maxHeight: 140, borderRadius: 4, display: 'block' }}
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    </a>
                  ) : (
                    <a
                      key={att.id || idx}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '4px 8px',
                        background: isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
                        borderRadius: 4, color: 'inherit', textDecoration: 'none', fontSize: 11,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                      {att.fileName || 'Download'}
                      {att.fileSize ? ` (${Math.round(att.fileSize / 1024)}KB)` : ''}
                    </a>
                  )
                ))}
              </div>
            )}

            <div style={{ fontSize: 10, marginTop: 3, textAlign: 'right', opacity: 0.7 }}>
              {new Date(msg.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              {msg.editedAt ? ' (edited)' : ''}
            </div>
          </div>

          {/* Reply action on hover */}
          {isHovered && !isDeleted && !msg.pending && (
            <button
              onClick={() => setReplyTo(msg)}
              title="Reply"
              style={{
                position: 'absolute', top: -8, right: isOwn ? 0 : undefined, left: isOwn ? undefined : 0,
                width: 22, height: 22, borderRadius: 4,
                background: 'var(--sh-surface)', border: '1px solid var(--sh-border)',
                cursor: 'pointer', display: 'grid', placeItems: 'center',
                boxShadow: '0 1px 4px rgba(0,0,0,0.1)', color: 'var(--sh-muted)',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
            </button>
          )}
        </div>
      </div>
    )
  }

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
        {/* Header */}
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--sh-border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {activeId ? (
            <>
              <button
                onClick={() => { setActiveId(null); setMessages([]); setReplyTo(null); closeAllPanels(); setAttachmentPreviews([]); setTypingUsers([]) }}
                aria-label="Back to conversations"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--sh-brand)', fontSize: 16, padding: 4,
                }}
              >
                &larr;
              </button>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--sh-heading)', flex: 1 }}>
                {activeConvo?.participants?.[0]?.username || activeConvo?.name || 'Chat'}
              </span>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--sh-heading)', flex: 1 }}>
                Messages
              </span>
              <Link
                to="/messages"
                onClick={onClose}
                style={{ fontSize: 12, color: 'var(--sh-brand)', textDecoration: 'none', fontWeight: 600 }}
              >
                Open full
              </Link>
            </>
          )}
          <button
            onClick={onClose}
            aria-label="Close chat panel"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--sh-muted)', fontSize: 18, padding: 4, lineHeight: 1,
            }}
          >
            x
          </button>
        </div>

        {/* Socket connection warning */}
        {socketError && (
          <div role="alert" style={{
            padding: '6px 12px',
            background: 'var(--sh-info-bg)',
            borderBottom: '1px solid var(--sh-info-border)',
            color: 'var(--sh-info-text)',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sh-warning-text)', flexShrink: 0 }} />
            Live updates paused
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {!activeId ? (
            /* Conversation list */
            loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-muted)', fontSize: 13 }}>
                Loading...
              </div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <p style={{ color: 'var(--sh-muted)', fontSize: 13, margin: 0 }}>No conversations yet</p>
                <Link
                  to="/messages"
                  onClick={onClose}
                  style={{ color: 'var(--sh-brand)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
                >
                  Start a chat
                </Link>
              </div>
            ) : (
              conversations.map(c => {
                const other = c.participants?.[0] || {}
                return (
                  <button
                    key={c.id}
                    onClick={() => selectConversation(c.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', padding: '10px 16px', border: 'none',
                      background: 'transparent', cursor: 'pointer', textAlign: 'left',
                      borderBottom: '1px solid var(--sh-border)',
                      fontFamily: PAGE_FONT,
                    }}
                  >
                    <UserAvatar username={other.username} avatarUrl={other.avatarUrl} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--sh-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {other.username || 'Unknown'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--sh-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.lastMessage?.content?.slice(0, 50) || 'No messages yet'}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--sh-muted)', flexShrink: 0 }}>
                      {relTime(c.lastMessage?.createdAt || c.updatedAt)}
                    </span>
                    {c.unreadCount > 0 && (
                      <span style={{
                        width: 18, height: 18, borderRadius: '50%',
                        background: 'var(--sh-brand)', color: 'var(--sh-surface)',
                        fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center',
                        flexShrink: 0,
                      }}>
                        {c.unreadCount > 9 ? '9+' : c.unreadCount}
                      </span>
                    )}
                  </button>
                )
              })
            )
          ) : (
            /* Message thread */
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {messages.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-muted)', fontSize: 13 }}>
                    No messages yet. Say hello!
                  </div>
                ) : messages.map(msg => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
                {/* Typing indicator */}
                {typingUsers.length > 0 && (
                  <div style={{ padding: '4px 0', fontSize: 11, color: 'var(--sh-muted)', fontStyle: 'italic' }}>
                    {typingUsers.map((u) => u.username).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.gif,.pdf,.doc,.docx,.txt,.zip"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {/* Message input area (only when in a conversation) */}
        {activeId && (
          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--sh-border)' }}>
            {/* Reply-to banner */}
            {replyTo && (
              <div style={{
                marginBottom: 6, padding: '5px 8px',
                background: 'var(--sh-soft)', borderRadius: 6,
                border: '1px solid var(--sh-border)', borderLeft: '3px solid var(--sh-brand)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--sh-brand)' }}>
                    Replying to {replyTo.sender?.username || 'message'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--sh-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {truncate(replyTo.content, 50)}
                  </div>
                </div>
                <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sh-muted)', fontSize: 13, padding: '0 3px', fontFamily: PAGE_FONT }}>x</button>
              </div>
            )}

            {/* Attachment previews */}
            {attachmentPreviews.length > 0 && (
              <div style={{ marginBottom: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {attachmentPreviews.map((ap, i) => (
                  <div key={i} style={{ position: 'relative', border: '1px solid var(--sh-border)', borderRadius: 4, overflow: 'hidden' }}>
                    {ap.type === 'image' && ap.previewUrl ? (
                      <img src={ap.previewUrl} alt={ap.name} style={{ width: 52, height: 52, objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ width: 52, height: 52, display: 'grid', placeItems: 'center', background: 'var(--sh-soft)', fontSize: 9, color: 'var(--sh-muted)', padding: 3, textAlign: 'center', wordBreak: 'break-all' }}>
                        {truncate(ap.name, 10)}
                      </div>
                    )}
                    <button
                      onClick={() => removeAttachmentPreview(i)}
                      style={{
                        position: 'absolute', top: 1, right: 1,
                        width: 14, height: 14, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.6)', color: 'white',
                        border: 'none', cursor: 'pointer', fontSize: 9,
                        display: 'grid', placeItems: 'center', lineHeight: 1,
                      }}
                    >x</button>
                  </div>
                ))}
              </div>
            )}

            {/* Image URL input */}
            {showImageInput && (
              <div style={{ marginBottom: 6, display: 'flex', gap: 4 }}>
                <input
                  type="text"
                  placeholder="Paste image URL..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  autoFocus
                  style={{ flex: 1, padding: '5px 8px', background: 'var(--sh-surface)', color: 'var(--sh-text)', border: '1px solid var(--sh-border)', borderRadius: 6, fontSize: 11, fontFamily: PAGE_FONT }}
                />
                <button onClick={() => { setShowImageInput(false); setImageUrl('') }} style={{ padding: '3px 6px', background: 'var(--sh-soft)', color: 'var(--sh-muted)', border: '1px solid var(--sh-border)', borderRadius: 6, fontSize: 10, cursor: 'pointer', fontFamily: PAGE_FONT }}>
                  Cancel
                </button>
              </div>
            )}

            {/* GIF search panel */}
            {showGifPicker && (
              <GifSearchPanel
                onSelect={handleGifSelect}
                onClose={() => setShowGifPicker(false)}
              />
            )}

            {/* Action bar + text input */}
            <form onSubmit={handleSend} style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
              {/* File attach button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach file"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: attachmentPreviews.length > 0 ? 'var(--sh-brand)' : 'var(--sh-muted)', padding: '5px 2px', flexShrink: 0 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
              </button>
              {/* Image URL button */}
              <button
                type="button"
                onClick={() => { closeAllPanels(); setShowImageInput(!showImageInput) }}
                title="Share image URL"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: showImageInput ? 'var(--sh-brand)' : 'var(--sh-muted)', padding: '5px 2px', flexShrink: 0 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              </button>
              {/* GIF button */}
              <button
                type="button"
                onClick={() => { closeAllPanels(); setShowGifPicker(!showGifPicker) }}
                title="Send GIF"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: showGifPicker ? 'var(--sh-brand)' : 'var(--sh-muted)', padding: '5px 2px', flexShrink: 0, fontWeight: 800, fontSize: 11, fontFamily: PAGE_FONT }}
              >
                GIF
              </button>

              <textarea
                value={input}
                onChange={e => { setInput(e.target.value); if (e.target.value.trim()) emitTypingStart() }}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                aria-label="Message input"
                rows={1}
                maxLength={5000}
                style={{
                  flex: 1, resize: 'none', border: '1px solid var(--sh-border)',
                  borderRadius: 10, padding: '7px 10px', fontSize: 12,
                  fontFamily: PAGE_FONT, background: 'var(--sh-surface)',
                  color: 'var(--sh-text)', outline: 'none', maxHeight: 80,
                  lineHeight: 1.4,
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() && attachmentPreviews.length === 0 && !(showImageInput && imageUrl.trim())}
                aria-label="Send message"
                style={{
                  background: 'var(--sh-brand)', color: 'var(--sh-surface)',
                  border: 'none', borderRadius: 10, padding: '7px 14px',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  opacity: (!input.trim() && attachmentPreviews.length === 0 && !(showImageInput && imageUrl.trim())) || sending ? 0.5 : 1,
                  fontFamily: PAGE_FONT, transition: 'opacity .15s',
                  flexShrink: 0,
                }}
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}
