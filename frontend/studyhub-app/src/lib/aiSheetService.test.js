/**
 * aiSheetService.test.js — coverage for the AI sheet/note service wrapper.
 *
 * Verifies the postJson envelope shape (CLAUDE.md error envelope contract):
 *   - 2xx           → { ok: true, data }
 *   - 4xx/5xx       → { ok: false, error: <message>, status }
 *   - network throw → { ok: false, error: 'Network error.', status: 0 }
 *
 * All callers depend on this envelope, so any regression here ripples to
 * AiSheetReport, AiNoteAssistant, and the bubble's downstream toast logic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  analyzeSheet,
  proposeSheetEdit,
  applySheetEdit,
  summarizeNote,
  generateNoteFlashcards,
  askAboutNote,
} from './aiSheetService'

const ORIGINAL_FETCH = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
})

function mockJsonResponse(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

describe('aiSheetService.analyzeSheet', () => {
  it('POSTs to /api/ai/sheets/:id/analyze with credentials: include', async () => {
    globalThis.fetch.mockReturnValue(mockJsonResponse(200, { summary: 'ok', issues: [] }))
    const result = await analyzeSheet(42)
    expect(result).toEqual({ ok: true, data: { summary: 'ok', issues: [] } })
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = globalThis.fetch.mock.calls[0]
    expect(url).toMatch(/\/api\/ai\/sheets\/42\/analyze$/)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('returns { ok: true, data } on 200', async () => {
    const payload = { summary: 'Great sheet', issues: [{ title: 'A', severity: 'low' }] }
    globalThis.fetch.mockReturnValue(mockJsonResponse(200, payload))
    const result = await analyzeSheet(1)
    expect(result.ok).toBe(true)
    expect(result.data).toEqual(payload)
  })

  it('returns { ok: false, error } on 4xx using the error envelope', async () => {
    globalThis.fetch.mockReturnValue(
      mockJsonResponse(403, { error: { message: 'Forbidden for non-owner.' } }),
    )
    const result = await analyzeSheet(99)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Forbidden for non-owner.')
    expect(result.status).toBe(403)
  })

  it('falls back to HTTP <status> when error body is empty', async () => {
    globalThis.fetch.mockReturnValue(mockJsonResponse(500, {}))
    const result = await analyzeSheet(1)
    expect(result).toEqual({ ok: false, error: 'HTTP 500', status: 500 })
  })

  it('returns { ok: false, error: "Network error." } when fetch throws without a message', async () => {
    // err.message defaults to '' on a bare Error — service falls back to 'Network error.'
    globalThis.fetch.mockImplementation(() => {
      throw new Error('')
    })
    const result = await analyzeSheet(1)
    expect(result).toEqual({ ok: false, error: 'Network error.', status: 0 })
  })

  it('propagates fetch.throw message verbatim when the error has one', async () => {
    globalThis.fetch.mockImplementation(() => {
      throw new Error('TypeError: Failed to fetch')
    })
    const result = await analyzeSheet(1)
    expect(result.ok).toBe(false)
    expect(result.status).toBe(0)
    expect(result.error).toMatch(/Failed to fetch/)
  })
})

describe('aiSheetService.proposeSheetEdit + applySheetEdit', () => {
  it('proposeSheetEdit sends { instruction } in body', async () => {
    globalThis.fetch.mockReturnValue(mockJsonResponse(200, { proposedContent: '<p>...</p>' }))
    await proposeSheetEdit(7, 'Tighten the intro.')
    const [, init] = globalThis.fetch.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ instruction: 'Tighten the intro.' })
  })

  it('applySheetEdit sends proposedContent + snapshotName + optional snapshotMessage', async () => {
    globalThis.fetch.mockReturnValue(mockJsonResponse(200, { ok: true }))
    await applySheetEdit(7, {
      proposedContent: '<p>hi</p>',
      snapshotName: 'Snap-1',
      snapshotMessage: 'Cleaner intro',
    })
    const [url, init] = globalThis.fetch.mock.calls[0]
    expect(url).toMatch(/\/api\/ai\/sheets\/7\/apply-edit$/)
    expect(JSON.parse(init.body)).toEqual({
      proposedContent: '<p>hi</p>',
      snapshotName: 'Snap-1',
      snapshotMessage: 'Cleaner intro',
    })
  })
})

describe('aiSheetService note endpoints', () => {
  it('summarizeNote defaults length to "medium"', async () => {
    globalThis.fetch.mockReturnValue(mockJsonResponse(200, { summary: '...' }))
    await summarizeNote(11)
    const [url, init] = globalThis.fetch.mock.calls[0]
    expect(url).toMatch(/\/api\/ai\/notes\/11\/summarize$/)
    expect(JSON.parse(init.body)).toEqual({ length: 'medium' })
  })

  it('generateNoteFlashcards forwards the count', async () => {
    globalThis.fetch.mockReturnValue(mockJsonResponse(200, { cards: [] }))
    await generateNoteFlashcards(11, 12)
    const [, init] = globalThis.fetch.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ count: 12 })
  })

  it('askAboutNote sends the question and returns { ok, data }', async () => {
    globalThis.fetch.mockReturnValue(mockJsonResponse(200, { answer: '42' }))
    const result = await askAboutNote(11, 'What is the answer?')
    expect(result).toEqual({ ok: true, data: { answer: '42' } })
    const [, init] = globalThis.fetch.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ question: 'What is the answer?' })
  })
})
