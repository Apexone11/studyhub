/**
 * ai-model-routing.unit.test.js
 *
 * Pure unit coverage for the cost-aware model router introduced in
 * loop A6 (2026-05-12) per research loop 1 gap #9. The router classifies
 * the user's message into `sheet | simple | complex` and maps the
 * classification onto a concrete Anthropic model id.
 *
 *   - Sheet requests stay on Sonnet (Haiku produces lower-quality HTML).
 *   - Short factual Q&A (<30 words, no code block, no
 *     "why" / "explain" / "how does") routes to Haiku 4.5.
 *   - Everything else stays on Sonnet.
 *
 * The classifier is a pure function — no DB, no Anthropic SDK, no
 * Express scaffolding required. Importing ai.service brings prisma /
 * Anthropic into scope but neither is invoked here; the lazy-init
 * pattern in `getClient()` keeps the ANTHROPIC_API_KEY requirement
 * deferred to actual streaming calls.
 */
import { describe, expect, it } from 'vitest'
import { classifyRequest, selectModelForClassification } from '../../src/modules/ai/ai.service.js'
import { DEFAULT_MODEL, FAST_MODEL } from '../../src/modules/ai/ai.constants.js'

describe('Hub AI cost-aware model routing — classifyRequest', () => {
  it('routes a short factual question (under 30 words, no "why/explain/how does", no code block) as simple', () => {
    expect(classifyRequest("What's the mitochondria?")).toBe('simple')
  })

  it('routes a sheet-generation request as sheet regardless of length', () => {
    expect(classifyRequest('make a chem sheet')).toBe('sheet')
    expect(classifyRequest('Generate a study sheet for organic chemistry reactions')).toBe('sheet')
    expect(classifyRequest('build me a cheatsheet on linear algebra')).toBe('sheet')
  })

  it('routes "why" / "explain" / "how does" prompts as complex even when short', () => {
    expect(classifyRequest('Why is the sky blue?')).toBe('complex')
    expect(classifyRequest('Explain mitosis.')).toBe('complex')
    expect(classifyRequest('How does TCP differ from UDP?')).toBe('complex')
  })

  it('routes a long message (30+ words) as complex even when otherwise plain', () => {
    const longPrompt =
      'I have been studying for my biology exam next week and I want to make sure I understand ' +
      'the basics of cell respiration along with all of its sub-stages and the inputs and outputs.'
    // Sanity check the fixture: 30+ words, no code fence, no why/explain/how does.
    expect(longPrompt.trim().split(/\s+/).length).toBeGreaterThanOrEqual(30)
    expect(classifyRequest(longPrompt)).toBe('complex')
  })

  it('routes a message containing a fenced code block as complex', () => {
    const codePrompt = 'Check this:\n```js\nconsole.log(1)\n```'
    expect(classifyRequest(codePrompt)).toBe('complex')
  })
})

describe('Hub AI cost-aware model routing — selectModelForClassification', () => {
  it('maps "simple" to FAST_MODEL (Haiku 4.5)', () => {
    expect(selectModelForClassification('simple')).toBe(FAST_MODEL)
  })

  it('maps "complex" to DEFAULT_MODEL (Sonnet)', () => {
    expect(selectModelForClassification('complex')).toBe(DEFAULT_MODEL)
  })

  it('maps "sheet" to DEFAULT_MODEL (Sonnet) — sheet generation must NEVER use Haiku', () => {
    expect(selectModelForClassification('sheet')).toBe(DEFAULT_MODEL)
  })

  it('falls back to DEFAULT_MODEL for any unrecognized classification value', () => {
    // Defensive — protects future contributors from accidentally
    // downgrading an unknown classification to Haiku.
    expect(selectModelForClassification('unknown')).toBe(DEFAULT_MODEL)
    expect(selectModelForClassification(undefined)).toBe(DEFAULT_MODEL)
  })
})

describe('Hub AI cost-aware model routing — defensive inputs', () => {
  it('treats an empty / non-string content as complex (never accidentally downgrades to Haiku)', () => {
    expect(classifyRequest('')).toBe('complex')
    expect(classifyRequest('   ')).toBe('complex')
    expect(classifyRequest(null)).toBe('complex')
    expect(classifyRequest(undefined)).toBe('complex')
  })
})
