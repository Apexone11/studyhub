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
import DOMPurify from 'dompurify'
import EditorToolbar from './EditorToolbar'
import { MathInline, MathBlock, mathInputPlugin } from './MathExtension'
import { lowlight } from './codeHighlight'

/* ── DOMPurify configuration for rich text output ─────────── */

const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'hr',
    'a', 'img',
    'span', 'div', 'sub', 'sup',
    // KaTeX tags (for C2)
    'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub',
    'mfrac', 'mover', 'munder', 'munderover', 'msqrt', 'mroot',
    'mtable', 'mtr', 'mtd', 'mtext', 'mspace', 'annotation',
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height',
    'class', 'style', 'data-language', 'data-math', 'data-math-display',
    'xmlns', 'encoding', 'mathvariant',
  ],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['target'],
}

/**
 * Sanitize HTML output from TipTap before passing to parent.
 * Ensures no script injection even if extensions produce unexpected markup.
 */
function sanitizeOutput(html) {
  if (!html || html === '<p></p>') return ''
  return DOMPurify.sanitize(html, PURIFY_CONFIG)
}

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
}) {
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

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
      handlePaste: (view, event) => {
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
      {editable && <EditorToolbar editor={editor} />}
      <div
        style={{
          flex: 1,
          minHeight,
          overflow: 'auto',
          background: '#0f172a',
        }}
      >
        <EditorContent
          editor={editor}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  )
}

/**
 * Re-export sanitizeOutput for use by the viewer side
 * (SheetContentPanel needs to sanitize stored rich text before rendering).
 */
export { sanitizeOutput, PURIFY_CONFIG }
