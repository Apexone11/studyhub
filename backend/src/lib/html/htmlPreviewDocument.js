const sanitizeHtml = require('sanitize-html')

const DEFAULT_ALLOWED_TAGS = [
  ...sanitizeHtml.defaults.allowedTags,
  'main',
  'section',
  'article',
  'header',
  'footer',
  'nav',
  'figure',
  'figcaption',
  'details',
  'summary',
  'form',
  'label',
  'input',
  'textarea',
  'select',
  'option',
  'button',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'colgroup',
  'col',
  'caption',
  'img',
  'svg',
  'path',
]

const DEFAULT_ALLOWED_ATTRIBUTES = {
  '*': ['id', 'class', 'title', 'aria-*', 'role', 'style'],
  a: ['href', 'name', 'target', 'rel'],
  img: ['src', 'srcset', 'alt', 'width', 'height', 'loading'],
  form: ['method', 'autocomplete'],
  input: ['type', 'name', 'value', 'placeholder', 'checked', 'disabled', 'readonly', 'maxlength'],
  textarea: ['name', 'rows', 'cols', 'placeholder', 'maxlength', 'readonly', 'disabled'],
  select: ['name', 'multiple', 'disabled'],
  option: ['value', 'selected'],
  button: ['type', 'name', 'value', 'disabled'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan', 'scope'],
  col: ['span'],
  svg: ['viewBox', 'width', 'height', 'fill', 'stroke', 'xmlns'],
  path: ['d', 'fill', 'stroke', 'stroke-width'],
}

function sanitizePreviewHtml(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: DEFAULT_ALLOWED_TAGS,
    allowedAttributes: DEFAULT_ALLOWED_ATTRIBUTES,
    allowedSchemes: ['data', 'blob'],
    allowedSchemesAppliedToAttributes: ['href', 'src', 'srcset'],
    allowProtocolRelative: false,
    parseStyleAttributes: true,
  })
}

function buildPreviewDocument({ title, html }) {
  const safeTitle = sanitizeHtml(String(title || 'StudyHub Preview'), {
    allowedTags: [],
    allowedAttributes: {},
  })
  const safeBody = sanitizePreviewHtml(html)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: system-ui, sans-serif;
      }

      html, body {
        margin: 0;
        min-height: 100%;
        background: #ffffff;
        color: #0f172a;
      }

      body {
        padding: 16px;
        box-sizing: border-box;
      }

      img, svg, video, canvas {
        max-width: 100%;
        height: auto;
      }

      table {
        max-width: 100%;
        border-collapse: collapse;
      }
    </style>
  </head>
  <body>
    ${safeBody}
  </body>
</html>`
}

/**
 * Build an interactive HTML document that preserves inline scripts/styles
 * but is locked down via CSP headers set by the serving route.
 * This is used for published sheet viewing where the author's JS must run.
 * Security layers:
 *   1. CSP headers (set by the serving route, NOT in the document)
 *   2. iframe sandbox="allow-scripts" (no same-origin, no popups, no forms)
 *   3. No remote script/stylesheet/image loading (CSP blocks it)
 */
function stripDangerousTags(value) {
  return String(value || '')
    .replace(/<\s*base[\s>][^>]*>/gi, '')
    .replace(/<\s*meta[^>]+http-equiv\s*=\s*["']?\s*refresh[^>]*>/gi, '')
}

function buildInteractiveDocument({ title, html }) {
  const safeTitle = sanitizeHtml(String(title || 'StudyHub Sheet'), {
    allowedTags: [],
    allowedAttributes: {},
  })
  const cleanedHtml = stripDangerousTags(html)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: system-ui, sans-serif;
      }

      html, body {
        margin: 0;
        min-height: 100%;
        background: #ffffff;
        color: #0f172a;
      }

      body {
        padding: 16px;
        box-sizing: border-box;
      }

      img, svg, video, canvas {
        max-width: 100%;
        height: auto;
      }

      table {
        max-width: 100%;
        border-collapse: collapse;
      }
    </style>
  </head>
  <body>
    ${cleanedHtml}
  </body>
</html>`
}

module.exports = {
  buildPreviewDocument,
  buildInteractiveDocument,
  sanitizePreviewHtml,
}
