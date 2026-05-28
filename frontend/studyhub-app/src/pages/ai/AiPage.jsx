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
import { showToast } from '../../lib/toast'
import { flattenSchoolsToCourses } from '../../lib/courses.js'
import { PAGE_FONT, authHeaders } from '../shared/pageUtils'
import { pageShell } from '../../lib/ui'
import { API as API_BASE } from '../../config'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'

// Inline trash glyph — Icons.jsx ships no IconTrash today and this file
// is the only consumer. Kept local rather than touching the shared icon
// barrel (out of scope for this fix). Same 24×24 viewBox + currentColor
// + 1.8 stroke conventions as the rest of the icon set.
function IconTrash({ size = 14, ...p }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...p}
    >
      <path d="M4 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="10"
        y1="11"
        x2="10"
        y2="17"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="14"
        y1="11"
        x2="14"
        y2="17"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

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

  // Scholar deep-link: `/ai?paperId=<canonical-id>` fetches the paper
  // and surfaces a PaperContextBanner so the user can start a chat
  // anchored on that paper.
  const paperIdParam = searchParams.get('paperId') || ''
  const [paperContext, setPaperContext] = useState(null)
  const [paperContextError, setPaperContextError] = useState(null)
  useEffect(() => {
    if (!paperIdParam) return undefined
    const ctrl = new AbortController()
    fetch(`${API_BASE}/api/scholar/paper/${encodeURIComponent(paperIdParam)}`, {
      headers: authHeaders(),
      credentials: 'include',
      signal: ctrl.signal,
    })
      .then(async (response) => {
        if (response.status === 404) throw new Error('Paper not found')
        if (!response.ok) throw new Error(`Failed to load paper (${response.status})`)
        const text = await response.text()
        if (!text) throw new Error('Empty paper response')
        return JSON.parse(text)
      })
      .then((data) => {
        const paper = data?.paper || data
        if (paper?.id || paper?.title) {
          setPaperContext({
            id: paper.id || paperIdParam,
            title: paper.title || 'this paper',
            authors: paper.authors || [],
            year:
              paper.year ||
              (paper.publishedAt ? new Date(paper.publishedAt).getUTCFullYear() : null),
            venue: paper.venue || null,
          })
          setPaperContextError(null)
        } else {
          throw new Error('Malformed paper response')
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setPaperContext(null)
        setPaperContextError(err.message || 'Could not load paper context.')
      })
    // Strip the param so a refresh doesn't re-fetch and the URL stays clean.
    queueMicrotask(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('paperId')
          return next
        },
        { replace: true },
      )
    })
    return () => ctrl.abort()
  }, [paperIdParam, setSearchParams])

  // User's enrolled-course list for the "Save as note" Course dropdown
  // on each AI message. Without this, the dropdown only renders
  // "No course" and the user can't tag the saved note with a course.
  // We mirror the NotesPage pattern (useNotesData.js): hit
  // /api/courses/schools once when auth is ready, flatten + dedupe
  // through the shared helper so two users at different schools can't
  // collide on the same course code. Failures swallow silently — the
  // dropdown gracefully degrades to "No course" only, which is the
  // same as the broken state.
  const [aiCourses, setAiCourses] = useState([])
  useEffect(() => {
    if (authStatus !== 'ready') return undefined
    const ctrl = new AbortController()
    fetch(`${API_BASE}/api/courses/schools`, {
      headers: authHeaders(),
      credentials: 'include',
      cache: 'no-cache',
      signal: ctrl.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('schools fetch failed')
        const text = await response.text()
        if (!text) throw new Error('schools fetch returned empty body')
        return JSON.parse(text)
      })
      .then((data) => {
        setAiCourses(flattenSchoolsToCourses(data))
      })
      .catch(() => {
        // Quiet failure — dropdown stays at "No course" only.
      })
    return () => ctrl.abort()
  }, [authStatus])

  // All hooks MUST run before any early return (rules-of-hooks).
  const [density, setDensity] = useState(() => loadDensity())
  // Stopped flag — flips on Stop click so the announcer says "Streaming
  // stopped" instead of "Response complete". Resets when streaming starts
  // again.
  const [stopped, setStopped] = useState(false)
  useEffect(() => {
    if (chat.streaming) queueMicrotask(() => setStopped(false))
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
      {/* sr-only h1 for WCAG 1.3.1 — visual chrome opens straight into
          the conversation list / chat split and never lands an h1.
          Wave-11 audit L4-5. */}
      <h1 className="sr-only">Hub AI</h1>
      <AiStreamAnnouncer streaming={chat.streaming} error={chat.error} stopped={stopped} />
      <Navbar />
      <div style={pageShell('app')}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: layout.columns.appTwoColumn,
            gap: 'var(--sh-space-xl)',
            alignItems: 'start',
          }}
        >
          <div
            style={{
              position: isCompact ? 'static' : 'sticky',
              top: isCompact ? undefined : 'calc(var(--sh-nav-h) + var(--sh-space-lg))',
            }}
          >
            <AppSidebar mode={layout.sidebarMode} />
          </div>
          <main id="main-content">
            <div
              style={{
                display: 'flex',
                gap: 0,
                // The 100px was nav (56) + breathing room (44). Token math:
                // 56 (--sh-nav-h) + 48 (--sh-space-3xl * 1.5) = 104, ≈ the
                // previous 100. Use 100dvh so mobile Safari's URL bar
                // doesn't clip the bottom of the chat panel. dvh has been
                // supported since Safari 15.4 / Chrome 108 (Sep–Nov 2022);
                // older WebViews fall through to no height which is the same
                // as the prior URL-bar-clipped state.
                height: 'calc(100dvh - var(--sh-nav-h) - var(--sh-space-3xl) * 1.5)',
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
                  // Strip ?conversation=N from the URL when the active
                  // conversation is the one being deleted, otherwise
                  // the searchParams effect on this page would try to
                  // reselect it on the next URL bump (e.g. user clicks
                  // a notification, refreshes, or navigates back).
                  onDelete={async (id) => {
                    const wasActive = id === chat.activeConversationId
                    await chat.removeConversation(id)
                    if (wasActive) {
                      setSearchParams(
                        (prev) => {
                          const next = new URLSearchParams(prev)
                          next.delete('conversation')
                          return next
                        },
                        { replace: true },
                      )
                    }
                  }}
                  onRename={chat.editConversationTitle}
                  usage={chat.usage}
                  isCompact={isCompact}
                  loading={chat.loadingConversations}
                />
              )}

              {/* Chat Area — `key={chatAreaKey}` lets a fresh ?prompt=
                  arrival reset internal state cleanly without any
                  setState-during-render workaround inside ChatArea.

                  The Scholar paper-context banner is now passed in as
                  `paperBanner` so it renders as a slim banner at the
                  TOP of the chat column instead of as a flex sibling
                  next to the sidebar (which was producing a giant
                  brand-soft panel beside the empty-state hero — Bug 10). */}
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
                  paperContext={paperContext}
                  paperContextError={paperContextError}
                  onDismissPaperContext={() => {
                    setPaperContext(null)
                    setPaperContextError(null)
                  }}
                  courses={aiCourses}
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
  // Bug 9: rename + delete affordances are now visible on every row
  // (hover-reveal on desktop, always-visible on touch). The delete flow
  // routes through a portal-rendered confirm modal so a stray click in
  // the row doesn't nuke a conversation. CLAUDE.md A4: only remove the
  // row from local state after the server returns 200 — until then we
  // show an inline "Deleting…" spinner + keep the row mounted.
  const [hoveredId, setHoveredId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, title }
  const [deletingId, setDeletingId] = useState(null)

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

  const requestDelete = (conv) => {
    setConfirmDelete({ id: conv.id, title: conv.title || 'New conversation' })
  }

  const performDelete = async () => {
    if (!confirmDelete) return
    const { id } = confirmDelete
    setDeletingId(id)
    setConfirmDelete(null)
    try {
      await onDelete(id)
    } catch {
      showToast('Could not delete conversation. Please try again.', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div
      style={{
        // Conversation list fluidly shrinks 240px → 280px so iPad
        // landscape (1180–1280px) doesn't run out of room for the chat
        // column. On compact (drawer-mode) it goes full width.
        width: isCompact ? '100%' : 'clamp(240px, 22vw, 280px)',
        minWidth: isCompact ? undefined : 240,
        borderRight: isCompact ? 'none' : '1px solid var(--sh-border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 14px 10px',
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
          type="button"
          onClick={onNew}
          aria-label="Start a new conversation"
          style={{
            background: 'var(--sh-brand)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 12px',
            minHeight: 32,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'opacity 0.18s ease',
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
              lineHeight: 1.6,
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: 'var(--sh-heading)',
                marginBottom: 6,
                fontSize: 14,
              }}
            >
              Ask anything, anytime
            </div>
            <div>
              Try &ldquo;explain forking like I&rsquo;m new&rdquo; or &ldquo;summarize my last
              sheet.&rdquo;
            </div>
          </div>
        )}
        {conversations.map((conv) => {
          const isActive = conv.id === activeId
          const isHovered = hoveredId === conv.id
          const isDeleting = deletingId === conv.id
          // Hover-reveal on desktop, always-visible on the active row,
          // and always-visible while the row is mid-delete. Inactive
          // rows show actions on hover so the list stays clean at rest.
          const actionsVisible = isActive || isHovered || isDeleting
          return (
            <div
              key={conv.id}
              // Wrapper is non-interactive so the activator, Rename and
              // Delete buttons can sit as siblings — HTML forbids
              // interactive-in-interactive nesting, which confuses
              // screen readers.
              style={{
                background: isActive ? 'var(--sh-soft)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--sh-brand)' : '3px solid transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                setHoveredId(conv.id)
                if (!isActive) e.currentTarget.style.background = 'var(--sh-soft)'
              }}
              onMouseLeave={(e) => {
                setHoveredId((prev) => (prev === conv.id ? null : prev))
                if (!isActive) e.currentTarget.style.background = 'transparent'
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
                    // Tighter padding at narrow desktop widths so the
                    // list reads denser on iPad landscape without
                    // losing the desktop comfort at wide displays.
                    padding: 'clamp(8px, 1.2vw, 10px) clamp(12px, 1.4vw, 16px)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(conv.id)}
                    aria-current={isActive ? 'page' : undefined}
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
                  {/* Bug 9: rename + delete are now available on EVERY row,
                      not just the active one. Inactive rows hide them at
                      rest (opacity 0) and reveal on hover — the active
                      row keeps them visible so keyboard users always have
                      an obvious affordance on the row they're working in.
                      `visibility: hidden` also pulls inactive-row hidden
                      buttons out of the tab order. While a delete request
                      is in flight we keep the row mounted with a spinner
                      until the server confirms (CLAUDE.md A4 — no
                      optimistic removal). */}
                  <span
                    style={{
                      display: 'flex',
                      gap: 4,
                      visibility: actionsVisible ? 'visible' : 'hidden',
                      opacity: actionsVisible ? 1 : 0,
                      transition: 'opacity 0.15s',
                    }}
                  >
                    {isDeleting ? (
                      <span
                        role="status"
                        aria-live="polite"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          color: 'var(--sh-subtext)',
                          padding: '0 4px',
                        }}
                      >
                        <IconSpinner
                          size={12}
                          style={{
                            animation: 'spin 1s linear infinite',
                            color: 'var(--sh-subtext)',
                          }}
                        />
                        Deleting…
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleRename(conv)}
                          tabIndex={actionsVisible ? 0 : -1}
                          aria-hidden={actionsVisible ? undefined : true}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 2,
                          }}
                          aria-label={`Rename conversation: ${conv.title || 'New conversation'}`}
                          title="Rename"
                        >
                          <IconPen size={12} style={{ color: 'var(--sh-muted)' }} />
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDelete(conv)}
                          tabIndex={actionsVisible ? 0 : -1}
                          aria-hidden={actionsVisible ? undefined : true}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 2,
                          }}
                          aria-label={`Delete conversation: ${conv.title || 'New conversation'}`}
                          title="Delete"
                        >
                          <IconTrash size={13} style={{ color: 'var(--sh-danger-text)' }} />
                        </button>
                      </>
                    )}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Delete-confirm modal — portal'd to <body> so an animated
          ancestor with `transform` can't break the fixed-overlay
          centering (CLAUDE.md "Modals broken inside animated
          containers"). Cancel via Esc or backdrop click; confirm
          calls performDelete which awaits the server before mutating
          the list (CLAUDE.md A4). */}
      {confirmDelete &&
        createPortal(
          <DeleteConfirmModal
            title={confirmDelete.title}
            onCancel={() => setConfirmDelete(null)}
            onConfirm={performDelete}
          />,
          document.body,
        )}

      {/* Usage footer — daily + weekly quota bars */}
      {usage && (
        <div
          style={{
            padding: 'clamp(8px, 1.2vw, 10px) clamp(12px, 1.4vw, 16px)',
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
  paperContext,
  paperContextError,
  onDismissPaperContext,
  courses,
}) {
  const messagesEndRef = useRef(null)
  // initialPrompt is consumed on mount by AiComposer; the parent resets
  // ChatArea via `key` so a fresh prompt arrival re-mounts cleanly.

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  // Empty state (no conversation selected).
  // Bug 10: previously the Scholar paper-context banner was rendered as
  // a flex sibling alongside the sidebar + chat-area columns, so when a
  // paper was attached on a fresh /ai visit the banner became a giant
  // brand-soft vertical strip. The banner now lives INSIDE the chat
  // column as a slim top-row, and the empty-state hero centers in the
  // remaining vertical space below it. Background stays --sh-surface
  // so there's no oversized colored panel.
  if (!activeConversationId) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--sh-surface)',
          minWidth: 0,
        }}
      >
        {(paperContext || paperContextError) && (
          <PaperContextBanner
            paperContext={paperContext}
            paperContextError={paperContextError}
            onDismiss={onDismissPaperContext}
          />
        )}
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
          <h2
            style={{ fontSize: 20, fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 8 }}
          >
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
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      {(paperContext || paperContextError) && (
        <PaperContextBanner
          paperContext={paperContext}
          paperContextError={paperContextError}
          onDismiss={onDismissPaperContext}
        />
      )}
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
          <MessageBubble key={msg.id} message={msg} courses={courses} />
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
 * Paper Context Banner — slim top-row chip rendered INSIDE the chat
 * column when /ai?paperId=… landed the user with attached paper context.
 * Bug 10 fix: previously this lived as a flex-row sibling of the
 * sidebar + chat-area columns, which made the banner inflate into a
 * giant brand-soft vertical strip beside the empty-state hero.
 * ═══════════════════════════════════════════════════════════════════════════ */
function PaperContextBanner({ paperContext, paperContextError, onDismiss }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: '10px 16px',
        background: paperContextError ? 'var(--sh-warning-bg)' : 'var(--sh-brand-soft)',
        color: paperContextError
          ? 'var(--sh-warning-text)'
          : 'var(--sh-pill-text, var(--sh-brand))',
        borderBottom: '1px solid var(--sh-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 'var(--type-sm)',
        minHeight: 44,
        flexShrink: 0,
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
        onClick={onDismiss}
        aria-label="Dismiss paper context"
        style={{
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          color: 'inherit',
          padding: 4,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 28,
          minHeight: 28,
          borderRadius: 6,
        }}
      >
        <IconX size={14} />
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Delete Confirm Modal
 * ═══════════════════════════════════════════════════════════════════════════ */
function DeleteConfirmModal({ title, onCancel, onConfirm }) {
  // Land initial focus on Cancel rather than Delete so an accidental Enter
  // doesn't wipe data. Esc closes; backdrop click closes. (Full focus trap
  // is tracked separately in docs/internal/audits/2026-04-30-deferred-plans.md.)
  const cancelRef = useRef(null)
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-delete-conv-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--sh-surface)',
          color: 'var(--sh-text)',
          border: '1px solid var(--sh-border)',
          borderRadius: 14,
          padding: 22,
          maxWidth: 420,
          width: '100%',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          fontFamily: PAGE_FONT,
        }}
      >
        <h3
          id="ai-delete-conv-title"
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--sh-heading)',
            margin: 0,
            marginBottom: 8,
          }}
        >
          Delete this conversation?
        </h3>
        <p
          style={{
            fontSize: 14,
            color: 'var(--sh-subtext)',
            lineHeight: 1.5,
            margin: 0,
            marginBottom: 18,
          }}
        >
          {`"${title}" will be removed permanently. Messages cannot be recovered.`}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--sh-border)',
              background: 'var(--sh-surface)',
              color: 'var(--sh-text)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--sh-danger)',
              color: 'var(--sh-btn-primary-text, #fff)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Message Bubble
 * ═══════════════════════════════════════════════════════════════════════════ */
function MessageBubble({ message, courses = [] }) {
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
              <AiSaveToNotesButton
                messageId={message.id}
                content={message.content}
                courses={courses}
              />
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
