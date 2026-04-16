// src/mobile/pages/MobileMessageThread.jsx
// Full-screen message thread — shows messages in a conversation with
// real-time updates via Socket.io, message input, and reply support.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../../lib/session-context'
import { useSocket } from '../../lib/useSocket'
import { SOCKET_EVENTS } from '../../lib/socketEvents'
import { API } from '../../config'
import MobileTopBar from '../components/MobileTopBar'

/* ── Fetch helpers ─────────────────────────────────────────────── */

async function fetchConversation(id) {
  const res = await fetch(`${API}/api/messages/conversations/${id}`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Could not load conversation')
  return res.json()
}

async function fetchMessages(conversationId, before) {
  const params = new URLSearchParams({ limit: '40' })
  if (before) params.set('before', before)
  const res = await fetch(
    `${API}/api/messages/conversations/${conversationId}/messages?${params}`,
    { credentials: 'include' },
  )
  if (!res.ok) throw new Error('Could not load messages')
  return res.json()
}

async function sendMessage(conversationId, content, replyToId) {
  const body = { content }
  if (replyToId) body.replyToId = replyToId
  const res = await fetch(`${API}/api/messages/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Could not send message')
  return res.json()
}

async function markRead(conversationId) {
  await fetch(`${API}/api/messages/conversations/${conversationId}/read`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {})
}

/* ── Time formatting ───────────────────────────────────────────── */

function formatMsgTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const now = new Date()
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function shouldShowTimestamp(prev, curr) {
  if (!prev) return true
  const diff = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime()
  return diff > 300000 // 5 minutes
}

/* ── Message bubble ────────────────────────────────────────────── */

function MessageBubble({ message, isMine, showSender, currentUserId }) {
  const senderName = message.sender?.username || 'Unknown'
  const deleted = Boolean(message.deletedAt)
  const edited = Boolean(message.editedAt) && !deleted

  return (
    <div className={`mob-thread-bubble-row ${isMine ? 'mob-thread-bubble-row--mine' : ''}`}>
      <div className={`mob-thread-bubble ${isMine ? 'mob-thread-bubble--mine' : ''}`}>
        {showSender && !isMine && <span className="mob-thread-bubble-sender">{senderName}</span>}

        {message.replyTo && !deleted && (
          <div className="mob-thread-reply-preview">
            <span className="mob-thread-reply-author">
              {message.replyTo.senderId === currentUserId
                ? 'You'
                : message.replyTo.sender?.username || 'Them'}
            </span>
            <span className="mob-thread-reply-text">
              {(message.replyTo.content || '').slice(0, 80)}
            </span>
          </div>
        )}

        <p className={`mob-thread-bubble-text ${deleted ? 'mob-thread-bubble-text--deleted' : ''}`}>
          {deleted ? 'This message was deleted' : message.content}
        </p>

        <div className="mob-thread-bubble-meta">
          <span className="mob-thread-bubble-time">
            {formatMsgTime(message.createdAt || message.timestamp)}
          </span>
          {edited && <span className="mob-thread-bubble-edited">(edited)</span>}
        </div>

        {message.reactions && message.reactions.length > 0 && (
          <div className="mob-thread-reactions">
            {message.reactions.map((r, i) => (
              <span key={i} className="mob-thread-reaction">
                {r.emoji || r.type}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Date divider ──────────────────────────────────────────────── */

function DateDivider({ date }) {
  const d = new Date(date)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()

  const label = sameDay
    ? 'Today'
    : isYesterday
      ? 'Yesterday'
      : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="mob-thread-date-divider">
      <span>{label}</span>
    </div>
  )
}

/* ── Main thread page ──────────────────────────────────────────── */

export default function MobileMessageThread() {
  const { conversationId } = useParams()
  const { user } = useSession()
  const navigate = useNavigate()
  const { socket } = useSocket()

  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [hasOlder, setHasOlder] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [typingUsers, setTypingUsers] = useState([])

  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const bottomRef = useRef(null)
  const typingTimer = useRef(null)

  // Determine display name
  const otherUser =
    conversation?.type === 'dm' ? conversation.participants?.find((p) => p.id !== user?.id) : null
  const threadTitle =
    conversation?.type === 'dm' ? otherUser?.username || 'Chat' : conversation?.name || 'Group Chat'

  // Load conversation + initial messages
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [conv, msgData] = await Promise.all([
          fetchConversation(conversationId),
          fetchMessages(conversationId),
        ])
        if (!active) return
        setConversation(conv)
        const list = Array.isArray(msgData) ? msgData : msgData.messages || []
        setMessages(list)
        setHasOlder(list.length >= 40)
        markRead(conversationId)
      } catch {
        if (active) setMessages([])
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [conversationId])

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!loading && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'instant' })
    }
  }, [loading])

  // Socket.io — join room and listen for real-time events
  useEffect(() => {
    if (!socket || !conversationId) return

    socket.emit(SOCKET_EVENTS.CONVERSATION_JOIN, { conversationId })

    const onNewMessage = (msg) => {
      if (msg.conversationId !== conversationId) return
      // Avoid duplicate if we sent it ourselves
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
      // Auto-scroll if near bottom
      const el = scrollRef.current
      if (el) {
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
        if (nearBottom) {
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        }
      }
      // Mark as read
      markRead(conversationId)
    }

    const onEditMessage = (update) => {
      if (update.conversationId !== conversationId) return
      setMessages((prev) =>
        prev.map((m) =>
          m.id === update.id ? { ...m, content: update.content, editedAt: update.editedAt } : m,
        ),
      )
    }

    const onDeleteMessage = (update) => {
      if (update.conversationId !== conversationId) return
      setMessages((prev) =>
        prev.map((m) =>
          m.id === update.id
            ? { ...m, deletedAt: update.deletedAt || new Date().toISOString() }
            : m,
        ),
      )
    }

    const onTypingStart = ({ userId, username }) => {
      if (userId === user?.id) return
      setTypingUsers((prev) =>
        prev.some((u) => u.userId === userId) ? prev : [...prev, { userId, username }],
      )
    }

    const onTypingStop = ({ userId }) => {
      setTypingUsers((prev) => prev.filter((u) => u.userId !== userId))
    }

    socket.on(SOCKET_EVENTS.MESSAGE_NEW, onNewMessage)
    socket.on(SOCKET_EVENTS.MESSAGE_EDIT, onEditMessage)
    socket.on(SOCKET_EVENTS.MESSAGE_DELETE, onDeleteMessage)
    socket.on(SOCKET_EVENTS.TYPING_START, onTypingStart)
    socket.on(SOCKET_EVENTS.TYPING_STOP, onTypingStop)

    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_NEW, onNewMessage)
      socket.off(SOCKET_EVENTS.MESSAGE_EDIT, onEditMessage)
      socket.off(SOCKET_EVENTS.MESSAGE_DELETE, onDeleteMessage)
      socket.off(SOCKET_EVENTS.TYPING_START, onTypingStart)
      socket.off(SOCKET_EVENTS.TYPING_STOP, onTypingStop)
      socket.emit(SOCKET_EVENTS.CONVERSATION_LEAVE, { conversationId })
    }
  }, [socket, conversationId, user?.id])

  // Load older messages
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasOlder || messages.length === 0) return
    setLoadingOlder(true)
    try {
      const oldest = messages[0]
      const cursor = oldest.createdAt || oldest.timestamp
      const data = await fetchMessages(conversationId, cursor)
      const list = Array.isArray(data) ? data : data.messages || []
      setMessages((prev) => [...list, ...prev])
      setHasOlder(list.length >= 40)
    } catch {
      // ignore
    } finally {
      setLoadingOlder(false)
    }
  }, [conversationId, loadingOlder, hasOlder, messages])

  // Send a message
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    clearTimeout(typingTimer.current)
    if (socket) socket.emit(SOCKET_EVENTS.TYPING_STOP, { conversationId })
    try {
      const msg = await sendMessage(conversationId, text, replyTo?.id)
      setMessages((prev) => [...prev, msg])
      setInput('')
      setReplyTo(null)
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 50)
    } catch {
      // ignore
    } finally {
      setSending(false)
    }
  }, [conversationId, input, replyTo, sending, socket])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  // Long-press to reply
  const handleLongPress = useCallback((msg) => {
    if (msg.deletedAt) return
    setReplyTo(msg)
    inputRef.current?.focus()
  }, [])

  if (loading) {
    return (
      <>
        <MobileTopBar title="..." showBack onBack={() => navigate('/m/messages')} />
        <div className="mob-thread-skeleton">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`mob-thread-skeleton-bubble ${i % 2 === 0 ? 'mob-thread-skeleton-bubble--right' : ''}`}
            />
          ))}
        </div>
      </>
    )
  }

  return (
    <div className="mob-thread">
      <MobileTopBar title={threadTitle} showBack onBack={() => navigate('/m/messages')} />

      <div className="mob-thread-scroll" ref={scrollRef}>
        {/* Load older */}
        {hasOlder && (
          <div className="mob-thread-load-older">
            <button
              type="button"
              className="mob-thread-load-older-btn"
              onClick={loadOlder}
              disabled={loadingOlder}
            >
              {loadingOlder ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="mob-thread-empty">
            <p>No messages yet. Say hello!</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const prev = messages[i - 1]
            const isMine = msg.senderId === user?.id || msg.sender?.id === user?.id
            const showTimestamp = shouldShowTimestamp(prev, msg)
            const showSender =
              conversation?.type !== 'dm' &&
              (!prev || prev.senderId !== msg.senderId || showTimestamp)

            return (
              <div key={msg.id}>
                {showTimestamp && <DateDivider date={msg.createdAt || msg.timestamp} />}
                <div
                  onContextMenu={(e) => {
                    e.preventDefault()
                    handleLongPress(msg)
                  }}
                >
                  <MessageBubble
                    message={msg}
                    isMine={isMine}
                    showSender={showSender}
                    currentUserId={user?.id}
                  />
                </div>
              </div>
            )
          })
        )}

        <div ref={bottomRef} />
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="mob-thread-reply-bar">
          <div className="mob-thread-reply-bar-text">
            Replying to {replyTo.sender?.username || 'message'}
          </div>
          <button
            type="button"
            className="mob-thread-reply-bar-close"
            onClick={() => setReplyTo(null)}
            aria-label="Cancel reply"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="mob-thread-typing">
          {typingUsers.map((u) => u.username).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'}{' '}
          typing...
        </div>
      )}

      {/* Input bar */}
      <div className="mob-thread-input-bar">
        <textarea
          ref={inputRef}
          className="mob-thread-input"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            if (socket && e.target.value.trim()) {
              clearTimeout(typingTimer.current)
              socket.emit(SOCKET_EVENTS.TYPING_START, { conversationId })
              typingTimer.current = setTimeout(() => {
                socket.emit(SOCKET_EVENTS.TYPING_STOP, { conversationId })
              }, 3000)
            }
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={5000}
        />
        <button
          type="button"
          className="mob-thread-send"
          onClick={handleSend}
          disabled={!input.trim() || sending}
          aria-label="Send message"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
