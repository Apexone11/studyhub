/**
 * GenerateSheetFromPaperButton — "Generate study sheet from this paper".
 *
 * AI write action, so it goes through the universal `useAiPermission()`
 * gate before anything that costs the user a quota message hits the wire.
 *
 * Click flow:
 *   1. Open AiPermissionDialog ("Generate study sheet from this paper?").
 *   2. On accept → POST /api/scholar/ai/generate-sheet with body
 *      { paperId } which returns `{ context, suggestedPrompt,
 *      quotaCostMessages }` only (no AI call yet — that's the master
 *      plan's single-spend-point rule).
 *   3. Forward to POST /api/ai/messages with the suggestedPrompt + the
 *      Scholar context block, stream the SSE response, and read the
 *      `sheet:created` event (or final `done` payload) for the new
 *      sheet id, then navigate to /sheets/:id/edit.
 *   4. On reject → toast "Discarded — no changes made." and exit.
 *   5. If the scholar/generate-sheet route returns 404 (feature not yet
 *      wired) → toast "Feature coming soon" and exit cleanly.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API } from '../../../config'
import { showToast } from '../../../lib/toast'
import { useAiPermission } from '../../../lib/aiPermissionContext'

const BTN_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '10px 16px',
  background: 'linear-gradient(135deg, var(--sh-brand), var(--sh-brand-accent))',
  border: '1px solid transparent',
  borderRadius: '12px',
  color: 'white',
  fontFamily: 'inherit',
  fontSize: 'var(--type-sm)',
  fontWeight: 600,
  minHeight: '44px',
  minWidth: '44px',
  cursor: 'pointer',
  textDecoration: 'none',
}

async function parseSseForSheetId(response) {
  // The /api/ai/messages SSE stream uses pino-style line-delimited events.
  // We only need to find the `sheetId` once, so we read the full body
  // (capped) and scan for either a `sheet:created` event with a JSON
  // payload `{ sheetId }`, or a final `done` event carrying the same.
  // Defensive: if neither shows up, return null and the caller toasts a
  // friendly fallback rather than navigating to a broken URL.
  const reader = response.body?.getReader?.()
  if (!reader) return null
  const decoder = new TextDecoder()
  let buf = ''
  const MAX = 1024 * 1024 // 1 MB cap — sheet HTML can be large but a single id is well under this.
  let received = 0
  let sheetId = null
  while (true) {
    const chunk = await reader.read().catch(() => ({ done: true }))
    if (chunk.done) break
    received += chunk.value?.byteLength || 0
    buf += decoder.decode(chunk.value, { stream: true })
    if (received > MAX) break
    // Look for "sheetId":... or sheet:created event in the buffered text.
    const m = buf.match(/"sheetId"\s*:\s*"?([A-Za-z0-9_-]+)"?/)
    if (m && m[1]) {
      sheetId = m[1]
      break
    }
  }
  try {
    reader.cancel()
  } catch {
    // Ignore — the stream may already be closed; cancel is best-effort.
  }
  return sheetId
}

export default function GenerateSheetFromPaperButton({ paper, children, className, style }) {
  const navigate = useNavigate()
  const { requestPermission } = useAiPermission()
  const [busy, setBusy] = useState(false)

  if (!paper || !paper.id) return null

  async function onClick() {
    if (busy) return

    const ok = await requestPermission({
      kind: 'sheet.generate_from_paper',
      title: 'Generate study sheet from this paper?',
      summary:
        'Hub AI will read this paper and draft a new study sheet (full HTML). You can edit before publishing.',
      destructive: false,
      applyLabel: 'Generate',
      rejectLabel: 'Cancel',
      details: paper.title
        ? `Source: ${paper.title}${paper.venue ? ` · ${paper.venue}` : ''}`
        : null,
    })

    if (!ok) {
      showToast('Discarded — no changes made.', 'info')
      return
    }

    setBusy(true)
    try {
      // Real backend route is /api/scholar/ai/generate-sheet (body
      // carries paperId). Earlier nested-REST path was a wave-4 hallucination
      // that 404'd; audit Loop S11 caught it on 2026-05-13.
      const ctxRes = await fetch(`${API}/api/scholar/ai/generate-sheet`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paperId: paper.id }),
      })

      if (ctxRes.status === 404) {
        showToast('Feature coming soon', 'info')
        return
      }
      if (!ctxRes.ok) {
        const msg = await ctxRes.json().catch(() => ({}))
        throw new Error(msg?.error || `Scholar context failed (${ctxRes.status})`)
      }

      const { context, suggestedPrompt } = await ctxRes.json()
      const prompt =
        (typeof suggestedPrompt === 'string' && suggestedPrompt) ||
        `Create a study sheet from this paper:\n\n${paper.title || ''}`
      const composed = context ? `${prompt}\n\n---\n${context}` : prompt

      showToast('Generating sheet… this may take ~30 seconds.', 'info')

      const aiRes = await fetch(`${API}/api/ai/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: composed,
          currentPage: `/scholar/paper/${paper.id}`,
          mode: 'generate-sheet',
        }),
      })

      if (!aiRes.ok) {
        const msg = await aiRes.json().catch(() => ({}))
        throw new Error(msg?.error || `Hub AI failed (${aiRes.status})`)
      }

      const sheetId = await parseSseForSheetId(aiRes)
      if (sheetId) {
        navigate(`/sheets/${sheetId}/edit`)
      } else {
        showToast('Sheet drafted — open Hub AI to review the result.', 'info')
        navigate('/ai')
      }
    } catch (err) {
      showToast(err?.message || 'Could not generate sheet.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const mergedStyle = { ...BTN_STYLE, ...(style || {}) }
  if (busy) {
    mergedStyle.opacity = 0.8
    mergedStyle.cursor = 'progress'
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={className}
      style={mergedStyle}
      aria-label={busy ? 'Generating sheet…' : 'Generate a study sheet from this paper'}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M12 2v6m0 0l-3-3m3 3l3-3" />
        <rect x="3" y="10" width="18" height="12" rx="2" />
      </svg>
      <span>{children || (busy ? 'Generating…' : 'Generate sheet')}</span>
    </button>
  )
}
