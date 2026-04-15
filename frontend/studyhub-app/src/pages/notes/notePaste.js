import sanitizeHtml from 'sanitize-html'

const allowedTags = [
  'p',
  'br',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  's',
  'u',
  'code',
  'pre',
  'blockquote',
  'a',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'hr',
]

export function sanitizePastedHtml(html) {
  if (html == null) return ''
  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https'],
      a: ['http', 'https', 'mailto'],
    },
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    disallowedTagsMode: 'discard',
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  })
}

// Helper TipTap can call from editorProps.transformPastedHTML.
// Returns a string suitable for editor.commands.insertContent(); empty string falls
// through to TipTap's default plain-text handler.
export function transformPastedHtmlForTiptap(html) {
  const cleaned = sanitizePastedHtml(html)
  return cleaned.trim() ? cleaned : ''
}
