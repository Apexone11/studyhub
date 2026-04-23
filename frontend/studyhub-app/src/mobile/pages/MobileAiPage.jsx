// src/mobile/pages/MobileAiPage.jsx
// Native Hub AI tab: single-column chat thread, sliding conversation drawer,
// SSE streaming, usage chip, stop/continue controls. Reuses the existing
// `useAiChat` hook (same API surface as the web AiPage) so conversations,
// messages, and usage stay in sync across surfaces.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MobileTopBar from '../components/MobileTopBar'
import AiOrb from '../components/AiOrb'
import Chip from '../components/Chip'
import AiMarkdown from '../../components/ai/AiMarkdown'
import AiThinkingDots from '../../components/ai/AiThinkingDots'
import { useAiChat } from '../../lib/useAiChat'
import { useToast } from '../hooks/useToast'

/* ── Small inline icons ─────────────────────────────────────────── */

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6h18M3 12h18M3 18h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconPlus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconSend() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconStop() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/* ── Sub-components ─────────────────────────────────────────────── */

function UsageChip({ usage }) {
  if (!usage) return null
  const used = usage.messagesUsed ?? 0
  const limit = (usage.messagesRemaining ?? 0) + used
  if (!limit) return null
  const ratio = used / limit
  const tone = ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warning' : 'normal'

  const background =
    tone === 'danger'
      ? 'var(--sh-danger-bg)'
      : tone === 'warning'
        ? 'var(--sh-warning-bg)'
        : 'var(--sh-brand-soft-bg)'
  const color =
    tone === 'danger'
      ? 'var(--sh-danger-text)'
      : tone === 'warning'
        ? 'var(--sh-warning-text)'
        : 'var(--sh-brand)'

  return (
    <div
      style={{
        padding: '4px 10px',
        borderRadius: 999,
        background,
        color,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {used}/{limit} today
    </div>
  )
}

function MessageBubble({ message, isUser }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        padding: '4px 16px',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          padding: '10px 14px',
          borderRadius: 16,
          borderBottomRightRadius: isUser ? 4 : 16,
          borderBottomLeftRadius: isUser ? 16 : 4,
          background: isUser ? 'var(--sh-brand)' : 'var(--sh-surface)',
          color: isUser ? 'var(--sh-btn-primary-text)' : 'var(--sh-text)',
          border: isUser ? 'none' : '1px solid var(--sh-border)',
          fontSize: 15,
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {isUser ? (
          <>
            {message.content}
            {message.hasImage && (
              <div
                style={{
                  fontSize: 11,
                  opacity: 0.8,
                  marginTop: 4,
                }}
              >
                {message.imageDescription}
              </div>
            )}
          </>
        ) : (
          <AiMarkdown content={message.content} />
        )}
      </div>
    </div>
  )
}

function StreamingBubble({ text }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '4px 16px' }}>
      <div
        style={{
          maxWidth: '85%',
          padding: '10px 14px',
          borderRadius: 16,
          borderBottomLeftRadius: 4,
          background: 'var(--sh-surface)',
          color: 'var(--sh-text)',
          border: '1px solid var(--sh-border)',
          fontSize: 15,
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        <AiMarkdown content={text} />
      </div>
    </div>
  )
}

const STARTER_SUGGESTIONS = [
  'Summarize my latest note',
  'Make a study sheet from my class',
  'Quiz me on what I just read',
  'Explain this concept simply',
]

function EmptyThread({ onSuggestionPick }) {
  return (
    <div className="sh-m-ai-landing">
      <AiOrb size={120} thinking />
      <h3 className="sh-m-ai-landing__title">Ask Hub AI anything</h3>
      <p className="sh-m-ai-landing__sub">
        Summarize a note, explain a concept, or generate a study sheet. Your chats sync with the
        StudyHub website.
      </p>
      <div className="sh-m-ai-landing__chips">
        {STARTER_SUGGESTIONS.map((text) => (
          <Chip
            key={text}
            variant="soft"
            onPress={
              typeof onSuggestionPick === 'function' ? () => onSuggestionPick(text) : undefined
            }
          >
            {text}
          </Chip>
        ))}
      </div>
    </div>
  )
}

function ConversationsDrawer({
  open,
  onClose,
  conversations,
  activeId,
  onSelect,
  onDelete,
  onNew,
  loading,
}) {
  const toast = useToast()
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const confirmTimerRef = useRef(null)

  // Clear the auto-reset timer on unmount.
  useEffect(
    () => () => {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current)
        confirmTimerRef.current = null
      }
    },
    [],
  )

  const handleDeleteClick = useCallback(
    (convId) => {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current)
        confirmTimerRef.current = null
      }
      if (confirmDeleteId === convId) {
        setConfirmDeleteId(null)
        onDelete(convId)
        toast.show({ message: 'Chat deleted', kind: 'success' })
        return
      }
      setConfirmDeleteId(convId)
      toast.show({ message: 'Tap delete again to confirm', kind: 'warn' })
      confirmTimerRef.current = setTimeout(() => {
        setConfirmDeleteId(null)
        confirmTimerRef.current = null
      }, 3500)
    },
    [confirmDeleteId, onDelete, toast],
  )

  // Wrap onClose so any armed delete is dropped when the drawer closes.
  const handleClose = useCallback(() => {
    setConfirmDeleteId(null)
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current)
      confirmTimerRef.current = null
    }
    onClose()
  }, [onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close conversations"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          zIndex: 70,
          border: 'none',
          padding: 0,
          cursor: 'default',
        }}
      />
      {/* Drawer panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Conversations"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 'min(320px, 85vw)',
          background: 'var(--sh-bg)',
          borderRight: '1px solid var(--sh-border)',
          zIndex: 71,
          display: 'flex',
          flexDirection: 'column',
          animation: 'mob-ai-drawer-in 0.2s ease-out',
        }}
      >
        <style>{`
          @keyframes mob-ai-drawer-in {
            from { transform: translateX(-100%); }
            to { transform: translateX(0); }
          }
        `}</style>
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 14px',
            borderBottom: '1px solid var(--sh-border)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--sh-heading)' }}>
            Chats
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--sh-subtext)',
              padding: 8,
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <IconClose />
          </button>
        </header>

        <button
          type="button"
          onClick={() => {
            onNew()
            onClose()
          }}
          style={{
            margin: '12px 14px',
            padding: '10px 14px',
            borderRadius: 10,
            background: 'var(--sh-brand)',
            color: 'var(--sh-btn-primary-text)',
            border: 'none',
            fontSize: 14,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            cursor: 'pointer',
          }}
        >
          <IconPlus /> New chat
        </button>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
          {loading ? (
            <div
              style={{
                padding: '16px',
                fontSize: 13,
                color: 'var(--sh-subtext)',
                textAlign: 'center',
              }}
            >
              Loading conversations...
            </div>
          ) : conversations.length === 0 ? (
            <div
              style={{
                padding: '16px',
                fontSize: 13,
                color: 'var(--sh-subtext)',
                textAlign: 'center',
              }}
            >
              No chats yet.
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === activeId
              return (
                <div
                  key={conv.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    borderRadius: 8,
                    margin: '2px 0',
                    background: isActive ? 'var(--sh-brand-soft-bg)' : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(conv.id)
                      onClose()
                    }}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      padding: '10px 12px',
                      color: isActive ? 'var(--sh-brand)' : 'var(--sh-text)',
                      fontSize: 14,
                      fontWeight: isActive ? 600 : 500,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {conv.title || 'New chat'}
                  </button>
                  <button
                    type="button"
                    aria-label={
                      confirmDeleteId === conv.id
                        ? 'Tap again to confirm delete'
                        : 'Delete conversation'
                    }
                    onClick={() => handleDeleteClick(conv.id)}
                    style={{
                      background: confirmDeleteId === conv.id ? 'var(--sh-danger-bg)' : 'none',
                      border: 'none',
                      padding: '8px 10px',
                      color:
                        confirmDeleteId === conv.id ? 'var(--sh-danger-text)' : 'var(--sh-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      borderRadius: 6,
                      transition: 'background 0.15s ease, color 0.15s ease',
                    }}
                  >
                    <IconTrash />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </aside>
    </>
  )
}

/* ── Main page ──────────────────────────────────────────────────── */

export default function MobileAiPage() {
  const {
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
    selectConversation,
    startNewConversation,
    sendMessage,
    continueGeneration,
    removeConversation,
    stopStreaming,
  } = useAiChat()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)
  const textareaRef = useRef(null)

  const canSend = input.trim().length > 0 && !streaming
  const limitReached = usage && (usage.messagesRemaining ?? 1) <= 0

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || streaming || limitReached) return
    setInput('')
    await sendMessage(trimmed)
  }, [input, streaming, limitReached, sendMessage])

  const handleKeyDown = useCallback(
    (event) => {
      // On mobile, Enter inserts a newline by default; Ctrl/Cmd+Enter sends.
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  // Auto-scroll to bottom on new messages / streaming text.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, streamingText])

  // Auto-size textarea up to ~5 lines.
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`
  }, [input])

  const headerLeft = (
    <button
      type="button"
      className="mob-topbar-back"
      onClick={() => setDrawerOpen(true)}
      aria-label="Open chats"
    >
      <IconMenu />
    </button>
  )

  const headerRight = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <UsageChip usage={usage} />
      <button
        type="button"
        className="mob-topbar-back"
        onClick={() => {
          void startNewConversation()
        }}
        aria-label="New chat"
      >
        <IconPlus />
      </button>
    </div>
  )

  const showThinkingDots = useMemo(
    () => streaming && streamingText.length === 0,
    [streaming, streamingText],
  )

  return (
    <div className="mob-ai-wrap">
      <MobileTopBar title="Hub AI" left={headerLeft} right={headerRight} />

      <ConversationsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={selectConversation}
        onDelete={removeConversation}
        onNew={startNewConversation}
        loading={loadingConversations}
      />

      {/* Scrollable thread area */}
      <div ref={scrollRef} className="mob-ai-thread">
        {loading ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }} aria-busy="true">
            <div
              className="mob-feed-spinner"
              role="status"
              aria-label="Loading conversation"
              style={{ margin: '0 auto' }}
            />
          </div>
        ) : messages.length === 0 && !streaming ? (
          <EmptyThread onSuggestionPick={(text) => setInput(text)} />
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} isUser={msg.role === 'user'} />
            ))}
            {showThinkingDots && <AiThinkingDots />}
            {streamingText && <StreamingBubble text={streamingText} />}
            {truncated && !streaming && (
              <div style={{ padding: '6px 16px' }}>
                <button
                  type="button"
                  onClick={continueGeneration}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 10,
                    background: 'var(--sh-brand-soft-bg)',
                    color: 'var(--sh-brand)',
                    border: '1px solid var(--sh-brand-border)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Continue response
                </button>
              </div>
            )}
            {error && (
              <div
                role="alert"
                style={{
                  margin: '8px 16px',
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'var(--sh-danger-bg)',
                  color: 'var(--sh-danger-text)',
                  border: '1px solid var(--sh-danger-border)',
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}
          </>
        )}
      </div>

      {/* Composer */}
      <div className="mob-ai-composer">
        <textarea
          ref={textareaRef}
          aria-label="Message Hub AI"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={limitReached ? 'Daily limit reached' : 'Ask Hub AI...'}
          disabled={limitReached}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            padding: '10px 14px',
            borderRadius: 20,
            border: '1px solid var(--sh-input-border)',
            background: 'var(--sh-input-bg)',
            color: 'var(--sh-input-text)',
            fontSize: 15,
            lineHeight: 1.4,
            fontFamily: 'inherit',
            outline: 'none',
            maxHeight: 140,
            minHeight: 42,
          }}
        />
        {streaming ? (
          <button
            type="button"
            aria-label="Stop generating"
            onClick={stopStreaming}
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: 'var(--sh-danger)',
              color: 'var(--sh-btn-primary-text)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <IconStop />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Send message"
            onClick={handleSend}
            disabled={!canSend || limitReached}
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: canSend && !limitReached ? 'var(--sh-brand)' : 'var(--sh-slate-300)',
              color: 'var(--sh-btn-primary-text)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: canSend && !limitReached ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
            }}
          >
            <IconSend />
          </button>
        )}
      </div>
    </div>
  )
}
