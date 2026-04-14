/**
 * ai.inputSanitizer.js — Phase 5 prompt injection defense for Hub AI.
 *
 * Scans user messages BEFORE they reach the Claude API and flags
 * common prompt-injection patterns. This is defense-in-depth:
 * Claude's own system-prompt hierarchy provides the primary boundary,
 * and this module adds a lightweight pre-check so suspicious inputs
 * can be audited before and after they are sent to the model.
 *
 * The approach is deliberately conservative — we trim the message and
 * flag only the most blatant injection prefixes/patterns for review,
 * rather than stripping content. Overly aggressive filtering would
 * break legitimate educational questions about prompt engineering or
 * AI safety.
 */
// captureError is used by the caller (ai.service.js), not in this module.

// Patterns that attempt to override the system prompt or change the
// AI's identity/instructions. Case-insensitive, applied to the start
// of the message or after common delimiters.
const INJECTION_PATTERNS = [
  // Direct instruction overrides
  /^(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|context)/i,
  // Role reassignment
  /^you\s+are\s+now\s+(a|an|the)\s+/i,
  /^(pretend|act|behave)\s+(like\s+)?(you\s+are|you're|to\s+be)\s+/i,
  // System prompt extraction
  /^(show|display|reveal|print|output|repeat|echo)\s+(me\s+)?(your|the)\s+(system\s+)?prompt/i,
  /^what\s+(is|are)\s+your\s+(system\s+)?(prompt|instructions?|rules?)/i,
  // Delimiter-based injection (e.g., ### NEW INSTRUCTIONS ###)
  /^#{2,}\s*(new|system|override|admin)\s*(instructions?|prompt|mode)/i,
  // XML/markdown injection boundaries
  /^<\/?system>/i,
  /^<\/?instructions?>/i,
]

// Patterns in AI output that suggest the model leaked its system
// prompt or generated dangerous content.
const OUTPUT_RED_FLAGS = [
  // System prompt fragments (the StudyHub system prompt starts with these)
  /you\s+are\s+Hub\s+AI.*a\s+friendly\s+study\s+assistant/i,
  // PII patterns
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // credit card
]

/**
 * Sanitize a user message before sending to Claude.
 * Returns { sanitized: string, flagged: boolean, reason?: string }
 *
 * If flagged, the caller should still send the sanitized version but
 * log the event for security review.
 */
function sanitizeAiInput(message) {
  if (!message || typeof message !== 'string') {
    return { sanitized: '', flagged: false }
  }

  const trimmed = message.trim()
  let flagged = false
  let reason = null

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      flagged = true
      reason = `Matched injection pattern: ${pattern.source.slice(0, 60)}`
      break
    }
  }

  // Don't strip the message — Claude should still see it so it can
  // politely decline. But flag it so we can audit.
  return { sanitized: trimmed, flagged, reason }
}

/**
 * Scan AI output for red flags before sending to the user.
 * Returns { clean: boolean, reason?: string }
 */
function scanAiOutput(output) {
  if (!output || typeof output !== 'string') {
    return { clean: true }
  }

  for (const pattern of OUTPUT_RED_FLAGS) {
    if (pattern.test(output)) {
      return { clean: false, reason: `Output matched red flag: ${pattern.source.slice(0, 60)}` }
    }
  }

  return { clean: true }
}

module.exports = { sanitizeAiInput, scanAiOutput, INJECTION_PATTERNS, OUTPUT_RED_FLAGS }
