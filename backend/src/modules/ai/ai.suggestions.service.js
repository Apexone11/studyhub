/**
 * ai.suggestions.service.js — Phase 3 of v2 design refresh.
 *
 * Generates the inline study-coach suggestion shown in the
 * AiSuggestionCard on UserProfilePage Overview. One short, actionable
 * suggestion per user at a time; persisted as `AiSuggestion` rows so
 * dismissals stick across sessions and we can mine the data later.
 *
 * Quota model: shares the daily counter with Hub AI (same
 * AiUsageLog table). A user who's already used their day's budget in
 * /api/ai/messages must NOT be able to mint fresh suggestions —
 * surfaces as `null` + `quotaExhausted: true` from the public API.
 *
 * Security baseline (decision #17 + addendum):
 *   - PII redacted at BOTH input and output boundaries.
 *   - Context scope is the current user's own data only — buildContext
 *     in ai.context.js is already userId-scoped, but we re-document
 *     the constraint here for the next person to wire something up.
 */

const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { buildContext, redactPII } = require('./ai.context')
const aiService = require('./ai.service')
const { DEFAULT_MODEL } = require('./ai.constants')

// A suggestion older than this is "stale" — the GET endpoint will
// auto-regenerate when fetched. 30 minutes balances freshness against
// quota burn from page reloads.
const STALENESS_MS = 30 * 60 * 1000

// Cap output tokens hard. The model returns a tiny JSON object; a
// runaway response would burn tokens for no UX gain.
const MAX_OUTPUT_TOKENS = 256

const ALLOWED_CTA_ACTIONS = new Set(['open_chat', 'create_sheet', 'review_sheet'])

const SYSTEM_PROMPT = `You are StudyHub's helpful study coach. Look at the student's recent activity and suggest ONE specific, actionable next step they could take.

Output JSON only, no preamble, no trailing prose:
{ "text": "<one sentence, ≤140 chars>", "ctaLabel": "<≤20 chars>", "ctaAction": "open_chat" | "create_sheet" | "review_sheet" }

Do not include the user's name, email, phone number, or any other PII. Do not reference other students or anyone besides the user themselves.`

/**
 * Fetch the user's latest non-dismissed suggestion, or null if none
 * exist or the latest is stale. Pure read — does not generate.
 */
async function getCurrentSuggestion(userId) {
  return prisma.aiSuggestion.findFirst({
    where: { userId, dismissedAt: null },
    orderBy: { generatedAt: 'desc' },
  })
}

function isStale(suggestion) {
  if (!suggestion) return true
  const age = Date.now() - new Date(suggestion.generatedAt).getTime()
  return age > STALENESS_MS
}

/**
 * Returns true if the user has any quota left for an AI call today.
 * Same daily counter Hub AI reads — see decision in ai.service.js.
 */
async function hasQuotaRemaining(user) {
  const limit = await aiService.getDailyLimit(user)
  const usage = await aiService.getOrCreateUsage(user.id || user.userId)
  return usage.messageCount < limit
}

/**
 * Validate the model's JSON output. Reject hallucinated fields, bad
 * shapes, oversize text — anything that would let a prompt-injection
 * payload reach the client.
 */
function validateModelOutput(parsed) {
  if (!parsed || typeof parsed !== 'object') return null
  if (typeof parsed.text !== 'string' || typeof parsed.ctaLabel !== 'string') return null
  if (typeof parsed.ctaAction !== 'string') return null

  const text = parsed.text.trim()
  const ctaLabel = parsed.ctaLabel.trim()
  const ctaAction = parsed.ctaAction.trim()

  if (text.length === 0 || text.length > 280) return null
  if (ctaLabel.length === 0 || ctaLabel.length > 40) return null
  if (!ALLOWED_CTA_ACTIONS.has(ctaAction)) return null

  return { text, ctaLabel, ctaAction }
}

/**
 * Generate a fresh suggestion: build user-scoped context, redact PII,
 * call Anthropic, validate, redact again, persist, return.
 *
 * Returns { suggestion } on success or throws — callers decide whether
 * to surface the error to the client. Quota check is the CALLER's
 * responsibility (so the GET endpoint can return null+quotaExhausted
 * without bothering the model).
 */
async function generateSuggestion(user) {
  const userId = user.id || user.userId

  // Build user-scoped context. ai.context.buildContext is already
  // scoped by userId — but we still redact PII before sending to
  // Anthropic in case a sheet body or note title contains an email
  // or phone number that snuck through.
  const rawContext = await buildContext(userId)
  const safeContext = redactPII(rawContext)

  const client = aiService.getClient()
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: safeContext || 'No recent activity yet — suggest a generic first step.',
      },
    ],
  })

  // Anthropic SDK returns content as an array of blocks. We expect
  // one text block; reject anything else.
  const block = Array.isArray(response.content) ? response.content[0] : null
  const rawText = block && block.type === 'text' && typeof block.text === 'string' ? block.text : ''

  let parsed
  try {
    parsed = JSON.parse(rawText.trim())
  } catch {
    // Sometimes the model wraps the JSON in code fences. Strip a
    // single ```json ... ``` wrapper if present.
    const stripped = rawText.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
    try {
      parsed = JSON.parse(stripped)
    } catch {
      throw new Error('AI returned non-JSON suggestion output')
    }
  }

  const validated = validateModelOutput(parsed)
  if (!validated) {
    throw new Error('AI returned malformed suggestion output')
  }

  // Output-side PII redaction. The model has been told not to emit
  // PII, but defense-in-depth.
  const safe = {
    text: redactPII(validated.text),
    ctaLabel: redactPII(validated.ctaLabel),
    ctaAction: validated.ctaAction,
  }

  // Increment shared daily counter BEFORE persist so a DB write
  // failure on AiSuggestion can't double-charge quota.
  await aiService.incrementUsage(userId, response?.usage?.output_tokens || 0)

  const created = await prisma.aiSuggestion.create({
    data: {
      userId,
      text: safe.text,
      ctaLabel: safe.ctaLabel,
      ctaAction: safe.ctaAction,
    },
  })

  return created
}

/**
 * Public service function for GET /api/ai/suggestions.
 *
 * Resolves to one of:
 *   - { suggestion: <row>, quotaExhausted: false } when a fresh
 *     suggestion is on hand or just generated.
 *   - { suggestion: null,  quotaExhausted: true  } when the user is
 *     at their daily AI cap.
 *   - { suggestion: null,  quotaExhausted: false } when generation
 *     was skipped for a non-quota reason (e.g. error).
 */
async function fetchOrGenerate(user) {
  const userId = user.id || user.userId
  const current = await getCurrentSuggestion(userId)
  if (current && !isStale(current)) {
    return { suggestion: current, quotaExhausted: false }
  }

  const hasBudget = await hasQuotaRemaining(user)
  if (!hasBudget) {
    return { suggestion: current || null, quotaExhausted: true }
  }

  try {
    const fresh = await generateSuggestion(user)
    return { suggestion: fresh, quotaExhausted: false }
  } catch (err) {
    captureError(err, { tags: { module: 'ai', action: 'suggestionFetchOrGenerate' } })
    // Fall back to the (stale) current row rather than nothing — a
    // slightly stale suggestion is better UX than an empty card on
    // a transient model error.
    return { suggestion: current || null, quotaExhausted: false }
  }
}

/**
 * Force a regeneration. Caller is responsible for the refresh-rate
 * limit; this function still checks the daily quota.
 */
async function refreshSuggestion(user) {
  const hasBudget = await hasQuotaRemaining(user)
  if (!hasBudget) {
    return { suggestion: null, quotaExhausted: true }
  }
  try {
    const fresh = await generateSuggestion(user)
    return { suggestion: fresh, quotaExhausted: false }
  } catch (err) {
    captureError(err, { tags: { module: 'ai', action: 'suggestionRefresh' } })
    throw err
  }
}

/**
 * Mark a suggestion dismissed. Owner check is enforced — passing a
 * suggestionId belonging to a different user returns false (not 404,
 * because that would let an attacker probe id existence).
 */
async function dismissSuggestion(userId, suggestionId) {
  const result = await prisma.aiSuggestion.updateMany({
    where: { id: suggestionId, userId, dismissedAt: null },
    data: { dismissedAt: new Date() },
  })
  return result.count === 1
}

module.exports = {
  // Public service surface
  fetchOrGenerate,
  refreshSuggestion,
  dismissSuggestion,
  // Test seams
  getCurrentSuggestion,
  generateSuggestion,
  validateModelOutput,
  isStale,
  STALENESS_MS,
  ALLOWED_CTA_ACTIONS,
}
