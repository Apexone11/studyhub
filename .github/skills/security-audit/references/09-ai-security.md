# Reference 09 — AI Security (Hub AI)

## Files to Read

- `backend/src/modules/ai/ai.service.js` — quota, PII, HMAC, streaming
- `backend/src/modules/ai/ai.constants.js` — system prompt, model, max tokens
- `backend/src/modules/ai/ai.context.js` — context builder
- `backend/src/modules/ai/ai.routes.js` — rate limiters, auth
- `frontend/studyhub-app/src/lib/aiService.js` — client-side calls
- `frontend/studyhub-app/src/lib/useAiChat.js` — SSE streaming

---

## Check 9.1 — AI PII Redaction (Decision #17 — OPEN GAP)

**Rule (LOCKED):** Strip emails and phone numbers from BOTH the input sent to Anthropic AND the output returned from Anthropic.

**Status: NOT IMPLEMENTED — HIGH severity open gap.**

**Required implementation:**

```js
// Strip before sending to Claude
const PII_REGEX = /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}|(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g
function redactPii(text) {
  return text.replace(PII_REGEX, '[REDACTED]')
}

// In ai.service.js, before API call:
const cleanUserMessage = redactPii(userMessage)
const response = await anthropic.messages.create({ ..., messages: [{ role: 'user', content: cleanUserMessage }] })

// After API response:
const cleanResponse = redactPii(response.content[0].text)
```

**Grep to verify implementation exists:**

```
redactPii\|stripPii\|REDACTED.*email\|piiRegex
```

If absent → HIGH finding.

---

## Check 9.2 — HMAC on AI Suggestions (Decision #18 — OPEN GAP)

**Rule (LOCKED):** AI-generated sheet suggestions should include an HMAC to prevent tampering between generation and publish.

**Status: NOT IMPLEMENTED — MEDIUM severity open gap.**

**Purpose:** Ensures that what gets published was what the AI actually generated (not tampered with in transit or in localStorage).

**Required implementation:**

```js
// Server generates:
import { createHmac } from 'crypto'
const hmac = createHmac('sha256', process.env.AI_HMAC_SECRET).update(generatedContent).digest('hex')
// Return { content: generatedContent, hmac }

// Server verifies on publish:
const expected = createHmac('sha256', process.env.AI_HMAC_SECRET)
  .update(submittedContent)
  .digest('hex')
if (!timingSafeEqual(Buffer.from(expected), Buffer.from(submitted.hmac))) {
  return sendError(res, 400, 'AI content integrity check failed', ERROR_CODES.BAD_REQUEST)
}
```

---

## Check 9.3 — AI Quota Enforcement Per Plan Tier

**Rule per CLAUDE.md:** Daily quota limits by plan:

- Free: 30 messages/day
- Verified: 60 messages/day
- Pro: 120 messages/day
- Admin: 120 messages/day

**Verify in `ai.service.js`:**

1. `AiUsageLog` is queried on each request to count today's usage.
2. `getUserPlan()` correctly maps user to one of the four tiers.
3. Quota is checked BEFORE calling Anthropic API (not after).
4. Quota increments happen AFTER successful response.

**Grep:**

```
aiCallsPerDay\|dailyQuota\|AiUsageLog.*count\|getUserPlan
```

---

## Check 9.4 — AI Quota Shared Across All AI Features

**Rule per CLAUDE.md:** The global per-user `aiCallsPerDay` counter is the hard ceiling. ALL AI surfaces share it:

- Hub AI Q&A
- Hub AI sheet generation
- Note Review summarization
- AI suggestion edits

**Violation:** A separate per-endpoint counter that doesn't roll into the global quota.

**Verify:** `AiUsageLog` is the single table for all AI call tracking. No endpoint has its own separate counter that bypasses it.

---

## Check 9.5 — SSE Stream Authentication

**Rule:** The SSE endpoint (`POST /api/ai/messages`) must apply `requireAuth` middleware. An unauthenticated SSE connection that reaches Anthropic would be a free AI proxy.

**Verify in `ai.routes.js`:**

```js
router.post('/messages', requireAuth, aiMessageLimiter, aiController.streamMessage)
```

---

## Check 9.6 — No `<script>` in AI-Generated HTML

**Rule per CLAUDE.md:** The AI system prompt instructs Claude to NEVER include `<script>` tags. But the server MUST also enforce this via the scan pipeline (Tier 1+ for scripts).

**Verify:** Sheet generation endpoint passes generated HTML through `classifyHtmlRisk` before storing. A `<script>` in AI output should result in at least Tier 1 (warning) or Tier 2 (admin review) depending on context.

---

## Check 9.7 — API Key Never in Frontend Code

**Rule:** `ANTHROPIC_API_KEY` must NEVER appear in frontend code or be served via any public endpoint.

**Grep (frontend directory):**

```
ANTHROPIC\|anthropic.*key\|claude.*api.*key
```

Any match → CRITICAL.

**Verify in `ai.routes.js`:** All API calls to Anthropic happen server-side only.

---

## Severity Reference for AI Security Issues

| Issue                                     | OWASP | Severity |
| ----------------------------------------- | ----- | -------- |
| Anthropic API key in frontend             | A02   | CRITICAL |
| SSE endpoint without `requireAuth`        | A01   | CRITICAL |
| No PII redaction on AI input/output       | A02   | HIGH     |
| AI-generated sheet bypasses scan pipeline | A03   | HIGH     |
| Quota not shared across AI features       | A05   | MEDIUM   |
| No HMAC on AI suggestions                 | A08   | MEDIUM   |
| Quota not checked before API call         | A05   | LOW      |
