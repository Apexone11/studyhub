/**
 * runEval.js — Hub AI evaluation harness.
 *
 * Runs each fixture in fixtures.json against Anthropic with the live
 * SYSTEM_PROMPT, applies the fixture's assertions to the response, and
 * writes a PASS/FAIL table to results/<ISO-timestamp>.md. Exits 0 on all
 * pass, 1 on any fail.
 *
 * This is the closest thing StudyHub has to a regression net on the
 * SYSTEM_PROMPT. Run BEFORE shipping any prompt edit — see CLAUDE.md
 * "Hub AI" → manual eval bullet for the workflow.
 *
 * Cost note: each fixture is one live Anthropic call. With 12 fixtures
 * on Sonnet 4 the run is roughly $0.10–0.20. DO NOT wire to CI.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node backend/scripts/aiEval/runEval.js
 * or:
 *   npm --prefix backend run ai:eval
 */

const path = require('node:path')
const fs = require('node:fs')

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })

const Anthropic = require('@anthropic-ai/sdk')
const {
  DEFAULT_MODEL,
  SYSTEM_PROMPT,
  MAX_OUTPUT_TOKENS_SHEET,
} = require('../../src/modules/ai/ai.constants')
// The eval bypasses the running Express server, but it should still apply
// the same input-side PII redaction the live service applies so the
// SYSTEM_PROMPT sees the same shape of text.
const { redactPII } = require('../../src/modules/ai/ai.context')

const FIXTURES_PATH = path.resolve(__dirname, 'fixtures.json')
const RESULTS_DIR = path.resolve(__dirname, 'results')
const RESPONSE_PREVIEW_CHARS = 800

function isoFilenameSafe(date = new Date()) {
  // 2026-05-12T18-43-21Z — safe on Windows + Linux + macOS filesystems.
  return date.toISOString().replace(/[:.]/g, '-')
}

function loadFixtures() {
  const raw = fs.readFileSync(FIXTURES_PATH, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed?.fixtures)) {
    throw new Error('fixtures.json must have a top-level "fixtures" array.')
  }
  return parsed.fixtures
}

function applyAssertion(responseText, assertion) {
  const text = responseText || ''
  const caseSensitive = assertion.caseSensitive === true
  const haystack = caseSensitive ? text : text.toLowerCase()

  switch (assertion.type) {
    case 'includes': {
      const needle = caseSensitive ? assertion.value : String(assertion.value).toLowerCase()
      return haystack.includes(needle)
    }
    case 'notIncludes': {
      const needle = caseSensitive ? assertion.value : String(assertion.value).toLowerCase()
      return !haystack.includes(needle)
    }
    case 'matches': {
      const flags = caseSensitive ? '' : 'i'
      const re = new RegExp(assertion.value, flags)
      return re.test(text)
    }
    case 'notMatches': {
      const flags = caseSensitive ? '' : 'i'
      const re = new RegExp(assertion.value, flags)
      return !re.test(text)
    }
    case 'minLength':
      return text.length >= Number(assertion.value)
    case 'maxLength':
      return text.length <= Number(assertion.value)
    default:
      throw new Error(`Unknown assertion type: ${assertion.type}`)
  }
}

function buildClaudeMessages(fixture) {
  const messages = []
  if (Array.isArray(fixture.history)) {
    for (const turn of fixture.history) {
      if (!turn || (turn.role !== 'user' && turn.role !== 'assistant')) continue
      messages.push({
        role: turn.role,
        content: [{ type: 'text', text: String(turn.content || '') }],
      })
    }
  }
  // The live service redacts PII before it ever reaches Anthropic
  // (ai.service.js → redactPII on user input). Mirror that here so the
  // PII fixture exercises the same path.
  const redactedUser = redactPII(String(fixture.userMessage || ''))
  messages.push({
    role: 'user',
    content: [{ type: 'text', text: redactedUser }],
  })
  return messages
}

async function callClaude(client, fixture) {
  // Sheet-generation fixtures need the larger token budget because the
  // live service flips to MAX_OUTPUT_TOKENS_SHEET for HTML sheets.
  // Everything else gets the QA budget. We use the SHEET budget for any
  // fixture whose userMessage looks like a sheet request — same coarse
  // detection as ai.service.js — so the model isn't artificially clipped.
  const userText = String(fixture.userMessage || '')
  const isSheetRequest =
    /\b(study sheet|cheat\s?sheet|study guide|reference sheet|review sheet)\b/i.test(userText)
  // The Sheet budget is large enough to also cover the longest non-sheet
  // fixtures; capping at SHEET keeps each call's worst-case cost bounded.
  const maxTokens = isSheetRequest ? MAX_OUTPUT_TOKENS_SHEET : 2048

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    messages: buildClaudeMessages(fixture),
  })

  // Concatenate all text content blocks (vision responses can return
  // multiple). Non-text blocks are ignored for assertion purposes.
  const text = (response?.content || [])
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')

  return {
    text,
    usage: response?.usage || null,
    stopReason: response?.stop_reason || null,
    model: response?.model || DEFAULT_MODEL,
  }
}

function truncateForReport(text, max = RESPONSE_PREVIEW_CHARS) {
  if (!text) return '(empty response)'
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n... [truncated, ${text.length - max} more chars]`
}

function escapeForCodeFence(text) {
  // Avoid prematurely closing the markdown fence in the report.
  return String(text).replace(/```/g, '`​``')
}

function buildReport({ startedAt, finishedAt, results, allPassed }) {
  const lines = []
  lines.push('# Hub AI eval run')
  lines.push('')
  lines.push(`- Started: ${startedAt.toISOString()}`)
  lines.push(`- Finished: ${finishedAt.toISOString()}`)
  lines.push(`- Duration: ${Math.round((finishedAt - startedAt) / 1000)}s`)
  lines.push(`- Model: ${DEFAULT_MODEL}`)
  lines.push(`- Fixtures: ${results.length}`)
  lines.push(`- Overall: ${allPassed ? 'PASS' : 'FAIL'}`)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('| # | ID | Category | Result | Assertions passed |')
  lines.push('|---|----|----------|--------|-------------------|')
  results.forEach((r, idx) => {
    const passedCount = r.assertionResults.filter((a) => a.passed).length
    const total = r.assertionResults.length
    const verdict = r.error ? 'ERROR' : r.passed ? 'PASS' : 'FAIL'
    lines.push(
      `| ${idx + 1} | \`${r.id}\` | ${r.category || '-'} | ${verdict} | ${passedCount}/${total} |`,
    )
  })
  lines.push('')
  lines.push('## Per-fixture detail')

  for (const r of results) {
    lines.push('')
    lines.push(`### \`${r.id}\` — ${r.category || 'uncategorized'}`)
    lines.push('')
    if (r.description) {
      lines.push(`> ${r.description}`)
      lines.push('')
    }
    if (r.error) {
      lines.push(`**ERROR:** ${r.error}`)
      lines.push('')
      continue
    }
    lines.push(`- Verdict: **${r.passed ? 'PASS' : 'FAIL'}**`)
    if (r.usage) {
      lines.push(
        `- Tokens: in=${r.usage.input_tokens ?? '?'} out=${r.usage.output_tokens ?? '?'} cacheRead=${
          r.usage.cache_read_input_tokens ?? 0
        } cacheCreate=${r.usage.cache_creation_input_tokens ?? 0}`,
      )
    }
    if (r.stopReason) {
      lines.push(`- stop_reason: \`${r.stopReason}\``)
    }
    lines.push('')
    lines.push('Assertions:')
    lines.push('')
    for (const a of r.assertionResults) {
      const mark = a.passed ? 'PASS' : 'FAIL'
      lines.push(`- [${mark}] ${a.label || `${a.type}: ${a.value}`}`)
    }
    lines.push('')
    lines.push('Response (truncated to 800 chars):')
    lines.push('')
    lines.push('```text')
    lines.push(escapeForCodeFence(truncateForReport(r.responseText)))
    lines.push('```')
  }

  lines.push('')
  return lines.join('\n')
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. Add it to backend/.env or export it.')
    process.exit(1)
  }

  const fixtures = loadFixtures()
  if (fixtures.length === 0) {
    console.error('No fixtures found in fixtures.json.')
    process.exit(1)
  }

  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true })
  }

  const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY })
  const startedAt = new Date()
  const results = []

  console.log(`Running ${fixtures.length} fixtures against ${DEFAULT_MODEL}...`)

  for (let i = 0; i < fixtures.length; i += 1) {
    const fixture = fixtures[i]
    const label = `[${i + 1}/${fixtures.length}] ${fixture.id}`
    process.stdout.write(`${label} ... `)

    const entry = {
      id: fixture.id,
      category: fixture.category,
      description: fixture.description,
      responseText: '',
      usage: null,
      stopReason: null,
      assertionResults: [],
      passed: false,
      error: null,
    }

    try {
      const { text, usage, stopReason } = await callClaude(client, fixture)
      entry.responseText = text
      entry.usage = usage
      entry.stopReason = stopReason

      const assertions = Array.isArray(fixture.assertions) ? fixture.assertions : []
      for (const assertion of assertions) {
        let passed = false
        let assertionError = null
        try {
          passed = applyAssertion(text, assertion)
        } catch (err) {
          assertionError = err.message
        }
        entry.assertionResults.push({
          type: assertion.type,
          value: assertion.value,
          label: assertion.label,
          passed,
          error: assertionError,
        })
      }
      entry.passed =
        entry.assertionResults.length > 0 && entry.assertionResults.every((a) => a.passed)
      console.log(entry.passed ? 'PASS' : 'FAIL')
    } catch (err) {
      entry.error = err?.message || String(err)
      console.log(`ERROR (${entry.error})`)
    }

    results.push(entry)
  }

  const finishedAt = new Date()
  const allPassed = results.every((r) => r.passed && !r.error)
  const report = buildReport({ startedAt, finishedAt, results, allPassed })

  const reportPath = path.join(RESULTS_DIR, `${isoFilenameSafe(startedAt)}.md`)
  fs.writeFileSync(reportPath, report, 'utf8')

  console.log('')
  console.log(`Report written: ${reportPath}`)
  console.log(`Overall: ${allPassed ? 'PASS' : 'FAIL'}`)

  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error('Eval harness crashed:', err)
  process.exit(1)
})
