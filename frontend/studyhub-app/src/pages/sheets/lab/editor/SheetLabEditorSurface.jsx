/**
 * SheetLabEditorSurface — the actual editing surface used inside SheetLabEditor.
 *
 * The parent shell (SheetLabEditor) owns title/description/dirty/save logic.
 * This component owns nothing except which sub-editor to render based on
 * `contentFormat`.
 *
 * Layout: non-richtext formats (markdown, html) now use the shared
 * StackedEditorPane — editor on top, preview on bottom, both collapsible.
 * Richtext keeps its single-pane layout since TipTap is a WYSIWYG that
 * renders its own preview inline.
 *
 * Phase 3 commit B will replace the HTML textarea with a CodeMirror-backed
 * HtmlCodeEditor and introduce an EditorModeToggle.
 */
import { RichTextEditor } from '../../../../components/editor'
import StackedEditorPane from '../../../../components/editor/StackedEditorPane'
import { IconUpload, IconEye } from '../../../../components/Icons'

const textareaStyle = {
  width: '100%',
  flex: 1,
  minHeight: 320,
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
  flex: 1,
  minHeight: 320,
  border: 'none',
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

  const editorSlot = (
    <textarea
      value={content}
      onChange={onContentChange}
      style={textareaStyle}
      spellCheck={!isHtml}
      placeholder={isHtml ? 'HTML content…' : 'Write your content in markdown…'}
    />
  )

  const previewSlot = isHtml ? (
    <iframe
      title="html-preview"
      sandbox=""
      srcDoc={content}
      style={previewFrameStyle}
    />
  ) : (
    <div style={{
      padding: 16, fontSize: 13, lineHeight: 1.8,
      color: 'var(--sh-text)', background: 'var(--sh-surface)',
      flex: 1, minHeight: 320, overflowY: 'auto',
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>
      {content || <span style={{ color: 'var(--sh-muted)', fontStyle: 'italic' }}>Start typing to see a live preview…</span>}
    </div>
  )

  return (
    <StackedEditorPane
      editorLabel={isHtml ? 'HTML Editor' : 'Markdown Editor'}
      previewLabel="Live Preview"
      editorIcon={<IconUpload size={13} style={{ color: 'var(--sh-brand)' }} />}
      previewIcon={<IconEye size={13} style={{ color: 'var(--sh-muted)' }} />}
      editor={editorSlot}
      preview={previewSlot}
      storageKey={`sheetlab:editor-pane:${contentFormat}`}
    />
  )
}
