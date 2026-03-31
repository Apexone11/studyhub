/* =====================================================================
 * ChatPanel.jsx -- Slide-out compact chat panel for quick replies
 *
 * Renders as a fixed panel on the right side of the viewport.
 * Can be opened from any page via the chat icon in the navbar.
 * Uses createPortal to avoid stacking context issues.
 * ===================================================================== */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { API } from '../config'
import { authHeaders } from '../pages/shared/pageUtils'
import { showToast } from '../lib/toast'
import UserAvatar from './UserAvatar'

const PAGE_FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

/* -- Relative time helper ------------------------------------------------ */
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

/* ======================================================================= */
export default function ChatPanel({ open, onClose }) {
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)

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

  /* -- Send message ------------------------------------------------------- */
  async function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || !activeId || sending) return
    setSending(true)
    try {
      const res = await fetch(`${API}/api/messages/conversations/${activeId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({ content: text }),
      })
      if (res.ok) {
        const msg = await res.json()
        setMessages(prev => [...prev, msg])
        setInput('')
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      } else {
        showToast('Failed to send message', 'error')
      }
    } catch {
      showToast('Failed to send message', 'error')
    } finally { setSending(false) }
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
      <div style={{
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
                onClick={() => { setActiveId(null); setMessages([]) }}
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
                    onClick={() => setActiveId(c.id)}
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
                ) : messages.map(msg => {
                  const isOwn = msg.sender?.username === 'me' || msg.senderId === msg._currentUserId
                  return (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '75%', padding: '8px 12px', borderRadius: 12,
                        background: isOwn ? 'var(--sh-brand)' : 'var(--sh-soft)',
                        color: isOwn ? 'var(--sh-surface)' : 'var(--sh-text)',
                        fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word',
                      }}>
                        {msg.deletedAt ? (
                          <em style={{ opacity: 0.6 }}>[Message deleted]</em>
                        ) : (
                          msg.content
                        )}
                        <div style={{
                          fontSize: 10, marginTop: 4, textAlign: 'right',
                          opacity: 0.7,
                        }}>
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          {msg.editedAt ? ' (edited)' : ''}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* Message input (only when in a conversation) */}
        {activeId && (
          <form onSubmit={handleSend} style={{
            padding: '10px 16px', borderTop: '1px solid var(--sh-border)',
            display: 'flex', gap: 8, alignItems: 'flex-end',
          }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) } }}
              placeholder="Type a message..."
              aria-label="Message input"
              rows={1}
              style={{
                flex: 1, resize: 'none', border: '1px solid var(--sh-border)',
                borderRadius: 10, padding: '8px 12px', fontSize: 13,
                fontFamily: PAGE_FONT, background: 'var(--sh-surface)',
                color: 'var(--sh-text)', outline: 'none', maxHeight: 80,
                lineHeight: 1.4,
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              aria-label="Send message"
              style={{
                background: 'var(--sh-brand)', color: 'var(--sh-surface)',
                border: 'none', borderRadius: 10, padding: '8px 16px',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                opacity: (!input.trim() || sending) ? 0.5 : 1,
                fontFamily: PAGE_FONT, transition: 'opacity .15s',
              }}
            >
              Send
            </button>
          </form>
        )}
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}
