/**
 * RichTextEditor — TipTap-powered WYSIWYG editor for StudyHub sheets.
 *
 * Provides rich text editing with heading, formatting, lists, links,
 * code blocks, and blockquotes. Outputs sanitized HTML.
 *
 * Full extension set:
 *   - StarterKit (headings, bold, italic, strike, lists, blockquote, code, history)
 *   - Underline, Link, Placeholder, Image, CodeBlockLowlight
 *   - C2: KaTeX math (inline $...$ and block $$...$$)
 *   - C3: Code syntax highlighting via lowlight (configured in CodeBlockLowlight)
 *   - C4: Image embedding
 *
 * Security: All output HTML is sanitized via DOMPurify before storage.
 */
import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import EditorToolbar from './EditorToolbar'
import { MathInline, MathBlock } from './MathExtension'
import { lowlight } from './codeHighlight'
import { sanitizeOutput } from './editorSanitize'

/* ── Main RichTextEditor component ─────────────────────────── */

/**
 * @param {Object}   props
 * @param {string}   props.content       - Initial HTML content
 * @param {Function} props.onUpdate      - Called with sanitized HTML on each change
 * @param {string}   [props.placeholder] - Placeholder text
 * @param {number}   [props.minHeight]   - Minimum editor height in px
 * @param {boolean}  [props.editable]    - Whether the editor is editable
 */
export default function RichTextEditor({
  content,
  onUpdate,
  placeholder = 'Start writing your study notes...',
  minHeight = 400,
  editable = true,
  themeAware = false,
}) {
  const onUpdateRef = useRef(onUpdate)
  useEffect(() => { onUpdateRef.current = onUpdate })

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable the default codeBlock in favor of lowlight version
        codeBlock: false,
        heading: { levels: [1, 2, 3, 4] },
        history: { depth: 100 },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
          class: 'sh-editor-link',
        },
        validate: (href) => /^https?:\/\/|^mailto:/i.test(href),
      }),
      Placeholder.configure({ placeholder }),
      Image.configure({
        inline: false,
        allowBase64: false, // Security: no base64 images to prevent data exfiltration
        HTMLAttributes: {
          class: 'sh-editor-image',
          loading: 'lazy',
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: null,
        HTMLAttributes: {
          class: 'sh-editor-code-block',
        },
      }),
      MathInline,
      MathBlock,
      // Phase 3: tables become round-trippable with the HTML code editor.
      // Keep in sync with TIPTAP_ALLOWED_TAGS in editorSanitize.js.
      Table.configure({ resizable: false, HTMLAttributes: { class: 'sh-editor-table' } }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: content || '',
    editable,
    onUpdate: ({ editor: ed }) => {
      const html = sanitizeOutput(ed.getHTML())
      onUpdateRef.current?.(html)
    },
    editorProps: {
      attributes: {
        class: 'sh-rich-editor-content',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Sheet content editor',
      },
      // Prevent paste of dangerous content
      handlePaste: () => {
        // Allow default TipTap paste handling — DOMPurify will sanitize on output
        return false
      },
    },
  })

  // Sync content from parent when sheet changes (e.g., switching sheets)
  const lastExternalContent = useRef(content)
  useEffect(() => {
    if (!editor) return
    if (content !== lastExternalContent.current) {
      lastExternalContent.current = content
      // Only reset if the editor content actually differs to avoid cursor jumps
      const currentHtml = sanitizeOutput(editor.getHTML())
      if (currentHtml !== content) {
        editor.commands.setContent(content || '', false)
      }
    }
  }, [content, editor])

  // Update editable state
  useEffect(() => {
    if (editor) editor.setEditable(editable)
  }, [editor, editable])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {editable && <EditorToolbar editor={editor} themeAware={themeAware} />}
      <div
        style={{
          flex: 1,
          minHeight,
          overflow: 'auto',
          background: themeAware ? 'var(--sh-surface)' : '#0f172a',
        }}
      >
        <EditorContent
          editor={editor}
          style={{ height: '100%' }}
          className={themeAware ? 'sh-editor-theme-aware' : ''}
        />
      </div>
    </div>
  )
}

