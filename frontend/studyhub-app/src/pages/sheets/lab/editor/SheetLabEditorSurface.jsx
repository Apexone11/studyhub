/**
 * SheetLabEditorSurface — the actual editing surface used inside SheetLabEditor.
 *
 * The parent shell (SheetLabEditor) owns title/description/dirty/save logic.
 * This component owns nothing except which sub-editor to render based on
 * `contentFormat`. Extracted from SheetLabEditor in the Phase 3 refactor
 * (commit A) with zero behavior change — the JSX is a direct move with props
 * threaded through.
 *
 * Phase 3 commit B will replace the HTML branch with a CodeMirror-backed
 * HtmlCodeEditor and introduce an EditorModeToggle that switches between
 * Rich Text and HTML/Code.
 */
import { RichTextEditor } from '../../../../components/editor'

const editorStyle = {
  width: '100%',
  height: '100%',
  minHeight: 400,
  resize: 'none',
  border: 'none',
  background: '#0f172a',
  color: '#e2e8f0',
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  fontSize: '12.5px',
  lineHeight: 1.9,
  padding: 16,
  outline: 'none',
  boxSizing: 'border-box',
}

const previewFrameStyle = {
  width: '100%',
  height: '100%',
  minHeight: 400,
  border: 'none',
  borderRadius: 0,
  background: '#fff',
}

export default function SheetLabEditorSurface({
  content,
  contentFormat,
  onContentChange,
  onRichTextUpdate,
}) {
  const isHtml = contentFormat === 'html'
  const isRichText = contentFormat === 'richtext'

  if (isRichText) {
    return (
      <div style={{
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid var(--sh-border)',
        minHeight: 300,
      }}>
        <RichTextEditor
          content={content}
          onUpdate={onRichTextUpdate}
          placeholder="Start writing your study notes..."
          minHeight={400}
        />
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: 0,
      borderRadius: 14,
      overflow: 'hidden',
      border: '1px solid var(--sh-border)',
      minHeight: 300,
    }}>
      {/* Textarea editor */}
      <div style={{ position: 'relative' }}>
        <div style={{
          padding: '6px 12px', background: '#1e293b', color: '#94a3b8',
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
          borderBottom: '1px solid #334155',
        }}>
          Editor
        </div>
        <textarea
          value={content}
          onChange={onContentChange}
          style={editorStyle}
          spellCheck={!isHtml}
          placeholder={isHtml ? 'HTML content…' : 'Write your content in markdown…'}
        />
      </div>

      {/* Preview */}
      <div style={{ borderLeft: '1px solid var(--sh-border)' }}>
        <div style={{
          padding: '6px 12px', background: 'var(--sh-soft)', color: 'var(--sh-muted)',
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
          borderBottom: '1px solid var(--sh-border)',
        }}>
          Preview
        </div>
        {isHtml ? (
          <iframe
            title="html-preview"
            sandbox="allow-same-origin"
            srcDoc={content}
            style={previewFrameStyle}
          />
        ) : (
          <div style={{
            padding: 16, fontSize: 13, lineHeight: 1.8,
            color: 'var(--sh-text)', background: 'var(--sh-surface)',
            minHeight: 400, overflowY: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {content || <span style={{ color: 'var(--sh-muted)', fontStyle: 'italic' }}>Start typing to see a live preview…</span>}
          </div>
        )}
      </div>
    </div>
  )
}
