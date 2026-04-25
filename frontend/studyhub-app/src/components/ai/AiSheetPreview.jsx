/* ═══════════════════════════════════════════════════════════════════════════
 * AiSheetPreview.jsx -- Live preview of AI-generated HTML study sheets.
 *
 * Extracts HTML from markdown code blocks (```html ... ```) and renders
 * them in a sandboxed iframe. Offers "Edit in Sheet Lab" and "Publish"
 * actions.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import ComponentErrorBoundary from '../ComponentErrorBoundary'
import { IconSheets, IconPen, IconX, IconEye } from '../Icons'

/**
 * Inline preview bar that appears below an AI message containing HTML.
 */
export function SheetPreviewBar({ html, conversationTitle }) {
  const [showPreview, setShowPreview] = useState(false)
  const navigate = useNavigate()

  const isIncomplete = /<(!DOCTYPE|html)/i.test(html) && !/<\/html>/i.test(html)

  const handleEditInLab = () => {
    // Pass the AI-generated HTML to the Sheet Lab via navigation state.
    // The Lab can read this from location.state and pre-fill the editor.
    navigate('/sheets/new/lab', {
      state: {
        aiGeneratedHtml: html,
        suggestedTitle: conversationTitle || 'AI-Generated Study Sheet',
        source: 'hub-ai',
      },
    })
  }

  return (
    <ComponentErrorBoundary name="Sheet Preview">
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 8,
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => setShowPreview(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'var(--sh-soft)',
            border: '1px solid var(--sh-border)',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--sh-text)',
            cursor: 'pointer',
          }}
        >
          <IconEye size={14} /> Preview
        </button>
        <button
          onClick={handleEditInLab}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'var(--sh-brand)',
            border: 'none',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          <IconPen size={14} /> Edit in Sheet Lab
        </button>
      </div>

      {isIncomplete && (
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 12,
            color: 'var(--sh-warning-text)',
            background: 'var(--sh-warning-bg)',
            border: '1px solid var(--sh-warning-border)',
            borderRadius: 6,
            padding: '5px 10px',
            width: '100%',
          }}
        >
          This sheet may be incomplete due to length limits.
        </p>
      )}

      {showPreview &&
        createPortal(
          <SheetPreviewModal html={html} onClose={() => setShowPreview(false)} />,
          document.body,
        )}
    </ComponentErrorBoundary>
  )
}

/**
 * Full-screen modal previewing the generated HTML.
 * If the AI produced a full <!DOCTYPE html> document, render it directly.
 * Otherwise wrap the fragment in a basic document shell with default styles.
 */
function SheetPreviewModal({ html, onClose }) {
  const iframeSrc = useMemo(() => {
    const isFullDocument = /^\s*<!DOCTYPE/i.test(html) || /^\s*<html/i.test(html)

    const finalHtml = isFullDocument
      ? html
      : `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; padding: 24px; margin: 0; color: #1a1a2e; line-height: 1.7; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 24px; font-weight: 800; margin-bottom: 16px; }
  h2 { font-size: 20px; font-weight: 700; margin-top: 24px; margin-bottom: 12px; }
  h3 { font-size: 16px; font-weight: 700; margin-top: 16px; margin-bottom: 8px; }
  p { margin-bottom: 10px; }
  code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  pre { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 10px; overflow-x: auto; }
  pre code { background: none; padding: 0; color: inherit; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
  th { background: #f8fafc; font-weight: 600; }
  ul, ol { margin: 8px 0 12px 20px; }
  li { margin-bottom: 4px; }
  blockquote { border-left: 3px solid #6366f1; padding: 8px 16px; margin: 12px 0; background: #eef2ff; border-radius: 0 8px 8px 0; }
</style>
</head>
<body>${html}</body>
</html>`
    return `data:text/html;charset=utf-8,${encodeURIComponent(finalHtml)}`
  }, [html])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'var(--sh-modal-overlay, rgba(0,0,0,0.6))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--sh-surface)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 900,
          height: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--sh-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconSheets size={16} style={{ color: 'var(--sh-brand)' }} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>Sheet Preview</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <IconX size={18} style={{ color: 'var(--sh-muted)' }} />
          </button>
        </div>
        <iframe
          src={iframeSrc}
          sandbox="allow-same-origin"
          title="Sheet Preview"
          style={{ flex: 1, border: 'none', width: '100%' }}
        />
      </div>
    </div>
  )
}
