/* ═══════════════════════════════════════════════════════════════════════════
 * AiBubble.jsx -- Floating Hub AI bubble widget.
 *
 * Renders a fixed-position circular button in the bottom-right corner.
 * Clicking it opens a compact chat window. State is shared with the /ai page
 * via AiChatProvider (useSharedAiChat).
 *
 * IMPORTANT: This component is wrapped in its own error boundary so that any
 * crash inside the bubble (network failure, provider missing, etc.) can never
 * take down the host page. This is the same pattern Facebook/Meta uses for
 * their chat widgets -- total isolation from the main page tree.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Component, useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { IconSpark, IconX, IconPlus } from '../Icons'
import AiMarkdown from './AiMarkdown'
import AiThinkingDots from './AiThinkingDots'
import { SheetPreviewBar } from './AiSheetPreview'
import { extractHtmlFromMessage } from './aiSheetPreviewHelpers'
import { useSharedAiChat } from '../../lib/aiChatContext'
import { useAiContext } from '../../lib/useAiContext'
import { useChatPanel } from '../../lib/chatPanelContext.js'
import { PAGE_FONT } from '../../pages/shared/pageUtils'

/* ── Isolated error boundary for the bubble ───────────────────────────────
 * If AiBubble crashes, this catches it silently and renders nothing,
 * preventing the crash from propagating to the parent page.
 * Auto-retries once after 10 seconds in case it was a transient failure.
 * ──────────────────────────────────────────────────────────────────────── */
class AiBubbleErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
    this._retryTimer = null
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.warn('[AiBubble] Caught error, hiding bubble:', error?.message || error)
    // Auto-retry once after 10 seconds
    this._retryTimer = setTimeout(() => {
      this.setState({ hasError: false })
    }, 10000)
  }

  componentWillUnmount() {
    if (this._retryTimer) clearTimeout(this._retryTimer)
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

/** Default export wraps the real bubble in an error boundary. */
export default function AiBubble() {
  return (
    <AiBubbleErrorBoundary>
      <AiBubbleInner />
    </AiBubbleErrorBoundary>
  )
}

function AiBubbleInner() {
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const chat = useSharedAiChat()
  const contextChips = useAiContext()
  const { isOpen: chatPanelOpen } = useChatPanel()
  const inputRef = useRef(null)
  const messagesEndRef = useRef(null)
  const [input, setInput] = useState('')

  // Close bubble on Escape key (global).
  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e) => { if (e.key === 'Escape') setIsOpen(false) }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen])

  // Auto-scroll messages.
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chat.messages, chat.streamingText, isOpen])

  // Don't show bubble on the /ai page itself or on auth pages.
  const hiddenPaths = ['/ai', '/login', '/register', '/forgot-password', '/reset-password', '/messages']
  if (hiddenPaths.some((p) => location.pathname.startsWith(p))) return null
  // Hide on reader page (full-screen, has its own AI button)
  if (location.pathname.match(/^\/library\/\d+\/read/)) return null
  // Hide while the slide-out Messages chat panel is open so the two widgets
  // don't stack in the bottom-right corner.
  if (chatPanelOpen) return null

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

  const openFullPage = () => {
    setIsOpen(false)
    const convParam = chat.activeConversationId ? `?conversation=${chat.activeConversationId}` : ''
    navigate(`/ai${convParam}`)
  }

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

          {/* Usage quota bar — daily + weekly */}
          {chat.usage && (
            <div style={{ padding: '6px 14px', fontSize: 10 }}>
              <AiQuotaBar
                label="Today"
                used={chat.usage.daily?.used ?? chat.usage.messagesUsed ?? 0}
                limit={chat.usage.daily?.limit ?? chat.usage.messagesLimit ?? 30}
              />
              {chat.usage.weekly ? (
                <AiQuotaBar
                  label="This week"
                  used={chat.usage.weekly.used}
                  limit={chat.usage.weekly.limit}
                />
              ) : null}
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
              aria-label="Ask Hub AI"
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

/* ═══════════════════════════════════════════════════════════════════════════
 * AiQuotaBar — compact progress indicator for daily/weekly AI usage.
 * Phase 1: renders "12/30 today" with a thin bar that turns amber at
 * >80% and red at 100%.
 * ═══════════════════════════════════════════════════════════════════════════ */
function AiQuotaBar({ label, used, limit }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const isWarning = pct >= 80 && pct < 100
  const isExhausted = pct >= 100

  const barColor = isExhausted
    ? 'var(--sh-danger, #ef4444)'
    : isWarning
      ? 'var(--sh-warning, #f59e0b)'
      : 'var(--sh-brand, #6366f1)'

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        color: isExhausted ? 'var(--sh-danger)' : 'var(--sh-muted)',
        fontSize: 10, fontWeight: 600, marginBottom: 2,
      }}>
        <span>{used}/{limit} {label}</span>
        {isExhausted ? (
          <span style={{ color: 'var(--sh-danger)', fontWeight: 700 }}>Limit reached</span>
        ) : isWarning ? (
          <span style={{ color: 'var(--sh-warning)' }}>{limit - used} left</span>
        ) : (
          <span>{limit - used} left</span>
        )}
      </div>
      <div style={{
        height: 3, borderRadius: 2,
        background: 'var(--sh-soft, #e2e8f0)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: barColor,
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )
}
