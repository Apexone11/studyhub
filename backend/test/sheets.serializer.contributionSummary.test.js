/**
 * sheets.serializer.contributionSummary.test.js — Unit coverage for the
 * public contribution-summary counts added 2026-05-15 (founder bug
 * 2026-05-16: non-owner viewers saw "No contributions yet" with no
 * way to distinguish "actually none" from "you can't see them").
 *
 * Contract under test:
 *   - `incomingContributionsSummary` + `outgoingContributionsSummary`
 *     are ALWAYS returned (even for non-owner viewers) with shape
 *     { total, pending, accepted, rejected }.
 *   - Detailed `incomingContributions` / `outgoingContributions` arrays
 *     remain permission-gated (empty `[]` for non-owners, populated for
 *     owners + admins).
 *   - `groupBy` absence / failure degrades gracefully to a zeroed
 *     summary rather than blowing up the read path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Module, { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const serializerPath = require.resolve('../src/modules/sheets/sheets.serializer.js')

// Hoisted shared state — every test resets it in beforeEach. We mock the
// prisma + sheets.service modules at the Node loader layer so the
// serializer's `require(...)` resolves to our fakes.
const state = {
  incomingRows: [],
  outgoingRows: [],
  incomingGroup: [],
  outgoingGroup: [],
  groupByDefined: true,
  groupByThrows: false,
}

let originalLoad = null

beforeEach(() => {
  state.incomingRows = []
  state.outgoingRows = []
  state.incomingGroup = []
  state.outgoingGroup = []
  state.groupByDefined = true
  state.groupByThrows = false

  // Clear the require cache so each test gets a fresh serializer
  // module that re-requires its dependencies through our patched loader.
  delete require.cache[serializerPath]
  delete require.cache[require.resolve('../src/core/db/prisma')]
  delete require.cache[require.resolve('../src/modules/sheets/sheets.service.js')]

  const fakePrisma = {
    sheetContribution: {
      findMany: vi.fn(async ({ where }) => {
        if (where?.targetSheetId) return state.incomingRows
        if (where?.forkSheetId) return state.outgoingRows
        return []
      }),
    },
  }
  if (state.groupByDefined) {
    fakePrisma.sheetContribution.groupBy = vi.fn(async ({ where }) => {
      if (state.groupByThrows) throw new Error('forced groupBy failure')
      if (where?.targetSheetId) return state.incomingGroup
      if (where?.forkSheetId) return state.outgoingGroup
      return []
    })
  }

  const fakeSheetsService = {
    canModerateOrOwnSheet: (sheet, user) =>
      Boolean(user && (user.role === 'admin' || Number(user.userId) === Number(sheet.userId))),
  }

  // Patch the Node loader so `require('../../core/db/prisma')` etc. from
  // the serializer return our fakes. Saves having to spin a real Postgres
  // for a pure-function unit test.
  originalLoad = Module._load
  Module._load = function patched(request, parent, ...rest) {
    if (request === '../../core/db/prisma' || request === '../../lib/prisma') {
      return fakePrisma
    }
    if (request === './sheets.service' || request.endsWith('sheets.service')) {
      return fakeSheetsService
    }
    return originalLoad.call(this, request, parent, ...rest)
  }
})

afterEach(() => {
  if (originalLoad) {
    Module._load = originalLoad
    originalLoad = null
  }
  delete require.cache[serializerPath]
})

function loadFetcher() {
  return require(serializerPath).fetchContributionCollections
}

describe('fetchContributionCollections — public contribution summary', () => {
  it('returns ALWAYS-present summary objects with the canonical shape', async () => {
    const fetch = loadFetcher()
    const sheet = { id: 42, userId: 100 }
    const viewer = { userId: 999, role: 'student' } // non-owner

    const out = await fetch(sheet, viewer)

    expect(out).toHaveProperty('incomingContributionsSummary')
    expect(out).toHaveProperty('outgoingContributionsSummary')
    expect(out.incomingContributionsSummary).toEqual({
      total: 0,
      pending: 0,
      accepted: 0,
      rejected: 0,
    })
    expect(out.outgoingContributionsSummary).toEqual({
      total: 0,
      pending: 0,
      accepted: 0,
      rejected: 0,
    })
  })

  it('aggregates by status from groupBy rows correctly', async () => {
    state.incomingGroup = [
      { status: 'pending', _count: { _all: 3 } },
      { status: 'accepted', _count: { _all: 5 } },
      { status: 'rejected', _count: { _all: 2 } },
    ]
    state.outgoingGroup = [{ status: 'pending', _count: { _all: 1 } }]

    const fetch = loadFetcher()
    const out = await fetch({ id: 42, userId: 100 }, { userId: 100, role: 'student' })

    expect(out.incomingContributionsSummary).toEqual({
      total: 10,
      pending: 3,
      accepted: 5,
      rejected: 2,
    })
    expect(out.outgoingContributionsSummary).toEqual({
      total: 1,
      pending: 1,
      accepted: 0,
      rejected: 0,
    })
  })

  it('returns empty detailed arrays for non-owner viewers (permission gate)', async () => {
    state.incomingRows = [{ id: 1, status: 'pending' }]
    state.outgoingRows = [{ id: 2, status: 'pending' }]
    state.incomingGroup = [{ status: 'pending', _count: { _all: 1 } }]
    state.outgoingGroup = [{ status: 'pending', _count: { _all: 1 } }]

    const fetch = loadFetcher()
    const out = await fetch({ id: 42, userId: 100 }, { userId: 999, role: 'student' })

    // Non-owner does NOT see the row details
    expect(out.incomingContributions).toEqual([])
    expect(out.outgoingContributions).toEqual([])
    // ...but DOES see the public count summary
    expect(out.incomingContributionsSummary.total).toBe(1)
    expect(out.outgoingContributionsSummary.total).toBe(1)
  })

  it('returns detailed arrays for the sheet owner', async () => {
    state.incomingRows = [{ id: 1, status: 'pending' }]
    state.outgoingRows = [{ id: 2, status: 'accepted' }]

    const fetch = loadFetcher()
    const out = await fetch({ id: 42, userId: 100 }, { userId: 100, role: 'student' })

    expect(out.incomingContributions).toHaveLength(1)
    expect(out.outgoingContributions).toHaveLength(1)
  })

  it('returns detailed arrays for admins regardless of ownership', async () => {
    state.incomingRows = [{ id: 1, status: 'pending' }]
    state.outgoingRows = []

    const fetch = loadFetcher()
    const out = await fetch({ id: 42, userId: 100 }, { userId: 999, role: 'admin' })

    expect(out.incomingContributions).toHaveLength(1)
  })

  it('degrades gracefully when groupBy is undefined on the prisma client (older mocks)', async () => {
    state.groupByDefined = false

    const fetch = loadFetcher()
    const out = await fetch({ id: 42, userId: 100 }, { userId: 999, role: 'student' })

    expect(out.incomingContributionsSummary.total).toBe(0)
    expect(out.outgoingContributionsSummary.total).toBe(0)
  })

  it('degrades gracefully when groupBy throws (transient DB error)', async () => {
    state.groupByThrows = true

    const fetch = loadFetcher()
    const out = await fetch({ id: 42, userId: 100 }, { userId: 999, role: 'student' })

    expect(out.incomingContributionsSummary.total).toBe(0)
    expect(out.outgoingContributionsSummary.total).toBe(0)
  })

  it('returns empty arrays for an anonymous viewer (no currentUser)', async () => {
    state.incomingRows = [{ id: 1 }]
    state.outgoingRows = [{ id: 2 }]
    state.incomingGroup = [{ status: 'pending', _count: { _all: 1 } }]

    const fetch = loadFetcher()
    const out = await fetch({ id: 42, userId: 100 }, null)

    expect(out.incomingContributions).toEqual([])
    expect(out.outgoingContributions).toEqual([])
    // Anon viewer still gets the public summary
    expect(out.incomingContributionsSummary.total).toBe(1)
  })
})
