const express = require('express')
const optionalAuth = require('../../core/auth/optionalAuth')
const { getVisibleProfileIds } = require('../../lib/profileVisibility')
const { buildSheetTextSearchClauses } = require('../../lib/sheetSearch')
const { searchSheetsFTS, searchCoursesFTS, searchUsersFTS } = require('../../lib/fullTextSearch')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { timedSection, logTiming } = require('../../lib/requestTiming')
const { getBlockedUserIds } = require('../../lib/social/blockFilter')
const { summarizeText } = require('../feed/feed.service')
const { cacheControl } = require('../../lib/cacheControl')
const { searchLimiter } = require('../../lib/rateLimiters')

const router = express.Router()

router.use(searchLimiter)

const VALID_TYPES = ['all', 'sheets', 'courses', 'users', 'notes', 'groups']

/**
 * Execute search queries for anonymous (unauthenticated) users.
 * No block filtering, no notes, only public groups.
 */
async function executeSearch({ query, type, limit, useFTS }) {
  const wantSheets = type === 'all' || type === 'sheets'
  const wantCourses = type === 'all' || type === 'courses'
  const wantUsers = type === 'all' || type === 'users'
  const wantGroups = type === 'all' || type === 'groups'
  const userSearchTake = Math.min(limit * 5, 50)
  const sheetTextSearchClauses = buildSheetTextSearchClauses(query)

  const queries = []

  // Sheets
  if (wantSheets) {
    if (useFTS) {
      queries.push(
        searchSheetsFTS(query, { status: 'published', limit }).then(async (result) => {
          if (!result.sheets.length) return []
          const ids = result.sheets.map((s) => Number(s.id))
          return prisma.studySheet.findMany({
            where: { id: { in: ids } },
            select: {
              id: true,
              title: true,
              description: true,
              stars: true,
              downloads: true,
              createdAt: true,
              course: { select: { id: true, code: true, name: true } },
              author: { select: { id: true, username: true } },
            },
          })
        }),
      )
    } else {
      queries.push(
        prisma.studySheet.findMany({
          where: { status: 'published', OR: sheetTextSearchClauses },
          select: {
            id: true,
            title: true,
            description: true,
            stars: true,
            downloads: true,
            createdAt: true,
            course: { select: { id: true, code: true, name: true } },
            author: { select: { id: true, username: true } },
          },
          orderBy: { stars: 'desc' },
          take: limit,
        }),
      )
    }
  } else {
    queries.push(Promise.resolve([]))
  }

  // Courses
  if (wantCourses) {
    if (useFTS) {
      queries.push(
        searchCoursesFTS(query, { limit }).then(async (rows) => {
          if (!rows.length) return []
          const ids = rows.map((c) => Number(c.id))
          return prisma.course.findMany({
            where: { id: { in: ids } },
            select: {
              id: true,
              code: true,
              name: true,
              school: { select: { id: true, name: true, short: true } },
            },
          })
        }),
      )
    } else {
      queries.push(
        prisma.course.findMany({
          where: {
            OR: [
              { code: { contains: query, mode: 'insensitive' } },
              { name: { contains: query, mode: 'insensitive' } },
            ],
          },
          select: {
            id: true,
            code: true,
            name: true,
            school: { select: { id: true, name: true, short: true } },
          },
          orderBy: { code: 'asc' },
          take: limit,
        }),
      )
    }
  } else {
    queries.push(Promise.resolve([]))
  }

  // Users
  if (wantUsers) {
    if (useFTS) {
      queries.push(
        searchUsersFTS(query, { limit: userSearchTake }).then(async (rows) => {
          if (!rows.length) return []
          const ids = rows.map((u) => Number(u.id))
          return prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, username: true, role: true, avatarUrl: true, createdAt: true },
          })
        }),
      )
    } else {
      queries.push(
        prisma.user.findMany({
          where: { username: { contains: query, mode: 'insensitive' } },
          select: { id: true, username: true, role: true, avatarUrl: true, createdAt: true },
          orderBy: { username: 'asc' },
          take: userSearchTake,
        }),
      )
    }
  } else {
    queries.push(Promise.resolve([]))
  }

  // Notes -- always empty for anonymous users
  queries.push(Promise.resolve([]))

  // Groups -- only public for anonymous
  if (wantGroups) {
    queries.push(
      prisma.studyGroup.findMany({
        where: {
          privacy: 'public',
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          description: true,
          privacy: true,
          courseId: true,
          course: { select: { id: true, code: true, name: true } },
          createdAt: true,
          _count: { select: { members: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    )
  } else {
    queries.push(Promise.resolve([]))
  }

  const [sheets, courses, users, _notes, groups] = await Promise.all(queries)

  // Apply visibility filtering for anonymous users (all public profiles visible)
  const visibleIds = await getVisibleProfileIds(
    prisma,
    null,
    users.map((u) => u.id),
  )
  const filteredUsers = users.filter((u) => visibleIds.has(u.id)).slice(0, limit)

  const cleanSheets = sheets.map((s) => ({
    ...s,
    description: s.description ? summarizeText(s.description, 200) : '',
  }))
  const cleanGroups = groups.map((g) => ({
    ...g,
    description: g.description ? summarizeText(g.description, 200) : '',
  }))

  return {
    results: { sheets: cleanSheets, courses, users: filteredUsers, notes: [], groups: cleanGroups },
    query,
    type,
  }
}

router.get('/', optionalAuth, cacheControl(30, { staleWhileRevalidate: 60 }), async (req, res) => {
  req._timingStart = Date.now()
  const rawQ = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q
  const rawType = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type
  const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit

  const query = (rawQ || '').trim()
  const type = rawType || 'all'

  if (!query || query.length < 2) {
    return res.json({
      results: { sheets: [], courses: [], users: [], notes: [], groups: [] },
      query,
      type,
    })
  }

  if (query.length > 200) {
    return sendError(
      res,
      400,
      'Search query too long (max 200 characters).',
      ERROR_CODES.BAD_REQUEST,
    )
  }

  if (!VALID_TYPES.includes(type)) {
    return sendError(
      res,
      400,
      `Invalid search type. Must be one of: ${VALID_TYPES.join(', ')}`,
      ERROR_CODES.BAD_REQUEST,
    )
  }

  const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 8, 1), 20)

  const useFTS = req.query.fts === 'true'

  try {
    if (!req.user) {
      const result = await executeSearch({ query, type, limit, useFTS })
      return res.json(result)
    }

    // Hide blocked users and their content from search results
    const blockedIds = await getBlockedUserIds(prisma, req.user?.userId)
    const blockedIdSet = new Set(blockedIds)

    const sections = []
    const sheetTextSearchClauses = buildSheetTextSearchClauses(query)

    const wantSheets = type === 'all' || type === 'sheets'
    const wantCourses = type === 'all' || type === 'courses'
    const wantUsers = type === 'all' || type === 'users'
    const wantNotes = type === 'all' || type === 'notes'
    const wantGroups = type === 'all' || type === 'groups'
    const userSearchTake = Math.min(limit * 5, 50)

    if (wantSheets) {
      if (useFTS) {
        sections.push(
          timedSection('sheets-fts', () =>
            searchSheetsFTS(query, { status: 'published', limit }).then(async (result) => {
              if (!result.sheets.length) return []
              const ids = result.sheets.map((s) => Number(s.id))
              return prisma.studySheet.findMany({
                where: { id: { in: ids } },
                select: {
                  id: true,
                  title: true,
                  description: true,
                  stars: true,
                  downloads: true,
                  createdAt: true,
                  course: { select: { id: true, code: true, name: true } },
                  author: { select: { id: true, username: true } },
                },
              })
            }),
          ),
        )
      } else {
        sections.push(
          timedSection('sheets', () =>
            prisma.studySheet.findMany({
              where: {
                status: 'published',
                OR: sheetTextSearchClauses,
              },
              select: {
                id: true,
                title: true,
                description: true,
                stars: true,
                downloads: true,
                createdAt: true,
                course: { select: { id: true, code: true, name: true } },
                author: { select: { id: true, username: true } },
              },
              orderBy: { stars: 'desc' },
              take: limit,
            }),
          ),
        )
      }
    } else {
      sections.push(timedSection('sheets-skip', () => []))
    }

    if (wantCourses) {
      if (useFTS) {
        sections.push(
          timedSection('courses-fts', () =>
            searchCoursesFTS(query, { limit }).then(async (rows) => {
              if (!rows.length) return []
              const ids = rows.map((c) => Number(c.id))
              return prisma.course.findMany({
                where: { id: { in: ids } },
                select: {
                  id: true,
                  code: true,
                  name: true,
                  school: { select: { id: true, name: true, short: true } },
                },
              })
            }),
          ),
        )
      } else {
        sections.push(
          timedSection('courses', () =>
            prisma.course.findMany({
              where: {
                OR: [
                  { code: { contains: query, mode: 'insensitive' } },
                  { name: { contains: query, mode: 'insensitive' } },
                ],
              },
              select: {
                id: true,
                code: true,
                name: true,
                school: { select: { id: true, name: true, short: true } },
              },
              orderBy: { code: 'asc' },
              take: limit,
            }),
          ),
        )
      }
    } else {
      sections.push(timedSection('courses-skip', () => []))
    }

    if (wantUsers) {
      if (useFTS) {
        sections.push(
          timedSection('users-fts', () =>
            searchUsersFTS(query, { limit: userSearchTake }).then(async (rows) => {
              if (!rows.length) return []
              const ids = rows.map((u) => Number(u.id))
              return prisma.user.findMany({
                where: { id: { in: ids } },
                select: {
                  id: true,
                  username: true,
                  role: true,
                  avatarUrl: true,
                  createdAt: true,
                },
              })
            }),
          ),
        )
      } else {
        sections.push(
          timedSection('users', () =>
            prisma.user.findMany({
              where: {
                username: { contains: query, mode: 'insensitive' },
              },
              select: {
                id: true,
                username: true,
                role: true,
                avatarUrl: true,
                createdAt: true,
              },
              orderBy: { username: 'asc' },
              take: userSearchTake,
            }),
          ),
        )
      }
    } else {
      sections.push(timedSection('users-skip', () => []))
    }

    if (wantNotes && req.user) {
      // Notes are only searchable by authenticated users
      sections.push(
        timedSection('notes', () =>
          prisma.note.findMany({
            where: {
              private: false,
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { content: { contains: query, mode: 'insensitive' } },
                { tags: { contains: query, mode: 'insensitive' } },
              ],
            },
            select: {
              id: true,
              title: true,
              createdAt: true,
              course: { select: { id: true, code: true, name: true } },
              author: { select: { id: true, username: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
          }),
        ),
      )
    } else {
      sections.push(timedSection('notes-skip', () => []))
    }

    if (wantGroups) {
      const groupWhere = {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      }
      // If user is authenticated, also include groups they're members of, regardless of privacy
      if (req.user?.userId) {
        groupWhere.OR.push({
          members: {
            some: {
              userId: req.user.userId,
              status: 'active',
            },
          },
        })
        // Make privacy filter match authenticated case
        groupWhere.AND = [
          {
            OR: [
              { privacy: 'public' },
              {
                members: {
                  some: {
                    userId: req.user.userId,
                    status: 'active',
                  },
                },
              },
            ],
          },
        ]
      } else {
        // Unauthenticated users can only see public groups
        groupWhere.privacy = 'public'
      }
      sections.push(
        timedSection('groups', () =>
          prisma.studyGroup.findMany({
            where: groupWhere,
            select: {
              id: true,
              name: true,
              description: true,
              privacy: true,
              courseId: true,
              course: { select: { id: true, code: true, name: true } },
              createdAt: true,
              _count: { select: { members: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
          }),
        ),
      )
    } else {
      sections.push(timedSection('groups-skip', () => []))
    }

    const resolved = await Promise.all(sections)
    // Filter blocked users from all result sets
    const filterBlocked = (items, userIdField = 'author') =>
      blockedIds.length === 0
        ? items
        : items.filter((item) => {
            const uid =
              typeof userIdField === 'function' ? userIdField(item) : item[userIdField]?.id
            return !uid || !blockedIdSet.has(uid)
          })

    const sheets = filterBlocked(resolved[0].data || [])
    const courses = resolved[1].data || []
    const matchedUsers = filterBlocked(resolved[2].data || [], (u) => u.id)
    const notes = filterBlocked(resolved[3].data || [])
    const groups = resolved[4].data || []
    let users = matchedUsers

    if (wantUsers && matchedUsers.length) {
      const visibilitySection = await timedSection('visibility', () =>
        getVisibleProfileIds(
          prisma,
          req.user,
          matchedUsers.map((user) => user.id),
        ),
      )
      resolved.push(visibilitySection)

      const visibleUserIds = visibilitySection.data
      users = matchedUsers.filter((user) => visibleUserIds.has(user.id)).slice(0, limit)
    }

    logTiming(req, {
      sections: resolved,
      extra: {
        query: query.slice(0, 50),
        type,
        useFTS,
        counts: {
          sheets: sheets.length,
          courses: courses.length,
          users: users.length,
          notes: notes.length,
          groups: groups.length,
        },
      },
    })

    // Sanitize any HTML from descriptions before sending to the client
    const cleanSheets = sheets.map((s) => ({
      ...s,
      description: s.description ? summarizeText(s.description, 200) : '',
    }))
    const cleanGroups = groups.map((g) => ({
      ...g,
      description: g.description ? summarizeText(g.description, 200) : '',
    }))

    return res.json({
      results: { sheets: cleanSheets, courses, users, notes, groups: cleanGroups },
      query,
      type,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
