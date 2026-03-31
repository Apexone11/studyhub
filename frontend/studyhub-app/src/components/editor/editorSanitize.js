/**
 * Shared DOMPurify configuration and sanitization for the editor and viewer.
 *
 * Extracted from RichTextEditor so that non-component exports live in a .js
 * file (satisfies react-refresh/only-export-components).
 */
import DOMPurify from 'dompurify'

export const PURIFY_CONFIG = {
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
export function sanitizeOutput(html) {
  if (!html || html === '<p></p>') return ''
  return DOMPurify.sanitize(html, PURIFY_CONFIG)
}
