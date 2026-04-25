/**
 * ai.context.js -- Builds dynamic context for Hub AI based on the
 * authenticated user's data and current page.
 */

const prisma = require('../../lib/prisma')

/**
 * Build the dynamic context string that gets appended to the system prompt.
 *
 * @param {number} userId - Authenticated user ID.
 * @param {object} opts
 * @param {string} [opts.currentPage] - Frontend URL path (e.g. "/sheets/42").
 * @returns {Promise<string>} Context block to inject into the system prompt.
 */
async function buildContext(userId, opts = {}) {
  const sections = []

  // ── 1. User profile & courses ────────────────────────────────────
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        accountType: true,
        enrollments: {
          select: {
            course: {
              select: { id: true, code: true, title: true },
            },
          },
        },
      },
    })

    if (user) {
      sections.push(`<user_profile>
Username: ${user.username}
Account type: ${user.accountType}
</user_profile>`)

      if (user.enrollments.length > 0) {
        const courseList = user.enrollments
          .map((e) => `- ${e.course.code}: ${e.course.title} (ID ${e.course.id})`)
          .join('\n')
        sections.push(`<enrolled_courses>
${courseList}
</enrolled_courses>`)
      }
    }
  } catch (error) {
    console.warn('[AI Context] Failed to load user profile:', error?.message || error)
  }

  // ── 2. Current page context ──────────────────────────────────────
  if (opts.currentPage) {
    sections.push(`<current_page>${opts.currentPage}</current_page>`)

    // If the user is viewing a specific sheet, include its content.
    // Only inject sheets the user owns or that are publicly visible (status = 'published').
    const sheetMatch = opts.currentPage.match(/^\/sheets\/(\d+)/)
    if (sheetMatch) {
      try {
        const sheet = await prisma.studySheet.findFirst({
          where: {
            id: parseInt(sheetMatch[1], 10),
            OR: [{ userId }, { status: 'published' }],
          },
          select: {
            title: true,
            description: true,
            content: true,
            contentFormat: true,
            course: { select: { code: true } },
          },
        })
        if (sheet) {
          const content = (sheet.content || '').slice(0, 6000)
          sections.push(`<current_sheet>
Title: ${sheet.title}
Course: ${sheet.course?.code || 'N/A'}
Description: ${sheet.description || 'N/A'}
Content (may be truncated):
${content}
</current_sheet>`)
        }
      } catch (error) {
        console.warn('[AI Context] Failed to load sheet context:', error?.message || error)
      }
    }

    // If the user is viewing a specific note, include its content.
    // Only inject notes the user owns or that are explicitly public (visibility = 'public').
    const noteMatch = opts.currentPage.match(/^\/notes\/(\d+)/)
    if (noteMatch) {
      try {
        const note = await prisma.note.findFirst({
          where: {
            id: parseInt(noteMatch[1], 10),
            OR: [{ userId }, { visibility: 'public' }],
          },
          select: { title: true, content: true, course: { select: { code: true } } },
        })
        if (note) {
          const content = (note.content || '').slice(0, 6000)
          sections.push(`<current_note>
Title: ${note.title}
Course: ${note.course?.code || 'N/A'}
Content (may be truncated):
${content}
</current_note>`)
        }
      } catch (error) {
        console.warn('[AI Context] Failed to load note context:', error?.message || error)
      }
    }

    // If the user is reading a book in the library, include reading context.
    // Book context is passed from the frontend and includes title, author, subjects, and current text.
    if (opts.bookTitle) {
      let bookContext = `<current_reading_context>
Title: ${opts.bookTitle}
Author: ${opts.bookAuthor || 'unknown author'}
Subjects: ${opts.bookSubjects || 'not specified'}`

      if (opts.currentText) {
        const textSnippet = (opts.currentText || '').slice(0, 4000)
        bookContext += `
Current visible text:
${textSnippet}`
      }

      sections.push(bookContext + '\n</current_reading_context>')
    }
  }

  // ── 3. Recent materials (titles only, for awareness) ─────────────
  try {
    const recentSheets = await prisma.studySheet.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, title: true, course: { select: { code: true } } },
    })
    if (recentSheets.length > 0) {
      const list = recentSheets
        .map((s) => `- [${s.id}] ${s.course?.code || 'N/A'}: ${s.title}`)
        .join('\n')
      sections.push(`<user_recent_sheets>
${list}
</user_recent_sheets>`)
    }
  } catch (error) {
    console.warn('[AI Context] Failed to load recent sheets:', error?.message || error)
  }

  try {
    const recentNotes = await prisma.note.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, title: true, course: { select: { code: true } } },
    })
    if (recentNotes.length > 0) {
      const list = recentNotes
        .map((n) => `- [${n.id}] ${n.course?.code || 'N/A'}: ${n.title}`)
        .join('\n')
      sections.push(`<user_recent_notes>
${list}
</user_recent_notes>`)
    }
  } catch (error) {
    console.warn('[AI Context] Failed to load recent notes:', error?.message || error)
  }

  if (sections.length === 0) return ''

  return '\n\n--- STUDENT CONTEXT ---\n' + sections.join('\n\n')
}

/**
 * Strip PII patterns from a string before sending to / receiving
 * from Anthropic. Decision #17 (security addendum): redact at BOTH
 * the input and output boundary so:
 *   - The model never sees student emails / phone numbers (even if
 *     they appear in note titles, sheet bodies, etc.).
 *   - A model hallucination that emits a training-data-style email
 *     or phone number doesn't reach the client surface.
 *
 * Conservative: false positives (over-redaction) are preferred to
 * a leak. Patterns covered:
 *   - Email addresses (RFC 5322-ish, simplified to common shapes).
 *   - Phone numbers in NANP-style formats (10-digit with optional
 *     country code, common separators). International formats
 *     starting with `+` and 7+ digits.
 *
 * Both replacements use fixed sentinels (`[redacted-email]`,
 * `[redacted-phone]`) so downstream code can spot redactions
 * without re-running the regex.
 *
 * @param {unknown} text
 * @returns {string} Original string minus PII matches. Non-string
 *   inputs return ''.
 */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// Phone: two alternations bounded by non-word/non-dash boundaries so we
// don't snag IDs or hyphenated numeric ranges like "1-6".
//   1) International form: '+' + 1-3 digit country code + 2-5 groups of
//      1-4 digits with common separators. Covers e.g. "+44 20 7946 0958".
//   2) NANP form: optional country/area, then 3-3-4 with separators.
// INTL is listed first so it matches preferentially when both could apply.
const PHONE_RE =
  /(?<![\w-])(?:\+\d{1,3}(?:[\s.-]?\d{1,4}){2,5}|(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4})(?![\w-])/g

function redactPII(text) {
  if (typeof text !== 'string' || text.length === 0) return ''
  return text.replace(EMAIL_RE, '[redacted-email]').replace(PHONE_RE, '[redacted-phone]')
}

module.exports = { buildContext, redactPII }
