/**
 * ai.context.test.js -- Unit tests for Hub AI context builder.
 * Verifies that buildContext injects the right user data, enforces
 * access control on sheets/notes, and degrades gracefully on errors.
 */
import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const contextPath = require.resolve('../src/modules/ai/ai.context')

const mocks = vi.hoisted(() => {
  return {
    prisma: {
      user: { findUnique: vi.fn() },
      studySheet: { findFirst: vi.fn(), findMany: vi.fn() },
      note: { findFirst: vi.fn(), findMany: vi.fn() },
    },
  }
})

const mockTargets = new Map([[require.resolve('../src/lib/prisma'), mocks.prisma]])

const originalModuleLoad = Module._load
let buildContext
let redactPII

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)
    if (mockedModule) return mockedModule
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[contextPath]
  const mod = require('../src/modules/ai/ai.context')
  buildContext = mod.buildContext
  redactPII = mod.redactPII
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[contextPath]
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildContext', () => {
  it('returns empty string when no data is available', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    const result = await buildContext(1)
    expect(result).toBe('')
  })

  it('includes user profile and enrolled courses', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      username: 'testuser',
      accountType: 'student',
      enrollments: [
        { course: { id: 10, code: 'CS101', title: 'Intro to CS' } },
        { course: { id: 11, code: 'MATH201', title: 'Calculus II' } },
      ],
    })
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    const result = await buildContext(1)

    expect(result).toContain('testuser')
    expect(result).toContain('student')
    expect(result).toContain('CS101')
    expect(result).toContain('MATH201')
    expect(result).toContain('Calculus II')
  })

  it('includes current page path', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    const result = await buildContext(1, { currentPage: '/feed' })

    expect(result).toContain('/feed')
    expect(result).toContain('<current_page>')
  })

  it('injects sheet context when viewing a sheet page', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.prisma.studySheet.findFirst.mockResolvedValue({
      title: 'Bio Study Guide',
      description: 'Chapter 5 review',
      content: '<p>Cell division notes</p>',
      contentFormat: 'html',
      course: { code: 'BIO101' },
    })
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    const result = await buildContext(1, { currentPage: '/sheets/42' })

    expect(result).toContain('Bio Study Guide')
    expect(result).toContain('BIO101')
    expect(result).toContain('Cell division notes')
    expect(result).toContain('<current_sheet>')
  })

  it('uses access-controlled findFirst for sheet lookup (OR clause)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.prisma.studySheet.findFirst.mockResolvedValue(null)
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    await buildContext(5, { currentPage: '/sheets/99' })

    expect(mocks.prisma.studySheet.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 99,
          OR: [{ userId: 5 }, { status: 'published' }],
        }),
      }),
    )
  })

  it('injects note context when viewing a note page', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.prisma.note.findFirst.mockResolvedValue({
      title: 'Lecture 3 Notes',
      content: 'Important points about thermodynamics',
      course: { code: 'PHYS201' },
    })
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    const result = await buildContext(1, { currentPage: '/notes/15' })

    expect(result).toContain('Lecture 3 Notes')
    expect(result).toContain('PHYS201')
    expect(result).toContain('thermodynamics')
    expect(result).toContain('<current_note>')
  })

  it('uses access-controlled findFirst for note lookup (OR clause)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.prisma.note.findFirst.mockResolvedValue(null)
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    await buildContext(7, { currentPage: '/notes/50' })

    expect(mocks.prisma.note.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 50,
          OR: [{ userId: 7 }, { visibility: 'public' }],
        }),
      }),
    )
  })

  it('includes recent sheets', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.prisma.studySheet.findMany.mockResolvedValue([
      { id: 1, title: 'Chem Formulas', course: { code: 'CHEM101' } },
      { id: 2, title: 'History Timeline', course: null },
    ])
    mocks.prisma.note.findMany.mockResolvedValue([])

    const result = await buildContext(1)

    expect(result).toContain('Chem Formulas')
    expect(result).toContain('CHEM101')
    expect(result).toContain('History Timeline')
    expect(result).toContain('<user_recent_sheets>')
  })

  it('includes recent notes', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([
      { id: 3, title: 'Lab Report Draft', course: { code: 'BIO101' } },
    ])

    const result = await buildContext(1)

    expect(result).toContain('Lab Report Draft')
    expect(result).toContain('<user_recent_notes>')
  })

  it('truncates sheet content to 6000 characters', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    const longContent = 'x'.repeat(10000)
    mocks.prisma.studySheet.findFirst.mockResolvedValue({
      title: 'Long Sheet',
      description: null,
      content: longContent,
      contentFormat: 'html',
      course: null,
    })
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    const result = await buildContext(1, { currentPage: '/sheets/1' })

    const contentMatch = result.match(/Content \(may be truncated\):\n(x+)/)
    expect(contentMatch).toBeTruthy()
    expect(contentMatch[1].length).toBeLessThanOrEqual(6000)
  })

  it('degrades gracefully when user query throws', async () => {
    mocks.prisma.user.findUnique.mockRejectedValue(new Error('DB down'))
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    const result = await buildContext(1)
    expect(result).toBeDefined()
  })

  it('degrades gracefully when sheet query throws', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.prisma.studySheet.findFirst.mockRejectedValue(new Error('DB error'))
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    const result = await buildContext(1, { currentPage: '/sheets/1' })

    expect(result).toContain('/sheets/1')
    expect(result).not.toContain('<current_sheet>')
  })

  it('degrades gracefully when recent sheets query throws', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.prisma.studySheet.findMany.mockRejectedValue(new Error('timeout'))
    mocks.prisma.note.findMany.mockResolvedValue([])

    const result = await buildContext(1)
    expect(result).not.toContain('<user_recent_sheets>')
  })
})

describe('redactPII (decision #17, locked Phase 3)', () => {
  it('replaces email addresses with [redacted-email]', () => {
    const out = redactPII('Contact me at student@example.edu for notes.')
    expect(out).not.toContain('student@example.edu')
    expect(out).toContain('[redacted-email]')
  })

  it('replaces multiple emails in a single string', () => {
    const out = redactPII('a@b.com and c.d@e.io are both classmates')
    expect(out).not.toContain('a@b.com')
    expect(out).not.toContain('c.d@e.io')
    expect(out.match(/\[redacted-email\]/g)?.length).toBe(2)
  })

  it('replaces NANP phone numbers (with and without separators)', () => {
    expect(redactPII('Call 123-456-7890 today.')).toContain('[redacted-phone]')
    expect(redactPII('Call (123) 456-7890 today.')).toContain('[redacted-phone]')
    expect(redactPII('Call 1234567890 today.')).toContain('[redacted-phone]')
  })

  it('replaces international-style phone numbers starting with +', () => {
    const out = redactPII('Reach me at +44 20 7946 0958.')
    expect(out).toContain('[redacted-phone]')
    expect(out).not.toContain('20 7946 0958')
  })

  it('returns "" for non-string input (defensive boundary)', () => {
    expect(redactPII(undefined)).toBe('')
    expect(redactPII(null)).toBe('')
    expect(redactPII(42)).toBe('')
    expect(redactPII({ x: 1 })).toBe('')
  })

  it('leaves PII-free strings unchanged', () => {
    const text = 'Review chapters 1-6 before the midterm on May 5.'
    expect(redactPII(text)).toBe(text)
  })

  /**
   * Boundary regression suite for the tightened phone regex.
   *
   * The Round-of-fixes commit (3ed90abb) reshaped PHONE_RE specifically
   * to stop snagging hyphenated numeric ranges like "chapters 1-6" and
   * to start catching arbitrarily-grouped international numbers like
   * "+44 20 7946 0958". These cases pin the new behavior so a future
   * "simplify the regex" refactor can't quietly regress either side.
   */
  describe('phone regex — boundary cases', () => {
    it('does not match short hyphenated ranges like "1-6" or "10-12"', () => {
      expect(redactPII('Read chapters 1-6 tonight.')).not.toContain('[redacted-phone]')
      expect(redactPII('Sections 10-12 are due Friday.')).not.toContain('[redacted-phone]')
    })

    it('does not match digit runs that are part of identifiers (no word-boundary leakage)', () => {
      // The (?<![\w-]) / (?![\w-]) anchors are what protect IDs. If
      // they ever get dropped, an order_id or sheet slug containing a
      // 10-digit run would get partially redacted.
      expect(redactPII('order_1234567890_extra')).not.toContain('[redacted-phone]')
      expect(redactPII('sheet-slug-1234567890-v2')).not.toContain('[redacted-phone]')
    })

    it('matches international numbers with multiple short groups', () => {
      // E.164-style with 4 groups of varying lengths. The regex's
      // first alternation is what makes this work.
      expect(redactPII('Reach me at +1 415 555 0199 mornings.')).toContain('[redacted-phone]')
      expect(redactPII('UK office: +44 20 7946 0958.')).toContain('[redacted-phone]')
    })

    it('matches NANP numbers without separators', () => {
      // Bare 10-digit run, surrounded by whitespace, is the worst-case
      // for the boundary check — must still match.
      expect(redactPII('Phone 4155550199 today.')).toContain('[redacted-phone]')
    })

    it('matches a phone number sitting at the end of a sentence', () => {
      // The trailing punctuation is a non-word character, so the
      // (?![\w-]) lookahead must still allow the match.
      expect(redactPII('Call 123-456-7890.')).toContain('[redacted-phone]')
    })

    it('redacts both an email and a phone in the same string', () => {
      const out = redactPII('Email a@b.com or call 123-456-7890.')
      expect(out).toContain('[redacted-email]')
      expect(out).toContain('[redacted-phone]')
      expect(out).not.toContain('a@b.com')
      expect(out).not.toContain('123-456-7890')
    })
  })
})
