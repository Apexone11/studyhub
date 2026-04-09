/**
 * EditorModeToggle — Rich Text ↔ HTML/Code mode switcher for Sheet Lab.
 *
 * Design decisions locked in during the Phase 3 brainstorm:
 *
 *   1. Two first-class modes: Rich Text and HTML/Code. They are equal
 *      siblings — either direction is a valid switch.
 *
 *   2. Markdown is legacy. Sheets whose stored contentFormat is 'markdown'
 *      see a one-time migration chooser ("Upgrade to Rich Text" /
 *      "Upgrade to HTML/Code"). Once migrated there is no way back to
 *      markdown — the migration is one-directional on purpose.
 *
 *   3. Lossy-detection runs ONLY on HTML → Rich Text. Rich Text → HTML is
 *      lossless by construction (TipTap already outputs HTML).
 *
 *   4. The actual switch is driven by a parent-provided callback so the
 *      parent owns the content/format state and the persistence path.
 *
 * Props:
 *   value        — current contentFormat: 'markdown' | 'html' | 'richtext'
 *   currentContent — the raw HTML/markdown/etc that the user has written
 *   onChange     — (nextFormat, nextContent) => void
 *   disabled?    — while saving or in other transient disabled states
 */
import { useState } from 'react'
import { marked } from 'marked'
import ConfirmLossyConversionModal from './ConfirmLossyConversionModal'
import { detectLossyConversion, sanitizeForTipTap } from './editorSanitize'

const PILL_BASE = {
  padding: '6px 14px',
  border: 'none',
  background: 'transparent',
  color: 'var(--sh-muted)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  borderRadius: 6,
  minHeight: 30,
}

const PILL_ACTIVE = {
  ...PILL_BASE,
  background: 'var(--sh-brand-accent)',
  color: 'var(--sh-btn-primary-text, #fff)',
}

export default function EditorModeToggle({ value, currentContent, onChange, disabled }) {
  const [pendingReport, setPendingReport] = useState(null)
  const [pendingTargetContent, setPendingTargetContent] = useState(null)

  const isLegacyMarkdown = value === 'markdown'

  // Commit a confirmed lossy switch HTML → Rich Text.
  const handleConfirmLossy = () => {
    const nextContent = pendingTargetContent ?? currentContent
    setPendingReport(null)
    setPendingTargetContent(null)
    onChange?.('richtext', nextContent)
  }

  const handleCancelLossy = () => {
    setPendingReport(null)
    setPendingTargetContent(null)
  }

  const switchToRichText = () => {
    if (disabled) return
    if (value === 'richtext') return
    if (value === 'html') {
      const report = detectLossyConversion(currentContent)
      if (report.lossy) {
        setPendingReport(report)
        setPendingTargetContent(sanitizeForTipTap(currentContent))
        return
      }
      // Not lossy — TipTap can represent every tag/attribute already.
      onChange?.('richtext', sanitizeForTipTap(currentContent))
      return
    }
    // Legacy markdown → richtext: convert via marked, sanitize, commit.
    const html = marked.parse(currentContent || '', { async: false })
    onChange?.('richtext', sanitizeForTipTap(html))
  }

  const switchToHtml = () => {
    if (disabled) return
    if (value === 'html') return
    if (value === 'richtext') {
      // Rich Text → HTML is lossless — TipTap already produces HTML.
      onChange?.('html', currentContent)
      return
    }
    // Legacy markdown → html: pass marked output through, no sanitize
    // because the user explicitly asked for raw HTML/Code.
    const html = marked.parse(currentContent || '', { async: false })
    onChange?.('html', html)
  }

  return (
    <>
      <div
        role="tablist"
        aria-label="Editor mode"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: 4,
          borderRadius: 8,
          background: 'var(--sh-soft)',
          border: '1px solid var(--sh-border)',
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={value === 'richtext'}
          onClick={switchToRichText}
          disabled={disabled}
          style={value === 'richtext' ? PILL_ACTIVE : PILL_BASE}
          title="Visual WYSIWYG editor"
        >
          Rich Text
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value === 'html'}
          onClick={switchToHtml}
          disabled={disabled}
          style={value === 'html' ? PILL_ACTIVE : PILL_BASE}
          title="HTML source with live preview"
        >
          HTML / Code
        </button>
        {isLegacyMarkdown ? (
          <span
            role="tab"
            aria-selected="true"
            style={{
              ...PILL_ACTIVE,
              background: 'var(--sh-warning-bg)',
              color: 'var(--sh-warning-text)',
              cursor: 'default',
            }}
            title="This sheet was authored in markdown. Pick a mode above to migrate."
          >
            Markdown (legacy)
          </span>
        ) : null}
      </div>

      <ConfirmLossyConversionModal
        open={Boolean(pendingReport)}
        report={pendingReport}
        onConfirm={handleConfirmLossy}
        onCancel={handleCancelLossy}
      />
    </>
  )
}
