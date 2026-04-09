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

/* ═══════════════════════════════════════════════════════════════════════
 * Phase 3 — HTML ↔ Rich Text mode toggle helpers
 * ═══════════════════════════════════════════════════════════════════════
 * When a user switches from HTML/Code mode to Rich Text mode, TipTap will
 * silently strip anything its extensions do not understand (e.g. <script>,
 * <iframe>, inline event handlers). We want to warn the user before that
 * happens so they can cancel the switch and keep their HTML intact.
 *
 * The allowlist below is a STRICT SUBSET of PURIFY_CONFIG's allowlist —
 * it covers only the tags/attributes TipTap's current extension set can
 * actually render on a round-trip. Keep this in sync with RichTextEditor
 * whenever extensions are added or removed.
 */

// Tags TipTap's current extension set can render.
// StarterKit + Underline + Link + Image + CodeBlockLowlight + Table ext.
const TIPTAP_ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'hr',
  'a', 'img',
  'span', 'div',
  // Table extension (added in Phase 3)
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
])

// Attributes TipTap keeps after a round-trip. Note `style`, `onclick`, etc.
// are intentionally omitted — they get stripped, and we warn the user.
const TIPTAP_ALLOWED_ATTR = new Set([
  'href', 'target', 'rel',
  'src', 'alt', 'title', 'width', 'height',
  'class',
  'colspan', 'rowspan', 'colwidth',
])

/**
 * Sanitize raw HTML down to the TipTap allowlist. Used when the user
 * confirms a lossy switch from HTML/Code mode to Rich Text mode — the
 * output of this function is safe to pass to TipTap's setContent.
 */
export function sanitizeForTipTap(html) {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: Array.from(TIPTAP_ALLOWED_TAGS),
    ALLOWED_ATTR: Array.from(TIPTAP_ALLOWED_ATTR),
    KEEP_CONTENT: true,
  })
}

/**
 * Walk a raw HTML document and report everything that would be stripped
 * by sanitizeForTipTap. Returns a structured report the UI can display
 * in the confirmation modal before the user commits to the switch.
 *
 * Implementation notes:
 *   - Iterative walk (explicit stack) instead of recursion so pathological
 *     deeply-nested HTML cannot blow the call stack.
 *   - Empty / whitespace-only input always returns `{ lossy: false }` —
 *     switching modes on a blank sheet should never trigger a modal.
 *   - Reports are sets-deduped and sorted so the UI output is stable.
 */
export function detectLossyConversion(html) {
  const empty = { strippedTags: [], strippedAttributes: [], lossy: false }
  if (!html || !html.trim()) return empty

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const strippedTags = new Set()
  const strippedAttributes = new Set()

  // Iterative depth-first walk over all element nodes in doc.body.
  const stack = Array.from(doc.body.children)
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || node.nodeType !== 1) continue

    const tag = node.tagName.toLowerCase()
    if (!TIPTAP_ALLOWED_TAGS.has(tag)) {
      strippedTags.add(tag)
      // Children of a stripped tag will also be dropped; no need to walk
      // into them for attribute tracking.
      continue
    }

    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase()
      if (!TIPTAP_ALLOWED_ATTR.has(name)) {
        strippedAttributes.add(`${tag}[${name}]`)
      }
    }

    // Push children onto the stack.
    for (const child of Array.from(node.children)) {
      stack.push(child)
    }
  }

  return {
    strippedTags: Array.from(strippedTags).sort(),
    strippedAttributes: Array.from(strippedAttributes).sort(),
    lossy: strippedTags.size > 0 || strippedAttributes.size > 0,
  }
}
