/**
 * CalloutExtension.js — semantic callout blocks for sheets and notes.
 *
 * Follows the GitHub Alerts model: a closed set of five types, each with
 * platform-controlled styling. Authors pick a type, never a color — that
 * keeps every callout legible in both themes and keeps arbitrary style
 * strings out of user content (CLAUDE.md A13 in spirit: the `type`
 * attribute is validated against an allowlist on parse).
 *
 * Serialized shape: <div data-callout="warning" class="sh-callout
 * sh-callout--warning">…paragraphs…</div>. The wrapper element and the
 * `data-callout` attribute are allowlisted in editorSanitize.js so the
 * block survives the save → sanitize → render round-trip.
 */
import { Node, mergeAttributes } from '@tiptap/core'

export const CALLOUT_TYPES = ['note', 'tip', 'important', 'warning', 'definition']

export const CALLOUT_LABELS = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  definition: 'Definition',
}

const DEFAULT_TYPE = 'note'

/** Anything unrecognized collapses to the neutral type rather than leaking through. */
function normalizeType(value) {
  const candidate = String(value || '').toLowerCase()
  return CALLOUT_TYPES.includes(candidate) ? candidate : DEFAULT_TYPE
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: DEFAULT_TYPE,
        parseHTML: (element) => normalizeType(element.getAttribute('data-callout')),
        renderHTML: (attributes) => ({ 'data-callout': normalizeType(attributes.type) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const type = normalizeType(HTMLAttributes['data-callout'])
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-callout': type,
        class: `sh-callout sh-callout--${type}`,
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setCallout:
        (type = DEFAULT_TYPE) =>
        ({ commands }) =>
          commands.wrapIn(this.name, { type: normalizeType(type) }),
      toggleCallout:
        (type = DEFAULT_TYPE) =>
        ({ commands }) =>
          commands.toggleWrap(this.name, { type: normalizeType(type) }),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    }
  },
})

export default Callout
