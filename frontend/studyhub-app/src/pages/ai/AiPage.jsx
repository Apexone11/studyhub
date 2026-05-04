/* ═══════════════════════════════════════════════════════════════════════════
 * AiPage.jsx -- Hub AI dedicated chat page (/ai)
 *
 * Layout: Conversation sidebar (left) + Chat area (right)
 * Handles: conversation CRUD, message sending with SSE streaming,
 * markdown rendering, usage display.
 * ═══════════════════════════════════════════════════════════════════════════ */
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import AiMarkdown from '../../components/ai/AiMarkdown'
import { SheetPreviewBar } from '../../components/ai/AiSheetPreview'
import { extractHtmlFromMessage } from '../../components/ai/aiSheetPreviewHelpers'
import AiComposer from '../../components/ai/AiComposer'
import AiDensityToggle from '../../components/ai/AiDensityToggle'
import { loadDensity } from '../../components/ai/aiDensityStorage'
import AiStreamAnnouncer from '../../components/ai/AiStreamAnnouncer'
import AiSaveToNotesButton from '../../components/ai/AiSaveToNotesButton'
import { IconSpark, IconPlus, IconX, IconPen, IconSpinner } from '../../components/Icons'
import AiThinkingDots from '../../components/ai/AiThinkingDots'
import { useProtectedPage } from '../../lib/useProtectedPage'
import { useResponsiveAppLayout } from '../../lib/ui'
import { usePageTitle } from '../../lib/usePageTitle'
import { useSharedAiChat } from '../../lib/aiChatContext'
import { PAGE_FONT } from '../shared/pageUtils'
import { pageShell } from '../../lib/ui'
import { API as API_BASE } from '../../config'
import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

/* ═══════════════════════════════════════════════════════════════════════════
 * Main Page
 * ═══════════════════════════════════════════════════════════════════════════ */
export default function AiPage() {
  usePageTitle('Hub AI')
  const { status: authStatus } = useProtectedPage()
  const layout = useResponsiveAppLayout()
  const [searchParams, setSearchParams] = useSearchParams()

  const chat = useSharedAiChat()

  // If URL has ?conversation=id, select it. Re-runs when the search-param
  // changes so a same-route notification click (?conversation=1 →
  // ?conversation=2) actually flips the active conversation. Earlier
  // version had `[]` deps and only fired on mount, so clicking a second
  // notification while the AI page was already open did nothing.
  // (Bug audit 2026-05-03, HIGH #2.)
  useEffect(() => {
    const convId = Number.parseInt(searchParams.get('conversation'), 10)
    if (Number.isInteger(convId) && convId > 0) {
      chat.selectConversation(convId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // ?prompt=... is the hand-off used by the AI Suggestion card and
  // other landing-CTAs that want to drop the user into Hub AI with a
  // starter prompt already typed. We pass the text down to ChatArea,
  // then strip it from the URL so a refresh doesn't re-prefill (and so
  // the user can't share a URL that pre-types a message). The
  // Suggestion card already trims and caps to 1000 chars; we still
  // cap defensively here in case the param is hand-typed.
  const promptParam = searchParams.get('prompt') || ''
  const initialPrompt = promptParam.slice(0, 1000)

  // Strip ?prompt= from the URL after capture so a refresh doesn't
  // re-prefill the textarea. The functional setSearchParams form lets
  // us drop the redundant `searchParams` dep (the new param map is
  // computed from `prev`, not from the closed-over searchParams) so
  // the effect only re-runs when promptParam itself changes.
  useEffect(() => {
    if (!promptParam) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('prompt')
        return next
      },
      { replace: true },
    )
  }, [promptParam, setSearchParams])

  // Reset ChatArea via a `key` so its internal state (input, focus
  // effects) re-initializes cleanly when a NEW prompt arrives mid-
  // mount — e.g. user clicks the AI Suggestion CTA while already on
  // /ai. This is React's documented "reset state via key" pattern and
  // avoids the previous in-component setState-during-render dance.
  //
  // The trade: any unsent text the user typed in the prior session
  // is dropped on prompt arrival. That matches the suggestion-CTA
  // contract — clicking another suggestion is "start a new chat with
  // this prompt", not "merge into my current draft".
  //
  // Lazy init: start at 1 if we mounted WITH a prompt (initial paint
  // already consumes it via ChatArea's useState lazy init). Subsequent
  // fresh-prompt arrivals bump the key. The lastSeenPromptRef gates
  // bumps so unrelated parent re-renders (and the post-strip empty-
  // prompt re-render) don't unmount ChatArea unnecessarily.
  const [chatAreaKey, setChatAreaKey] = useState(() => (promptParam ? 1 : 0))
  const lastSeenPromptRef = useRef(promptParam)
  useEffect(() => {
    if (!promptParam) {
      // After strip, the ref resets so a SECOND identical prompt
      // arrival later (user clicks the same CTA twice) still counts
      // as a fresh arrival and bumps the key.
      lastSeenPromptRef.current = ''
      return
    }
    if (promptParam === lastSeenPromptRef.current) return
    lastSeenPromptRef.current = promptParam
    // The setState here is the canonical "synchronize derived state to
    // an external value (URL search param) when it transitions" case.
    // It only fires when promptParam actually changes to a fresh non-
    // empty value, so the cascade is bounded by user navigation, not
    // by render frequency. eslint's set-state-in-effect rule is right
    // for the common cases but this is the documented escape hatch.

    setChatAreaKey((k) => k + 1)
  }, [promptParam])

  // ── Scholar deep-link: ?paperId=<canonical-id> ──────────────────────
  // When the user clicks "Ask AI about this paper" on a Scholar reader,
  // the URL arrives as /ai?paperId=doi:10.1234/foo (or arxiv:.../ss:...).
  // We validate the regex BEFORE fetching (Loop-3 LOW-5), then call
  // /api/scholar/paper/:id to attach metadata as a virtual chip in the
  // composer + seed a starter prompt. The actual AI request is the
  // user's choice — this just primes the surface.
  const paperIdParam = searchParams.get('paperId') || ''
  const [paperContext, setPaperContext] = useState(null)
  const [paperContextError, setPaperContextError] = useState(null)
  // Mirror the backend's CANONICAL_ID_RE: doi: | arxiv: | ss: prefixes
  // with explicit DOI suffix allowlist. Validate before fetching.
  const PAPER_ID_REGEX =
    /^(doi:10\.\d{4,9}\/[A-Za-z0-9._\-/:;()<>+]{1,200}|arxiv:\d{4}\.\d{4,5}(v\d+)?|ss:[a-f0-9]{32,64})$/i
  useEffect(() => {
    if (!paperIdParam) return
    if (!PAPER_ID_REGEX.test(paperIdParam) || paperIdParam.length > 256) {
      setPaperContextError('Invalid paper id')
      // Strip the bad param so a refresh doesn't loop the error.
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('paperId')
          return next
        },
        { replace: true },
      )
      return
    }
    let aborted = false
    fetch(`${API_BASE}/api/scholar/paper/${encodeURIComponent(paperIdParam)}`, {
      credentials: 'include',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load paper (${res.status})`)
        return res.json()
      })
      .then((json) => {
        if (aborted) return
        if (json.paper) {
          setPaperContext(json.paper)
          setPaperContextError(null)
        }
      })
      .catch(() => {
        if (aborted) return
        setPaperContextError('Could not load paper context')
      })
    return () => {
      aborted = true
    }
    // PAPER_ID_REGEX is a const; setSearchParams is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperIdParam])

  // All hooks MUST run before any early return (rules-of-hooks).
  const [density, setDensity] = useState(() => loadDensity())
  // Stopped flag — flips on Stop click so the announcer says "Streaming
  // stopped" instead of "Response complete". Resets when streaming starts
  // again.
  const [stopped, setStopped] = useState(false)
  useEffect(() => {
    if (chat.streaming) setStopped(false)
  }, [chat.streaming])

  if (authStatus !== 'ready') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--sh-bg)', fontFamily: PAGE_FONT }}>
        <Navbar />
        <div style={pageShell('app')}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: 400,
            }}
          >
            <div style={{ textAlign: 'center', color: 'var(--sh-subtext)' }}>
              <IconSpinner
                size={28}
                style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }}
              />
              <div style={{ fontSize: 14 }}>Loading Hub AI...</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const isCompact = layout.isCompact

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--sh-bg)',
        fontFamily: PAGE_FONT,
        overflowX: 'hidden',
      }}
    >
      <AiStreamAnnouncer streaming={chat.streaming} error={chat.error} stopped={stopped} />
      <Navbar />
      <div style={pageShell('app')}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: layout.columns.appTwoColumn,
            gap: 20,
            alignItems: 'start',
          }}
        >
          <div
            style={{ position: isCompact ? 'static' : 'sticky', top: isCompact ? undefined : 74 }}
          >
            <AppSidebar mode={layout.sidebarMode} />
          </div>
          <main id="main-content">
            <div
              style={{
                display: 'flex',
                gap: 0,
                height: 'calc(100vh - 100px)',
                background: 'var(--sh-surface)',
                borderRadius: 16,
                border: '1px solid var(--sh-border)',
                overflow: 'hidden',
              }}
            >
              {/* Conversation Sidebar */}
              {(!isCompact || (isCompact && !chat.activeConversationId)) && (
                <ConversationSidebar
                  conversations={chat.conversations}
                  activeId={chat.activeConversationId}
                  onSelect={chat.selectConversation}
                  onNew={chat.startNewConversation}
                  onDelete={chat.removeConversation}
                  onRename={chat.editConversationTitle}
                  usage={chat.usage}
                  isCompact={isCompact}
                  loading={chat.loadingConversations}
                />
              )}

              {/* Scholar paper-context banner: shows when /ai?paperId=... was
                  used to land here. The metadata is informational; clicking
                  the chip clears the banner without affecting the conversation. */}
              {(paperContext || paperContextError) && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    margin: '12px 16px',
                    padding: '12px 14px',
                    background: paperContextError ? 'var(--sh-warning-bg)' : 'var(--sh-brand-soft)',
                    color: paperContextError
                      ? 'var(--sh-warning-text)'
                      : 'var(--sh-pill-text, var(--sh-brand))',
                    border: '1px solid var(--sh-border)',
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    fontSize: 'var(--type-sm)',
                  }}
                >
                  <strong style={{ fontWeight: 600 }}>
                    {paperContextError ? 'Paper context unavailable.' : 'Attached paper:'}
                  </strong>
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {paperContextError || paperContext?.title || ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPaperContext(null)
                      setPaperContextError(null)
                    }}
                    aria-label="Dismiss paper context"
                    style={{
                      background: 'transparent',
                      border: 0,
                      cursor: 'pointer',
                      color: 'inherit',
                      padding: 4,
                      minWidth: 32,
                      minHeight: 32,
                    }}
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Chat Area — `key={chatAreaKey}` lets a fresh ?prompt=
                  arrival reset internal state cleanly without any
                  setState-during-render workaround inside ChatArea. */}
              {(!isCompact || chat.activeConversationId) && (
                <ChatArea
                  key={chatAreaKey}
                  messages={chat.messages}
                  streaming={chat.streaming}
                  streamingText={chat.streamingText}
                  truncated={chat.truncated}
                  loading={chat.loading}
                  error={chat.error}
                  usage={chat.usage}
                  onSend={chat.sendMessage}
                  onStop={() => {
                    setStopped(true)
                    chat.stopStreaming()
                  }}
                  onContinue={chat.continueGeneration}
                  onBack={isCompact ? () => chat.selectConversation(null) : null}
                  activeConversationId={chat.activeConversationId}
                  onNewChat={chat.startNewConversation}
                  initialPrompt={initialPrompt}
                  density={density}
                  onDensityChange={setDensity}
                />
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Conversation Sidebar
 * ═══════════════════════════════════════════════════════════════════════════ */
// Three-dot pulsing "Thinking" indicator — staggered animation-delay
// so each dot lights up sequentially. Falls back to a static dim dot
// under prefers-reduced-motion / data-reduced-motion (already handled
// globally in index.css).
function pulseDotStyle(delayMs) {
  return {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: 'var(--sh-ai-gradient, linear-gradient(135deg,#7c3aed,#2563eb))',
    animation: 'sh-ai-thinking 1s ease-in-out infinite',
    animationDelay: `${delayMs}ms`,
    display: 'inline-block',
  }
}

function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  usage,
  isCompact,
  loading,
}) {
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')

  const handleRename = (conv) => {
    setEditingId(conv.id)
    setEditTitle(conv.title || '')
  }

  const submitRename = () => {
    if (editTitle.trim() && editingId) {
      onRename(editingId, editTitle.trim())
    }
    setEditingId(null)
  }

  return (
    <div
      style={{
        width: isCompact ? '100%' : 280,
        minWidth: isCompact ? undefined : 280,
        borderRight: isCompact ? 'none' : '1px solid var(--sh-border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 16px 12px',
          borderBottom: '1px solid var(--sh-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconSpark size={18} style={{ color: 'var(--sh-brand)' }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--sh-heading)' }}>Hub AI</span>
        </div>
        <button
          onClick={onNew}
          style={{
            background: 'var(--sh-brand)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <IconPlus size={13} /> New
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {loading && conversations.length === 0 && (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--sh-subtext)',
              fontSize: 13,
            }}
          >
            <IconSpinner
              size={18}
              style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }}
            />
            <div>Loading conversations...</div>
          </div>
        )}
        {!loading && conversations.length === 0 && (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--sh-subtext)',
              fontSize: 13,
            }}
          >
            No conversations yet. Start a new chat!
          </div>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            // Outer wrapper is a non-interactive container so the
            // <button> activator + <button>(Rename) + <button>(Delete)
            // are siblings, not nested interactive elements (HTML
            // forbids interactive-in-interactive nesting; screen
            // readers were getting confused). Copilot a11y finding
            // 2026-05-03.
            style={{
              background: conv.id === activeId ? 'var(--sh-soft)' : 'transparent',
              borderLeft:
                conv.id === activeId ? '3px solid var(--sh-brand)' : '3px solid transparent',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              if (conv.id !== activeId) e.currentTarget.style.background = 'var(--sh-soft)'
            }}
            onMouseLeave={(e) => {
              if (conv.id !== activeId) e.currentTarget.style.background = 'transparent'
            }}
          >
            {editingId === conv.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  submitRename()
                }}
                style={{ display: 'flex', gap: 6, padding: '10px 16px' }}
              >
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={submitRename}
                  style={{
                    flex: 1,
                    fontSize: 13,
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--sh-border)',
                    background: 'var(--sh-bg)',
                    color: 'var(--sh-text)',
                    outline: 'none',
                  }}
                />
              </form>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                  columnGap: 6,
                  padding: '10px 16px',
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(conv.id)}
                  aria-current={conv.id === activeId ? 'page' : undefined}
                  aria-label={`Open conversation: ${conv.title || 'New conversation'}`}
                  style={{
                    display: 'block',
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'inherit',
                    font: 'inherit',
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--sh-text)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      marginBottom: 2,
                    }}
                  >
                    {conv.title || 'New conversation'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--sh-subtext)' }}>
                    {conv._count?.messages || 0} messages
                  </div>
                </button>
                {/* Actions are only meaningful for the active conversation.
                    Hiding via opacity left them keyboard-reachable on
                    inactive rows — Copilot finding 2026-05-03. Switch to
                    `visibility: hidden` (also removes from tab order)
                    and add an explicit tabIndex/aria-hidden pair so the
                    inactive-row buttons can't be focused, clicked by
                    keyboard, or read by a screen reader. */}
                {conv.id === activeId ? (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => handleRename(conv)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                      aria-label="Rename conversation"
                      title="Rename"
                    >
                      <IconPen size={12} style={{ color: 'var(--sh-muted)' }} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(conv.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                      aria-label="Delete conversation"
                      title="Delete"
                    >
                      <IconX size={12} style={{ color: 'var(--sh-danger-text)' }} />
                    </button>
                  </span>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Usage footer — daily + weekly quota bars */}
      {usage && (
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--sh-border)',
            fontSize: 11,
            color: 'var(--sh-subtext)',
            display: 'grid',
            gap: 6,
          }}
        >
          <QuotaRow
            label="Today"
            used={usage.daily?.used ?? usage.messagesUsed ?? 0}
            limit={usage.daily?.limit ?? usage.messagesLimit ?? 30}
          />
          {usage.weekly ? (
            <QuotaRow label="This week" used={usage.weekly.used} limit={usage.weekly.limit} />
          ) : null}
          {/* Upgrade CTA when at or near weekly limit */}
          {usage.weekly && usage.weekly.remaining <= 0 ? (
            <a
              href="/pricing"
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '6px 12px',
                borderRadius: 8,
                background: 'var(--sh-brand)',
                color: 'var(--sh-btn-primary-text, #fff)',
                fontSize: 11,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Upgrade for more messages
            </a>
          ) : null}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Chat Area
 * ═══════════════════════════════════════════════════════════════════════════ */
function ChatArea({
  messages,
  streaming,
  streamingText,
  truncated,
  loading,
  error,
  usage,
  onSend,
  onStop,
  onContinue,
  onBack,
  activeConversationId,
  onNewChat,
  initialPrompt,
  density,
  onDensityChange,
}) {
  const messagesEndRef = useRef(null)
  // initialPrompt is consumed on mount by AiComposer; the parent resets
  // ChatArea via `key` so a fresh prompt arrival re-mounts cleanly.

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  // Empty state (no conversation selected).
  if (!activeConversationId) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--sh-ai-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          }}
        >
          <IconSpark size={32} style={{ color: '#fff' }} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 8 }}>
          How can I help you study today?
        </h2>
        <p
          style={{
            fontSize: 14,
            color: 'var(--sh-subtext)',
            textAlign: 'center',
            maxWidth: 400,
            lineHeight: 1.6,
            marginBottom: 24,
          }}
        >
          I can create study sheets, explain concepts, quiz you on your materials, and analyze
          images of textbooks or notes.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          {[
            { label: 'Create a study sheet', prompt: 'Help me create a study sheet for ' },
            { label: 'Quiz me on my materials', prompt: 'Quiz me on ' },
            { label: 'Explain a concept', prompt: 'Explain the concept of ' },
            { label: 'Summarize my notes', prompt: 'Summarize my notes on ' },
          ].map((suggestion) => (
            <button
              key={suggestion.label}
              onClick={async () => {
                await onNewChat()
                // The new conversation flow re-mounts ChatArea via key so
                // the prompt seed needs to come from URL ?prompt= path.
                // For the empty-state suggestion clicks we just navigate
                // to the prompt by setting URL query — handled at the
                // page level.
                if (typeof window !== 'undefined') {
                  const url = new URL(window.location.href)
                  url.searchParams.set('prompt', suggestion.prompt)
                  window.history.replaceState({}, '', url.toString())
                  // Trigger a re-render via a storage-like event:
                  window.dispatchEvent(new PopStateEvent('popstate'))
                }
              }}
              style={{
                background: 'var(--sh-soft)',
                border: '1px solid var(--sh-border)',
                borderRadius: 10,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--sh-text)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--sh-brand)'
                e.currentTarget.style.color = '#fff'
                e.currentTarget.style.borderColor = 'var(--sh-brand)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--sh-soft)'
                e.currentTarget.style.color = 'var(--sh-text)'
                e.currentTarget.style.borderColor = 'var(--sh-border)'
              }}
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header — Figma 2026-05-03 redesign:
          - Title left
          - Gradient-bordered model pill ("CLAUDE SONNET 4.5") right of title
          - Streaming indicator pinned to the right via marginLeft: auto */}
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--sh-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'var(--sh-surface)',
          position: 'sticky',
          top: 0,
          zIndex: 2,
        }}
      >
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: 'var(--sh-subtext)',
              fontSize: 14,
            }}
          >
            Back
          </button>
        )}
        <IconSpark size={18} style={{ color: 'var(--sh-brand)' }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--sh-heading)' }}>Hub AI</span>
        {/* Model pill — gradient border via padding-box / border-box trick
            so the pill stays text-readable instead of solid-fill gradient.
            Hardcoded to the active model since AI service exposes one. */}
        <span
          aria-label="Active AI model"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--sh-heading)',
            background:
              'linear-gradient(var(--sh-surface), var(--sh-surface)) padding-box, var(--sh-ai-gradient, linear-gradient(135deg,#7c3aed,#2563eb)) border-box',
            border: '1.5px solid transparent',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--sh-ai-gradient, linear-gradient(135deg,#7c3aed,#2563eb))',
            }}
          />
          Claude Sonnet 4
        </span>
        <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          {streaming && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--sh-brand)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span aria-hidden style={pulseDotStyle(0)} />
              <span aria-hidden style={pulseDotStyle(150)} />
              <span aria-hidden style={pulseDotStyle(300)} />
              Thinking
            </span>
          )}
          {typeof onDensityChange === 'function' ? (
            <AiDensityToggle value={density || 'comfortable'} onChange={onDensityChange} />
          ) : null}
        </div>
      </div>

      {/* Messages — role="log" + aria-live="polite" so screen-reader users
          are told when a streaming response is appended. WCAG 2.1 SC 4.1.3
          (Status Messages, Level AA). */}
      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label="Hub AI conversation"
        style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}
      >
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--sh-subtext)' }}>
            <IconSpinner size={24} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming indicator */}
        {streaming && streamingText && (
          <div
            style={{
              display: 'flex',
              gap: 10,
              marginBottom: 16,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                flexShrink: 0,
                background: 'var(--sh-ai-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconSpark size={14} style={{ color: '#fff' }} />
            </div>
            <div
              style={{
                background: 'var(--sh-soft)',
                borderRadius: '4px 14px 14px 14px',
                padding: '10px 14px',
                maxWidth: '80%',
              }}
            >
              <AiMarkdown content={streamingText} />
            </div>
          </div>
        )}

        {streaming && !streamingText && (
          <div
            style={{
              display: 'flex',
              gap: 10,
              marginBottom: 16,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                flexShrink: 0,
                background: 'var(--sh-ai-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconSpark size={14} style={{ color: '#fff' }} />
            </div>
            <div
              style={{
                background: 'var(--sh-soft)',
                borderRadius: '4px 14px 14px 14px',
              }}
            >
              <AiThinkingDots />
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              background: 'var(--sh-danger-bg)',
              color: 'var(--sh-danger-text)',
              borderRadius: 10,
              padding: '10px 14px',
              marginBottom: 12,
              fontSize: 13,
              border: '1px solid var(--sh-danger-border)',
            }}
          >
            {error}
          </div>
        )}

        {truncated && !streaming && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              background: 'var(--sh-warning-bg)',
              border: '1px solid var(--sh-warning-border)',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--sh-warning-text)',
              marginTop: 8,
            }}
          >
            <span style={{ flex: 1 }}>Response was cut off due to length.</span>
            <button
              type="button"
              onClick={onContinue}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--sh-brand)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              Continue
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Composer card — owns attachment chips, slash + mention popovers,
          stop button, quota banner, and footer hints. */}
      <div
        style={{
          padding: '12px 16px 16px',
          borderTop: '1px solid var(--sh-border)',
          background: 'var(--sh-surface)',
        }}
      >
        <AiComposer
          onSend={onSend}
          onStop={onStop}
          streaming={streaming}
          usage={usage}
          initialPrompt={initialPrompt}
          density={density}
        />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Message Bubble
 * ═══════════════════════════════════════════════════════════════════════════ */
function MessageBubble({ message }) {
  const isUser = message.role === 'user'

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        marginBottom: 16,
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
      }}
    >
      {/* Avatar */}
      {!isUser && (
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            flexShrink: 0,
            background: 'var(--sh-ai-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconSpark size={14} style={{ color: '#fff' }} />
        </div>
      )}

      {/* Bubble */}
      <div
        style={{
          background: isUser ? 'var(--sh-brand)' : 'var(--sh-soft)',
          color: isUser ? '#fff' : 'var(--sh-text)',
          borderRadius: isUser ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
          padding: '10px 14px',
          maxWidth: '80%',
          wordBreak: 'break-word',
        }}
      >
        {isUser ? (
          <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {message.content}
            {message.hasImage && (
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4, fontStyle: 'italic' }}>
                [{message.imageDescription || 'Image attached'}]
              </div>
            )}
          </div>
        ) : (
          <>
            <AiMarkdown content={message.content} />
            {(() => {
              const html = extractHtmlFromMessage(message.content)
              return html ? <SheetPreviewBar html={html} conversationTitle={null} /> : null
            })()}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <AiSaveToNotesButton messageId={message.id} content={message.content} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* Phase 1: compact quota row with progress bar */
function QuotaRow({ label, used, limit }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const isWarning = pct >= 80 && pct < 100
  const isExhausted = pct >= 100
  const barColor = isExhausted
    ? 'var(--sh-danger)'
    : isWarning
      ? 'var(--sh-warning)'
      : 'var(--sh-brand)'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span
          style={{ fontWeight: 600, color: isExhausted ? 'var(--sh-danger)' : 'var(--sh-subtext)' }}
        >
          {used}/{limit} {label}
        </span>
        <span
          style={{
            color: isExhausted
              ? 'var(--sh-danger)'
              : isWarning
                ? 'var(--sh-warning)'
                : 'var(--sh-subtext)',
          }}
        >
          {isExhausted ? 'Limit reached' : `${limit - used} left`}
        </span>
      </div>
      <div
        style={{ height: 4, background: 'var(--sh-soft)', borderRadius: 99, overflow: 'hidden' }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: barColor,
            borderRadius: 99,
            transition: 'width 0.3s',
          }}
        />
      </div>
    </div>
  )
}
