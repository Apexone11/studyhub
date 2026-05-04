/**
 * ai.service.js -- Core business logic for Hub AI.
 * Handles Claude API calls, streaming, rate-limit checks, and DB persistence.
 */

const Anthropic = require('@anthropic-ai/sdk')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { createNotification } = require('../../lib/notify')
const { buildContext, redactPII } = require('./ai.context')
const {
  DEFAULT_MODEL,
  SYSTEM_PROMPT,
  DAILY_LIMITS,
  WEEKLY_LIMITS,
  CONVERSATION_HISTORY_LIMIT,
  MAX_OUTPUT_TOKENS_QA,
  MAX_OUTPUT_TOKENS_SHEET,
} = require('./ai.constants')

// ── Anthropic client (lazy-initialized) ────────────────────────────

let _client = null
function getClient() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set.')
    }
    _client = new Anthropic.default({ apiKey })
  }
  return _client
}

// ── Rate-limit helpers ─────────────────────────────────────────────

// Single source of truth for plan + active subscription. Encapsulates the
// `currentPeriodEnd` expiry check (gift subscriptions) and the
// `past_due → free` cutoff (no more 3-week free Pro after card decline).
const { getUserPlan, isPro } = require('../../lib/getUserPlan')

/**
 * Get the daily message limit for a user.
 */
async function getDailyLimit(user) {
  if (user.role === 'admin') return DAILY_LIMITS.admin

  const userId = user.id || user.userId
  // Route through getUserPlan so the same expiry + past_due rules the rest
  // of the app uses also apply to AI quota (Copilot review #1, 2026-05-03).
  // Previously this had its own ['active','trialing','past_due'] copy and
  // skipped currentPeriodEnd, so a Pro user whose card had declined kept
  // 120/day for the entire 3-week Stripe retry chain.
  try {
    const plan = await getUserPlan(userId)
    if (isPro(plan)) return DAILY_LIMITS.pro
  } catch {
    /* graceful degradation */
  }

  // Donor status (donors get elevated limits even without an active sub)
  try {
    const donation = await prisma.donation.findFirst({
      where: { userId, status: 'completed' },
      select: { id: true },
    })
    if (donation) return DAILY_LIMITS.donor
  } catch {
    /* graceful degradation */
  }

  if (user.isStaffVerified || user.emailVerified) return DAILY_LIMITS.verified
  return DAILY_LIMITS.default
}

/**
 * Check (and return) today's usage for a user.
 * Creates the row if it does not exist yet.
 */
async function getOrCreateUsage(userId) {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  return prisma.aiUsageLog.upsert({
    where: { userId_date: { userId, date: today } },
    create: { userId, date: today, messageCount: 0, tokenCount: 0 },
    update: {},
  })
}

/**
 * Increment today's usage counters after a successful response.
 */
async function incrementUsage(userId, tokens = 0) {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  return prisma.aiUsageLog.upsert({
    where: { userId_date: { userId, date: today } },
    create: { userId, date: today, messageCount: 1, tokenCount: tokens },
    update: {
      messageCount: { increment: 1 },
      tokenCount: { increment: tokens },
    },
  })
}

// ── Phase 1: Weekly limits ─────────────────────────────────────────

/**
 * Resolve the weekly message limit for a user (same tier logic as daily).
 */
async function getWeeklyLimit(user) {
  if (user.role === 'admin') return WEEKLY_LIMITS.admin
  const userId = user.id || user.userId
  // Same getUserPlan routing as getDailyLimit — past_due no longer grants
  // Pro, and gift subs respect currentPeriodEnd (Copilot review #1).
  try {
    const plan = await getUserPlan(userId)
    if (isPro(plan)) return WEEKLY_LIMITS.pro
  } catch {
    /* graceful degradation */
  }
  try {
    const donation = await prisma.donation.findFirst({
      where: { userId, status: 'completed' },
      select: { id: true },
    })
    if (donation) return WEEKLY_LIMITS.donor
  } catch {
    /* graceful degradation */
  }
  if (user.isStaffVerified || user.emailVerified) return WEEKLY_LIMITS.verified
  return WEEKLY_LIMITS.default
}

/**
 * Sum message counts for the current ISO week (Monday 00:00 UTC → Sunday 23:59 UTC).
 */
async function getWeeklyUsage(userId) {
  const now = new Date()
  const dayOfWeek = now.getUTCDay()
  const daysSinceMonday = (dayOfWeek + 6) % 7
  const weekStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday),
  )
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)

  try {
    const result = await prisma.aiUsageLog.aggregate({
      where: {
        userId,
        date: { gte: weekStart, lt: weekEnd },
      },
      _sum: { messageCount: true },
    })
    return result._sum.messageCount || 0
  } catch {
    return 0
  }
}

/**
 * Full usage quota snapshot for the frontend. Returns:
 *   { daily: { used, limit, resetAt }, weekly: { used, limit, resetAt } }
 */
async function getUsageQuota(user) {
  const userId = user.id || user.userId

  const [dailyUsage, dailyLimit, weeklyUsed, weeklyLimit] = await Promise.all([
    getOrCreateUsage(userId),
    getDailyLimit(user),
    getWeeklyUsage(userId),
    getWeeklyLimit(user),
  ])

  // Daily reset: next midnight UTC
  const now = new Date()
  const dailyReset = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  )

  // Weekly reset: next Monday 00:00 UTC
  const dayOfWeek = now.getUTCDay()
  const daysUntilMonday = (8 - dayOfWeek) % 7 || 7
  const weeklyReset = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday),
  )

  return {
    daily: {
      used: dailyUsage.messageCount,
      limit: dailyLimit,
      remaining: Math.max(0, dailyLimit - dailyUsage.messageCount),
      resetAt: dailyReset.toISOString(),
    },
    weekly: {
      used: weeklyUsed,
      limit: weeklyLimit,
      remaining: Math.max(0, weeklyLimit - weeklyUsed),
      resetAt: weeklyReset.toISOString(),
    },
  }
}

// ── Conversation helpers ───────────────────────────────────────────

async function listConversations(userId, { limit = 30, offset = 0 } = {}) {
  const [conversations, total] = await Promise.all([
    prisma.aiConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      skip: offset,
      take: limit,
      select: {
        id: true,
        title: true,
        model: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    }),
    prisma.aiConversation.count({ where: { userId } }),
  ])
  return { conversations, total }
}

async function getConversation(id, userId) {
  return prisma.aiConversation.findFirst({
    where: { id, userId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          content: true,
          hasImage: true,
          imageDescription: true,
          tokenCount: true,
          metadata: true,
          createdAt: true,
        },
      },
    },
  })
}

async function createConversation(userId, title = null) {
  return prisma.aiConversation.create({
    data: { userId, title },
    select: { id: true, title: true, model: true, createdAt: true, updatedAt: true },
  })
}

async function deleteConversation(id, userId) {
  // Verify ownership first.
  const conv = await prisma.aiConversation.findFirst({ where: { id, userId } })
  if (!conv) return null
  await prisma.aiConversation.delete({ where: { id } })
  return conv
}

async function renameConversation(id, userId, title) {
  const conv = await prisma.aiConversation.findFirst({ where: { id, userId } })
  if (!conv) return null
  return prisma.aiConversation.update({
    where: { id },
    data: { title },
    select: { id: true, title: true },
  })
}

// ── Auto-title generation ──────────────────────────────────────────

function generateTitle(firstMessage) {
  // Take the first ~60 characters, trim at word boundary.
  const cleaned = firstMessage.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= 60) return cleaned
  return cleaned.slice(0, 57).replace(/\s+\S*$/, '') + '...'
}

const PII_STREAM_HOLD_BACK_CHARS = 128

function findSafeStreamCutoff(text) {
  if (text.length <= PII_STREAM_HOLD_BACK_CHARS) return 0

  const target = text.length - PII_STREAM_HOLD_BACK_CHARS
  for (let i = target; i >= 0; i -= 1) {
    if (/\s/.test(text[i])) return i + 1
  }

  return 0
}

function emitRedactedDelta(res, nextSafeResponse, previousSafeResponse) {
  if (!nextSafeResponse.startsWith(previousSafeResponse)) return previousSafeResponse

  const delta = nextSafeResponse.slice(previousSafeResponse.length)
  if (delta) {
    sendSSE(res, { type: 'delta', text: delta })
  }

  return nextSafeResponse
}

// ── Core: send message + stream response ───────────────────────────

/**
 * Process a user message and stream the AI response via SSE.
 *
 * @param {object} params
 * @param {object} params.user        - Authenticated user record (id, role, etc.)
 * @param {number} params.conversationId
 * @param {string} params.content     - User message text.
 * @param {string} [params.currentPage] - Current frontend URL path.
 * @param {Array}  [params.images]    - Array of { base64, mediaType } image objects.
 * @param {object} params.res         - Express response object (for SSE).
 */
async function streamMessage({ user, conversationId, content, currentPage, images, res, signal }) {
  const userId = user.id || user.userId
  const safeContent = redactPII(content)

  // 1. Verify conversation ownership.
  const conversation = await prisma.aiConversation.findFirst({
    where: { id: conversationId, userId },
  })
  if (!conversation) {
    sendSSE(res, { type: 'error', message: 'Conversation not found.' })
    res.end()
    return
  }

  // 2. Check daily rate limit.
  const usage = await getOrCreateUsage(userId)
  const limit = await getDailyLimit(user)
  if (usage.messageCount >= limit) {
    // Persist a once-per-day inbox record so a user who runs out mid-flow
    // has a durable signal + upgrade path, not just an SSE toast that
    // disappears on reload. Deduped by UTC date so multiple hits in the
    // same day collapse to one notification.
    const today = new Date().toISOString().slice(0, 10)
    createNotification(prisma, {
      userId,
      type: 'ai_quota_reached',
      message: `You've used all ${limit} AI messages today. Upgrade to Pro for 4× the daily quota, or come back tomorrow.`,
      linkPath: '/pricing',
      priority: 'medium',
      dedupKey: `ai_quota_reached:${userId}:daily:${today}`,
    }).catch(() => {})
    sendSSE(res, {
      type: 'error',
      message: `Daily limit reached (${limit} messages). Resets at midnight UTC.`,
      code: 'RATE_LIMITED',
    })
    res.end()
    return
  }

  // 2b. Phase 1: Check weekly rate limit.
  const weeklyUsed = await getWeeklyUsage(userId)
  const weeklyLimit = await getWeeklyLimit(user)
  if (weeklyUsed >= weeklyLimit) {
    const now = new Date()
    const dayOfWeek = now.getUTCDay()
    const daysUntilMonday = (8 - dayOfWeek) % 7 || 7
    // Once-per-week inbox record. True ISO 8601 week label so the dedup
    // key rolls over on Monday and handles the year-boundary edge case
    // (2026-01-01 is ISO 2025-W53, etc.). Algorithm: take the Thursday of
    // the current week (ISO weeks are anchored on Thursday), then count
    // weeks from the first Thursday of that Thursday's year.
    function isoWeekLabel(d) {
      const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
      // Shift to Thursday of the current ISO week (ISO day 1=Mon..7=Sun).
      const isoDay = dt.getUTCDay() || 7
      dt.setUTCDate(dt.getUTCDate() + 4 - isoDay)
      const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1))
      const week = Math.ceil(((dt - yearStart) / 86400000 + 1) / 7)
      return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
    }
    const isoWeek = isoWeekLabel(now)
    createNotification(prisma, {
      userId,
      type: 'ai_quota_reached',
      message: `You've reached your weekly AI limit (${weeklyLimit} messages). Resets in ${daysUntilMonday} day${daysUntilMonday !== 1 ? 's' : ''}. Upgrade to Pro for a higher cap.`,
      linkPath: '/pricing',
      priority: 'medium',
      dedupKey: `ai_quota_reached:${userId}:weekly:${isoWeek}`,
    }).catch(() => {})
    sendSSE(res, {
      type: 'error',
      message: `Weekly limit reached (${weeklyLimit} messages). Resets in ${daysUntilMonday} day${daysUntilMonday !== 1 ? 's' : ''}.`,
      code: 'RATE_LIMITED',
    })
    res.end()
    return
  }

  // Phase 5: AI input sanitization — scan for prompt injection patterns
  // before saving or sending to Claude. We still save the message (for
  // audit) and let Claude handle the response (it will politely decline),
  // but we flag the interaction for security review.
  try {
    const { sanitizeAiInput } = require('./ai.inputSanitizer')
    const scan = sanitizeAiInput(content)
    if (scan.flagged) {
      captureError(new Error(`AI prompt injection attempt: ${scan.reason}`), {
        userId,
        conversationId,
        contentPreview: safeContent.slice(0, 200),
      })
    }
  } catch {
    // Sanitizer not available — degrade gracefully
  }

  // 3. Save user message to DB immediately.
  const hasImg = !!(images && images.length > 0)
  await prisma.aiMessage.create({
    data: {
      conversation: { connect: { id: conversationId } },
      user: userId ? { connect: { id: userId } } : undefined,
      role: 'user',
      content: safeContent,
      hasImage: hasImg,
      imageDescription: hasImg ? `${images.length} image(s) uploaded` : null,
    },
  })

  // Achievements V2 — fire ai.message so ai-curious / ai-power-user criteria
  // can match. Fire-and-forget; failures never affect the streaming response.
  if (userId) {
    try {
      const { emitAchievementEvent, EVENT_KINDS } = require('../achievements')
      void emitAchievementEvent(prisma, userId, EVENT_KINDS.AI_MESSAGE, { conversationId })
    } catch {
      /* best effort */
    }
  }

  // 4. Auto-title the conversation if this is the first message.
  const messageCount = await prisma.aiMessage.count({ where: { conversationId } })
  if (messageCount === 1 && !conversation.title) {
    const autoTitle = generateTitle(safeContent)
    await prisma.aiConversation.update({
      where: { id: conversationId },
      data: { title: autoTitle },
    })
    sendSSE(res, { type: 'title', title: autoTitle })
  }

  // 5. Build context and conversation history for Claude.
  const contextBlock = await buildContext(userId, { currentPage })
  // Decision #17 requires PII to be stripped at the model boundary;
  // context can include note/sheet titles that users typed months ago.
  const fullSystemPrompt = redactPII(SYSTEM_PROMPT + contextBlock)

  // Fetch the most recent conversation history (descending, then reverse
  // to chronological order). This ensures we always send the latest context
  // window to Claude once a conversation exceeds the history limit.
  const historyDesc = await prisma.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: CONVERSATION_HISTORY_LIMIT,
    select: { role: true, content: true },
  })
  const history = historyDesc.reverse()

  // Build the messages array for Claude (the just-saved user message
  // is already included in `history`).
  const claudeMessages = history.map((msg) => ({
    role: msg.role,
    content: redactPII(msg.content),
  }))

  // If images were uploaded, replace the last user message content with
  // a multi-part content block (text + images).
  if (images && images.length > 0) {
    const lastIdx = claudeMessages.length - 1
    const contentParts = [{ type: 'text', text: safeContent }]
    for (const img of images) {
      contentParts.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
      })
    }
    claudeMessages[lastIdx].content = contentParts
  }

  // Determine max output tokens based on whether the user is asking for a sheet.
  const isSheetRequest =
    /\b(create|make|generate|build|write|design)\b.*\b(sheet|cheatsheet|cheat sheet|study guide|reference sheet|review sheet|formula sheet)\b/i.test(
      safeContent,
    )
  const maxTokens = isSheetRequest ? MAX_OUTPUT_TOKENS_SHEET : MAX_OUTPUT_TOKENS_QA

  // 6. Stream from Claude.
  let fullResponse = ''
  let safeResponse = ''
  let streamedRawLength = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let wasTruncated = false

  const ttftStart = performance.now()
  let ttftMs = null

  try {
    const client = getClient()
    const stream = await client.messages.stream({
      model: conversation.model || DEFAULT_MODEL,
      max_tokens: maxTokens,
      system: fullSystemPrompt,
      messages: claudeMessages,
    })

    let aborted = false
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          aborted = true
          stream.abort()
        },
        { once: true },
      )
    }

    for await (const event of stream) {
      if (aborted) break
      if (event.type === 'content_block_delta' && event.delta?.text) {
        if (ttftMs === null) {
          ttftMs = Math.round(performance.now() - ttftStart)
        }
        fullResponse += event.delta.text
        const safeRawLength = findSafeStreamCutoff(fullResponse)
        if (safeRawLength > streamedRawLength) {
          safeResponse = emitRedactedDelta(
            res,
            redactPII(fullResponse.slice(0, safeRawLength)),
            safeResponse,
          )
          streamedRawLength = safeRawLength
        }
      }
    }

    // If the client disconnected mid-stream, skip persistence and usage tracking.
    if (aborted) {
      safeResponse = redactPII(fullResponse)
      // Still save whatever partial response we got so the conversation stays coherent.
      if (safeResponse) {
        await prisma.aiMessage.create({
          data: {
            conversation: { connect: { id: conversationId } },
            role: 'assistant',
            content: safeResponse,
            model: conversation.model || DEFAULT_MODEL,
            metadata: { partial: true },
          },
        })
      }
      return
    }

    // Collect usage from the final message.
    const finalMessage = await stream.finalMessage()
    totalInputTokens = finalMessage?.usage?.input_tokens || 0
    totalOutputTokens = finalMessage?.usage?.output_tokens || 0

    // Detect truncation: Claude stopped because it hit the token limit.
    if (finalMessage?.stop_reason === 'max_tokens') {
      wasTruncated = true
      sendSSE(res, { type: 'truncated' })
    }

    safeResponse = redactPII(fullResponse)
    emitRedactedDelta(res, safeResponse, redactPII(fullResponse.slice(0, streamedRawLength)))
  } catch (err) {
    // Abort errors from client disconnect are expected; don't report them.
    if (signal?.aborted) return
    captureError(err, { tags: { module: 'ai' } })
    sendSSE(res, {
      type: 'error',
      message: 'AI service temporarily unavailable. Please try again.',
    })
    res.end()
    return
  }

  // 7. Save assistant response.
  const totalTokens = totalInputTokens + totalOutputTokens
  const msgMetadata =
    isSheetRequest || wasTruncated
      ? {
          ...(isSheetRequest ? { sheetGeneration: true } : {}),
          ...(wasTruncated ? { truncated: true } : {}),
        }
      : undefined
  const assistantMsg = await prisma.aiMessage.create({
    data: {
      conversation: { connect: { id: conversationId } },
      role: 'assistant',
      content: safeResponse,
      tokenCount: totalTokens,
      model: conversation.model || DEFAULT_MODEL,
      metadata: msgMetadata,
    },
  })

  // Update conversation timestamp.
  await prisma.aiConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  })

  // 8. Increment usage.
  await incrementUsage(userId, totalTokens)

  // 9. Send completion event.
  sendSSE(res, {
    type: 'done',
    messageId: assistantMsg.id,
    tokenCount: totalTokens,
    usage: { used: usage.messageCount + 1, limit },
  })

  // Track AI streaming time-to-first-token for observability.
  if (ttftMs !== null) {
    const { EVENTS, trackServerEvent } = require('../../lib/events')
    trackServerEvent(userId, EVENTS.AI_STREAM_TTFT, {
      msToFirstToken: ttftMs,
      model: conversation.model || DEFAULT_MODEL,
      promptTokens: totalInputTokens,
    })
  }

  res.end()
}

// ── SSE helper ─────────────────────────────────────────────────────

function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
  // `compression()` injects a `flush()` method onto the response when it
  // wraps it; calling it forces the gzip buffer (or the OS socket buffer
  // when compression is bypassed for SSE) to drain immediately so the
  // delta arrives at the client without waiting for a 16 KB chunk fill.
  if (typeof res.flush === 'function') res.flush()
}

// ── Usage stats ────────────────────────────────────────────────────

async function getUsageStats(user) {
  const userId = user.id || user.userId
  const usage = await getOrCreateUsage(userId)
  const limit = await getDailyLimit(user)
  return {
    messagesUsed: usage.messageCount,
    messagesLimit: limit,
    messagesRemaining: Math.max(0, limit - usage.messageCount),
    tokensUsed: usage.tokenCount,
    resetsAt: getNextMidnightUTC(),
  }
}

function getNextMidnightUTC() {
  const now = new Date()
  const next = new Date(now)
  next.setUTCDate(next.getUTCDate() + 1)
  next.setUTCHours(0, 0, 0, 0)
  return next.toISOString()
}

module.exports = {
  listConversations,
  getConversation,
  createConversation,
  deleteConversation,
  renameConversation,
  streamMessage,
  getUsageStats,
  getUsageQuota,
  getDailyLimit,
  getWeeklyLimit,
  getOrCreateUsage,
  getWeeklyUsage,
  // Phase 3 — exposed so ai.suggestions.service can share the same
  // Anthropic client + daily-usage counter as the chat surface.
  // Quota aggregation is by design: a user who burned today's budget
  // in Hub AI must see "quota exhausted" on the suggestion card too.
  getClient,
  incrementUsage,
}
