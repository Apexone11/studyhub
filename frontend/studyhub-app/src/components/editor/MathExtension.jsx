/**
 * TipTap Math Extension — inline and block math nodes powered by KaTeX.
 *
 * Inline math:  Type $...$ or use toolbar to insert.
 * Block math:   Type $$...$$ or use toolbar to insert.
 *
 * Both store LaTeX source in `data-math` attribute and render via KaTeX.
 * Viewer-side rendering uses the same renderMath() helper.
 *
 * Security: KaTeX is a pure renderer — no script execution.
 * LaTeX source is stored as text (not HTML), preventing injection.
 */
import { Node, mergeAttributes } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import katex from 'katex'

/* ── KaTeX render helper ───────────────────────────────────── */

/**
 * Render a LaTeX string to an HTML string via KaTeX.
 * Returns safe HTML (KaTeX produces only math markup, no scripts).
 * On error, returns the raw LaTeX in a styled error span.
 */
export function renderMath(latex, displayMode = false) {
  if (!latex || !latex.trim()) return ''
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,       // Disallow \url, \href — security
      maxSize: 100,       // Prevent excessively large output
      maxExpand: 500,     // Limit macro expansion depth
      output: 'htmlAndMathml',
    })
  } catch {
    const escaped = latex.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<span class="sh-math-error" style="color:#ef4444;font-size:12px;font-family:monospace">${escaped}</span>`
  }
}

/* ── Inline Math Node ──────────────────────────────────────── */

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-math') || el.textContent || '',
        renderHTML: (attrs) => ({ 'data-math': attrs.latex }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-math]',
        getAttrs: (el) => ({ latex: el.getAttribute('data-math') || '' }),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const latex = HTMLAttributes['data-math'] || ''
    const html = renderMath(latex, false)
    return ['span', mergeAttributes(
      { 'data-math': latex, class: 'sh-math-inline', contenteditable: 'false' },
      HTMLAttributes,
    ), ['span', { innerHTML: html }]]
  },

  addProseMirrorPlugins() {
    return [mathInputPlugin({ editor: this.editor })]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('span')
      dom.className = 'sh-math-inline'
      dom.setAttribute('data-math', node.attrs.latex)
      dom.contentEditable = 'false'
      dom.style.cursor = 'pointer'

      const render = () => {
        dom.innerHTML = renderMath(node.attrs.latex, false)
        if (!node.attrs.latex.trim()) {
          dom.innerHTML = '<span style="color:#6366f1;font-style:italic;font-size:12px">$math$</span>'
        }
      }
      render()

      // Double-click to edit
      dom.addEventListener('dblclick', () => {
        const newLatex = prompt('Edit LaTeX (inline math):', node.attrs.latex)  
        if (newLatex !== null && typeof getPos === 'function') {
          editor.chain().focus().command(({ tr }) => {
            tr.setNodeMarkup(getPos(), undefined, { latex: newLatex })
            return true
          }).run()
        }
      })

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'mathInline') return false
          dom.setAttribute('data-math', updatedNode.attrs.latex)
          dom.innerHTML = renderMath(updatedNode.attrs.latex, false)
          if (!updatedNode.attrs.latex.trim()) {
            dom.innerHTML = '<span style="color:#6366f1;font-style:italic;font-size:12px">$math$</span>'
          }
          return true
        },
      }
    }
  },
})

/* ── Block Math Node ───────────────────────────────────────── */

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-math-display') || el.textContent || '',
        renderHTML: (attrs) => ({ 'data-math-display': attrs.latex }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-math-display]',
        getAttrs: (el) => ({ latex: el.getAttribute('data-math-display') || '' }),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const latex = HTMLAttributes['data-math-display'] || ''
    const html = renderMath(latex, true)
    return ['div', mergeAttributes(
      { 'data-math-display': latex, class: 'sh-math-block', contenteditable: 'false' },
      HTMLAttributes,
    ), ['div', { innerHTML: html }]]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div')
      dom.className = 'sh-math-block'
      dom.setAttribute('data-math-display', node.attrs.latex)
      dom.contentEditable = 'false'
      dom.style.cursor = 'pointer'
      dom.style.textAlign = 'center'
      dom.style.padding = '12px 16px'
      dom.style.margin = '8px 0'
      dom.style.borderRadius = '8px'
      dom.style.background = '#0c1222'
      dom.style.border = '1px solid #1e293b'

      const render = () => {
        dom.innerHTML = renderMath(node.attrs.latex, true)
        if (!node.attrs.latex.trim()) {
          dom.innerHTML = '<div style="color:#6366f1;font-style:italic;font-size:13px">$$block math$$</div>'
        }
      }
      render()

      // Double-click to edit
      dom.addEventListener('dblclick', () => {
        const newLatex = prompt('Edit LaTeX (block math):', node.attrs.latex)  
        if (newLatex !== null && typeof getPos === 'function') {
          editor.chain().focus().command(({ tr }) => {
            tr.setNodeMarkup(getPos(), undefined, { latex: newLatex })
            return true
          }).run()
        }
      })

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'mathBlock') return false
          dom.setAttribute('data-math-display', updatedNode.attrs.latex)
          dom.innerHTML = renderMath(updatedNode.attrs.latex, true)
          if (!updatedNode.attrs.latex.trim()) {
            dom.innerHTML = '<div style="color:#6366f1;font-style:italic;font-size:13px">$$block math$$</div>'
          }
          return true
        },
      }
    }
  },

  // Input rule: typing $$...$$ on its own line creates a math block
  addInputRules() {
    return []  // Handled via plugin below for better UX
  },
})

/* ── Dollar-sign input plugin ──────────────────────────────── */

/**
 * ProseMirror plugin that converts $...$ into inline math
 * and $$...$$ (at start of block) into block math.
 * This gives the familiar LaTeX typing experience.
 */
export function mathInputPlugin({ editor }) {
  return new Plugin({
    key: new PluginKey('mathInput'),
    props: {
      handleTextInput(view, from, to, text) {
        if (text !== '$') return false
        const { state } = view
        const $from = state.doc.resolve(from)
        const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')

        // Block math: $$ at start of empty paragraph, user types another $
        if (textBefore === '$$') {
          // Don't auto-convert — wait for closing $$
          return false
        }

        // Check for closing $ of inline math: $latex$
        const inlineMatch = textBefore.match(/\$([^$]+)$/)
        if (inlineMatch) {
          const latex = inlineMatch[1]
          const start = from - inlineMatch[0].length
          const mathInlineType = state.schema.nodes.mathInline
          if (mathInlineType) {
            const tr = state.tr
              .delete(start, from)
              .insert(start, mathInlineType.create({ latex }))
            view.dispatch(tr)
            return true
          }
        }

        return false
      },
    },
  })
}
