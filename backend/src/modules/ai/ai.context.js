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
            OR: [
              { userId },
              { status: 'published' },
            ],
          },
          select: { title: true, description: true, content: true, contentFormat: true, course: { select: { code: true } } },
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
            OR: [
              { userId },
              { visibility: 'public' },
            ],
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

module.exports = { buildContext }
