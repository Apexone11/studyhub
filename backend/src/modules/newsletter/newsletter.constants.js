/**
 * newsletter.constants.js — shared constants + sanitizer config for the
 * Product-Updates / "What's New" newsletter module (issue #291).
 */

// Categories an admin can tag an issue with. Validated against this allowlist
// before it ever reaches Prisma (CLAUDE.md A13).
const CATEGORIES = ['feature', 'bugfix', 'announcement', 'improvement']

// Lifecycle states. Public surfaces only ever show 'published'.
const STATUSES = ['draft', 'published']

const MAX_TITLE_LENGTH = 200
const MAX_SUMMARY_LENGTH = 500
const MAX_BODY_LENGTH = 50000

// Pagination for the public archive + admin list.
const DEFAULT_PAGE_SIZE = 12
const MAX_PAGE_SIZE = 50

// How many recipients to dispatch per concurrent batch in the send job.
// Small enough to stay gentle on the email provider for the current user base.
const SEND_BATCH_SIZE = 20

// sanitize-html allowlist for the issue body. Newsletters are authored by
// admins, but we still sanitize on write (defense in depth) so a compromised
// admin session can't store an XSS payload that later renders on the public
// archive. No <script>, <style>, <iframe>, event handlers, or javascript: URLs.
const SANITIZE_OPTIONS = {
  allowedTags: [
    'h1',
    'h2',
    'h3',
    'h4',
    'p',
    'a',
    'ul',
    'ol',
    'li',
    'blockquote',
    'code',
    'pre',
    'strong',
    'em',
    'b',
    'i',
    'u',
    's',
    'br',
    'hr',
    'span',
    'div',
    'img',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'figure',
    'figcaption',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    span: ['class'],
    div: ['class'],
    code: ['class'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  // Force every external link to open safely (CLAUDE.md A15).
  transformTags: {
    a: (tagName, attribs) => {
      const out = { ...attribs }
      if (out.target === '_blank' || /^https?:/i.test(out.href || '')) {
        out.target = '_blank'
        out.rel = 'noopener noreferrer'
      }
      return { tagName, attribs: out }
    },
  },
}

module.exports = {
  CATEGORIES,
  STATUSES,
  MAX_TITLE_LENGTH,
  MAX_SUMMARY_LENGTH,
  MAX_BODY_LENGTH,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SEND_BATCH_SIZE,
  SANITIZE_OPTIONS,
}
