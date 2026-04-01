/* ═══════════════════════════════════════════════════════════════════════════
 * AiBubble.jsx -- Floating Hub AI bubble widget.
 *
 * Renders a fixed-position circular button in the bottom-right corner.
 * Clicking it opens a compact chat window. State is shared with the /ai page
 * via AiChatProvider (useSharedAiChat).
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { IconSpark, IconX, IconPlus } from '../Icons'
import AiMarkdown from './AiMarkdown'
import AiThinkingDots from './AiThinkingDots'
import { SheetPreviewBar, extractHtmlFromMessage } from './AiSheetPreview'
import { useSharedAiChat } from '../../lib/AiChatProvider'
import { useAiContext } from '../../lib/useAiContext'
import { PAGE_FONT } from '../../pages/shared/pageUtils'

export default function AiBubble() {
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const chat = useSharedAiChat()
  const contextChips = useAiContext()
  const inputRef = useRef(null)
  const messagesEndRef = useRef(null)
  const [input, setInput] = useState('')

  // Don't show bubble on the /ai page itself or on auth pages.
  const hiddenPaths = ['/ai', '/login', '/register', '/forgot-password', '/reset-password']
  if (hiddenPaths.some((p) => location.pathname.startsWith(p))) return null

  const toggle = () => {
    setIsOpen((prev) => !prev)
    if (!isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }

  const MAX_MSG_LEN = 5000

  const handleSend = () => {
    if (!input.trim() || chat.streaming || input.length > MAX_MSG_LEN) return
    chat.sendMessage(input)
    setInput('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  // Close bubble on Escape key (global).
  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e) => { if (e.key === 'Escape') setIsOpen(false) }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen])

  const openFullPage = () => {
    setIsOpen(false)
    const convParam = chat.activeConversationId ? `?conversation=${chat.activeConversationId}` : ''
    navigate(`/ai${convParam}`)
  }

  // Auto-scroll messages.
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chat.messages, chat.streamingText, isOpen])

  const bubble = (
    <>
      {/* Floating Button */}
      <button
        onClick={toggle}
        aria-label={isOpen ? 'Close Hub AI' : 'Open Hub AI'}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'var(--sh-ai-gradient)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          zIndex: 9998,
          transition: 'transform 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        {isOpen ? <IconX size={22} /> : <IconSpark size={24} />}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: 88,
          right: 24,
          width: 'min(380px, calc(100vw - 48px))',
          height: 520,
          maxHeight: 'calc(100vh - 120px)',
          background: 'var(--sh-surface)',
          borderRadius: 16,
          border: '1px solid var(--sh-border)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9997,
          fontFamily: PAGE_FONT,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--sh-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--sh-surface)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: 'var(--sh-ai-gradient)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <IconSpark size={14} style={{ color: '#fff' }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)' }}>Hub AI</span>
              {chat.streaming && (
                <span style={{ fontSize: 11, color: 'var(--sh-brand)', fontWeight: 500 }}>
                  Thinking...
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                onClick={() => { chat.startNewConversation() }}
                title="New conversation"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--sh-muted)' }}
              >
                <IconPlus size={16} />
              </button>
              <button
                onClick={openFullPage}
                title="Open full page"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '3px 8px', fontSize: 11, color: 'var(--sh-brand)',
                  fontWeight: 600,
                }}
              >
                Full page
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
            {!chat.activeConversationId && chat.messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                <IconSpark size={32} style={{ color: 'var(--sh-brand)', marginBottom: 12 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sh-heading)', marginBottom: 6 }}>
                  How can I help?
                </div>
                <div style={{ fontSize: 12, color: 'var(--sh-muted)', lineHeight: 1.5, marginBottom: 14 }}>
                  Ask me anything about your studies. I can create sheets, explain concepts, and quiz you.
                </div>
                {contextChips.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {contextChips.map((chip) => (
                      <button
                        key={chip.label}
                        onClick={() => {
                          if (chip.prompt) {
                            setInput(chip.prompt)
                            setTimeout(() => inputRef.current?.focus(), 100)
                          }
                        }}
                        style={{
                          background: 'var(--sh-soft)', border: '1px solid var(--sh-border)',
                          borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 500,
                          color: 'var(--sh-text)', cursor: 'pointer', transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--sh-brand)'; e.currentTarget.style.color = 'var(--sh-brand)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--sh-border)'; e.currentTarget.style.color = 'var(--sh-text)' }}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {chat.messages.map((msg) => (
              <BubbleMessage key={msg.id} message={msg} />
            ))}

            {/* Streaming */}
            {chat.streaming && chat.streamingText && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--sh-ai-gradient)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <IconSpark size={11} style={{ color: '#fff' }} />
                </div>
                <div style={{
                  background: 'var(--sh-soft)', borderRadius: '4px 12px 12px 12px',
                  padding: '8px 12px', maxWidth: '82%', fontSize: 13,
                }}>
                  <AiMarkdown content={chat.streamingText} />
                </div>
              </div>
            )}

            {chat.streaming && !chat.streamingText && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--sh-ai-gradient)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <IconSpark size={11} style={{ color: '#fff' }} />
                </div>
                <div style={{
                  background: 'var(--sh-soft)', borderRadius: '4px 12px 12px 12px',
                }}>
                  <AiThinkingDots compact />
                </div>
              </div>
            )}

            {chat.error && (
              <div style={{
                background: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)',
                borderRadius: 8, padding: '8px 12px', marginBottom: 8, fontSize: 12,
              }}>
                {chat.error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Usage bar */}
          {chat.usage && (
            <div style={{
              padding: '4px 14px',
              fontSize: 10,
              color: 'var(--sh-muted)',
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              <span>{chat.usage.messagesUsed}/{chat.usage.messagesLimit} today</span>
              <span>{chat.usage.messagesRemaining} left</span>
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: '10px 14px',
            borderTop: '1px solid var(--sh-border)',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Hub AI..."
              rows={1}
              style={{
                flex: 1, resize: 'none', border: '1px solid var(--sh-border)',
                borderRadius: 10, padding: '8px 12px', fontSize: 13,
                fontFamily: PAGE_FONT, color: 'var(--sh-text)',
                background: 'var(--sh-bg)', outline: 'none',
                minHeight: 36, maxHeight: 80, lineHeight: 1.4,
              }}
              onInput={(e) => {
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px'
              }}
            />
            <button
              onClick={chat.streaming ? chat.stopStreaming : handleSend}
              disabled={!chat.streaming && !input.trim()}
              style={{
                background: chat.streaming ? 'var(--sh-danger)' : (input.trim() ? 'var(--sh-brand)' : 'var(--sh-soft)'),
                color: (chat.streaming || input.trim()) ? '#fff' : 'var(--sh-muted)',
                border: 'none', borderRadius: 8, padding: '8px 14px',
                fontSize: 12, fontWeight: 600, cursor: (chat.streaming || input.trim()) ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
              }}
            >
              {chat.streaming ? 'Stop' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </>
  )

  return createPortal(bubble, document.body)
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Bubble Message (compact version)
 * ═══════════════════════════════════════════════════════════════════════════ */
function BubbleMessage({ message }) {
  const isUser = message.role === 'user'

  return (
    <div style={{
      display: 'flex', gap: 8, marginBottom: 10,
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
    }}>
      {!isUser && (
        <div style={{
          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
          background: 'var(--sh-ai-gradient)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconSpark size={11} style={{ color: '#fff' }} />
        </div>
      )}
      <div style={{
        background: isUser ? 'var(--sh-brand)' : 'var(--sh-soft)',
        color: isUser ? '#fff' : 'var(--sh-text)',
        borderRadius: isUser ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
        padding: '8px 12px',
        maxWidth: '82%',
        fontSize: 13,
        wordBreak: 'break-word',
      }}>
        {isUser ? (
          <div style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{message.content}</div>
        ) : (
          <>
            <AiMarkdown content={message.content} />
            {(() => {
              const html = extractHtmlFromMessage(message.content)
              return html ? <SheetPreviewBar html={html} conversationTitle={null} /> : null
            })()}
          </>
        )}
      </div>
    </div>
  )
}
