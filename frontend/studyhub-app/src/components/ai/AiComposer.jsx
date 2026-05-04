/* ═══════════════════════════════════════════════════════════════════════════
 * AiComposer.jsx — Hub AI v2 composer card.
 *
 * Owns:
 *   - Textarea with auto-grow + ARIA combobox wiring for slash + mention
 *   - Attachment chip strip (multi-file PDF / DOCX / image / text / code)
 *   - Slash command popover (`/summarize`, `/quiz`, `/explain`, `/outline`,
 *     `/cite`, `/translate`, `/define`)
 *   - Mention popover (`@sheet`, `@note`, `@course`)
 *   - Action row (paperclip, slash, mention, recency toggle, model badge)
 *   - Send/Stop button (toggles based on `streaming`)
 *   - Footer (quota readout + Shift+Enter hint, both --sh-subtext for
 *     contrast per L4-HIGH-4)
 *   - Drag-drop overlay (counter pattern per L4-MED-4)
 *   - Quota-reached banner (role="status", links to /pricing)
 *
 * Streams + cancellations live in `useAiChat`; the composer is a leaf.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AttachmentUploadButton,
  AttachmentChipStrip,
  AttachmentDropZone,
} from './AiAttachmentUpload'
import { useAiAttachments, AI_ATTACHMENT_MAX_FILES } from './useAiAttachments'
import AiSlashCommandMenu from './AiSlashCommandMenu'
import { detectSlashTrigger, filterCommands } from './aiSlashCommands'
import AiMentionMenu from './AiMentionMenu'
import { detectMentionTrigger } from './aiMentionHelpers'
import AiStopButton from './AiStopButton'
import { PAGE_FONT } from '../../pages/shared/pageUtils'

const MAX_MESSAGE_LENGTH = 5000

/**
 * @param {{
 *   onSend: (content: string, opts: object) => void,
 *   onStop: () => void,
 *   streaming: boolean,
 *   usage?: { daily?: { used: number, limit: number, remaining: number },
 *             weekly?: { used: number, limit: number } },
 *   courses?: Array<{ id: number, code?: string, name: string }>,
 *   initialPrompt?: string,
 *   density?: 'comfortable' | 'compact',
 * }} props
 */
export default function AiComposer({
  onSend,
  onStop,
  streaming,
  usage,
  courses = [],
  initialPrompt = '',
  density = 'comfortable',
}) {
  const [input, setInput] = useState(() => initialPrompt || '')
  const [recencyPreferred, setRecencyPreferred] = useState(true)
  const textareaRef = useRef(null)
  const mentionMenuRef = useRef(null)

  const {
    attachments,
    addFiles,
    removeAttachment,
    clear: clearAttachments,
    atMax,
    anyUploading,
  } = useAiAttachments()

  // Slash menu state
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashTrigger, setSlashTrigger] = useState(null)
  const [slashIdx, setSlashIdx] = useState(0)

  // Mention menu state
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionTrigger, setMentionTrigger] = useState(null)
  const [mentionRange, setMentionRange] = useState(null)
  const [mentionIdx, setMentionIdx] = useState(0)

  const dailyUsed = usage?.daily?.used ?? 0
  const dailyLimit = usage?.daily?.limit ?? 30
  const dailyRemaining = Math.max(0, dailyLimit - dailyUsed)
  const quotaReached = dailyRemaining <= 0

  const slashItems = useMemo(() => filterCommands(slashTrigger), [slashTrigger])

  const updateMenuState = (newValue, cursorIndex) => {
    const slash = detectSlashTrigger(newValue)
    setSlashOpen(Boolean(slash))
    setSlashTrigger(slash)
    if (slash) setSlashIdx(0)

    const mention = detectMentionTrigger(newValue, cursorIndex)
    setMentionOpen(Boolean(mention))
    setMentionTrigger(mention?.trigger || null)
    setMentionRange(mention ? [mention.start, mention.end] : null)
    if (mention) setMentionIdx(0)
  }

  const handleChange = (e) => {
    const val = e.target.value
    setInput(val)
    updateMenuState(val, e.target.selectionStart || val.length)
  }

  const handleSelectionUpdate = (e) => {
    updateMenuState(input, e.target.selectionStart || input.length)
  }

  const applySlash = (cmd) => {
    if (!cmd) return
    setInput(cmd.template)
    setSlashOpen(false)
    setSlashTrigger(null)
    setTimeout(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      try {
        el.setSelectionRange(cmd.template.length, cmd.template.length)
      } catch {
        /* ignore */
      }
    }, 0)
  }

  const applyMention = (item) => {
    if (!item || !mentionRange) return
    const chip = `@${item.kind}:${item.id}`
    const [start, end] = mentionRange
    const next = `${input.slice(0, start)}${chip} ${input.slice(end)}`
    setInput(next)
    setMentionOpen(false)
    setTimeout(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      const caret = start + chip.length + 1
      try {
        el.setSelectionRange(caret, caret)
      } catch {
        /* ignore */
      }
    }, 0)
  }

  const canSend =
    !streaming &&
    input.trim().length > 0 &&
    input.length <= MAX_MESSAGE_LENGTH &&
    !quotaReached &&
    !anyUploading

  const handleSend = () => {
    if (!canSend) return
    const attachmentIds = attachments
      .filter((a) => a.status === 'done' && a.attachmentId)
      .map((a) => a.attachmentId)
    onSend(input, { attachmentIds, recencyPreferred })
    setInput('')
    clearAttachments()
  }

  const handleKeyDown = (e) => {
    if (slashOpen && slashItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIdx((i) => (i + 1) % slashItems.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIdx((i) => (i - 1 + slashItems.length) % slashItems.length)
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        applySlash(slashItems[slashIdx])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashOpen(false)
        return
      }
    }

    if (mentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIdx((i) => i + 1)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIdx((i) => Math.max(0, i - 1))
        return
      }
      // L4-F1: Tab/Enter confirms the highlighted mention (parity with
      // the slash menu). Falls through to default if no item selected.
      if (e.key === 'Tab' || e.key === 'Enter') {
        const confirmed = mentionMenuRef.current?.confirmActive?.()
        if (confirmed) {
          e.preventDefault()
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionOpen(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !slashOpen && !mentionOpen) {
      e.preventDefault()
      handleSend()
    }
  }

  // Auto-grow textarea height.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, density === 'compact' ? 140 : 200)}px`
  }, [input, density])

  const padding = density === 'compact' ? 12 : 18

  return (
    <AttachmentDropZone onFiles={addFiles}>
      {quotaReached ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: 'var(--sh-warning-bg)',
            border: '1px solid var(--sh-warning-border)',
            color: 'var(--sh-warning-text)',
            padding: '10px 14px',
            borderRadius: 12,
            fontSize: 13,
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ flex: 1 }}>
            You&apos;ve used {dailyUsed}/{dailyLimit} messages today. Upgrade to Pro for 120/day.
          </span>
          <a
            href="/pricing"
            style={{
              background: 'var(--sh-brand)',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Upgrade
          </a>
        </div>
      ) : null}

      <div
        style={{
          background: 'var(--sh-surface)',
          border: '1px solid var(--sh-border)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-sm)',
          padding,
          position: 'relative',
        }}
      >
        <AttachmentChipStrip attachments={attachments} onRemove={removeAttachment} />

        <div style={{ position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyUp={handleSelectionUpdate}
            onClick={handleSelectionUpdate}
            onKeyDown={handleKeyDown}
            placeholder="Ask Hub AI anything…"
            disabled={streaming}
            aria-label="Message Hub AI"
            role="combobox"
            aria-expanded={slashOpen || mentionOpen}
            aria-controls={
              slashOpen ? 'slash-listbox' : mentionOpen ? 'mention-listbox' : undefined
            }
            aria-autocomplete="list"
            aria-activedescendant={
              slashOpen
                ? `slash-opt-${slashIdx}`
                : mentionOpen
                  ? `mention-opt-${mentionIdx}`
                  : undefined
            }
            rows={1}
            style={{
              width: '100%',
              minHeight: density === 'compact' ? 36 : 44,
              maxHeight: density === 'compact' ? 140 : 200,
              border: 'none',
              // L4-HIGH-6: do NOT suppress the focus ring. Fall back to the
              // global :focus-visible rule (2px solid var(--sh-brand) + 2px
              // offset) so keyboard wayfinding stays visible on the most
              // important target on the page.
              outlineOffset: 2,
              resize: 'none',
              fontSize: 14,
              lineHeight: 1.55,
              fontFamily: PAGE_FONT,
              color: 'var(--sh-text)',
              background: 'transparent',
              padding: 0,
            }}
          />

          <AiSlashCommandMenu
            open={slashOpen}
            trigger={slashTrigger}
            activeIdx={Math.min(slashIdx, Math.max(0, slashItems.length - 1))}
            onActiveIdxChange={setSlashIdx}
            onSelect={applySlash}
          />

          <AiMentionMenu
            ref={mentionMenuRef}
            open={mentionOpen}
            trigger={mentionTrigger}
            activeIdx={mentionIdx}
            onActiveIdxChange={setMentionIdx}
            onSelect={applyMention}
            courses={courses}
          />
        </div>

        {/* Action row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 10,
            flexWrap: 'wrap',
          }}
        >
          <AttachmentUploadButton
            onPick={addFiles}
            atMax={atMax}
            disabled={streaming}
            max={AI_ATTACHMENT_MAX_FILES}
          />

          <button
            type="button"
            onClick={() => {
              setInput('/')
              setTimeout(() => {
                const el = textareaRef.current
                if (!el) return
                el.focus()
                try {
                  el.setSelectionRange(1, 1)
                } catch {
                  /* ignore */
                }
                updateMenuState('/', 1)
              }, 0)
            }}
            aria-label="Show slash commands"
            title="Slash commands"
            style={{
              background: 'none',
              border: '1px solid var(--sh-border)',
              borderRadius: 8,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--sh-subtext)',
              cursor: 'pointer',
              minHeight: 36,
              minWidth: 44,
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            }}
          >
            /
          </button>

          <button
            type="button"
            onClick={() => {
              const next = `${input}${input.endsWith(' ') || input === '' ? '' : ' '}@`
              setInput(next)
              setTimeout(() => {
                const el = textareaRef.current
                if (!el) return
                el.focus()
                const len = next.length
                try {
                  el.setSelectionRange(len, len)
                } catch {
                  /* ignore */
                }
                updateMenuState(next, len)
              }, 0)
            }}
            aria-label="Mention a sheet, note, or course"
            title="Mention"
            style={{
              background: 'none',
              border: '1px solid var(--sh-border)',
              borderRadius: 8,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--sh-subtext)',
              cursor: 'pointer',
              minHeight: 36,
              minWidth: 44,
            }}
          >
            @
          </button>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--sh-subtext)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={recencyPreferred}
              onChange={(e) => setRecencyPreferred(e.target.checked)}
              style={{ accentColor: 'var(--sh-brand)' }}
            />
            Prefer recent
          </label>

          <span
            aria-label="Active AI model"
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--sh-subtext)',
              padding: '4px 10px',
              borderRadius: 999,
              border: '1px solid var(--sh-border)',
              letterSpacing: '0.04em',
            }}
          >
            Claude Sonnet 4
          </span>

          {streaming ? (
            <AiStopButton onStop={onStop} />
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send message"
              style={{
                background: canSend
                  ? 'var(--sh-ai-gradient, linear-gradient(135deg,#7c3aed,#2563eb))'
                  : 'var(--sh-soft)',
                color: canSend ? '#fff' : 'var(--sh-subtext)',
                border: 'none',
                borderRadius: 10,
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 700,
                cursor: canSend ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
                minHeight: 44,
                minWidth: 88,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {quotaReached ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
                </svg>
              )}
              Send
            </button>
          )}
        </div>

        {/* Footer row — both texts use --sh-subtext for AA contrast (L4-HIGH-4) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 10,
            fontSize: 11,
            color: 'var(--sh-subtext)',
          }}
        >
          <span>
            {dailyUsed}/{dailyLimit} today
            {usage?.weekly ? ` · ${usage.weekly.used}/${usage.weekly.limit} this week` : ''}
          </span>
          <span>Shift+Enter for new line</span>
        </div>
      </div>
    </AttachmentDropZone>
  )
}
