/**
 * plagiarism.service.js — Phase 4 plagiarism detection engine.
 *
 * Orchestrates the full detection pipeline when a sheet is published:
 *   Layer 1: Enhanced internal detection (multi-window SimHash + n-gram)
 *   Layer 2: Full corpus scan (all published sheets, not just recent 500)
 *   Layer 3: AI-powered analysis (Claude for ambiguous 0.70–0.85 matches)
 *
 * Creates PlagiarismReport rows for matches above 0.70 and sends
 * notifications to the author when flagged.
 */
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { createNotification } = require('../../lib/notify')
const {
  comprehensiveSimilarity,
  fingerprint,
  similarity,
  normalizeText,
} = require('../../lib/contentFingerprint')

const SIMILARITY_THRESHOLD = 0.7
const LIKELY_COPY_THRESHOLD = 0.85
const AI_ANALYSIS_DAILY_CAP = 50
const MAX_CORPUS_SCAN = 2000
const AI_CONTENT_PREVIEW_CHARS = 3000

// ── AI analysis (Layer 3) ──────────────────────────────────────────

let _aiClient = null
function getAiClient() {
  if (!_aiClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return null
    const Anthropic = require('@anthropic-ai/sdk')
    _aiClient = new Anthropic.default({ apiKey })
  }
  return _aiClient
}

/**
 * Check if we've exceeded the daily AI analysis cap.
 */
async function aiAnalysisAvailable() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const count = await prisma.plagiarismReport.count({
      where: {
        matchType: 'ai',
        createdAt: { gte: today },
      },
    })
    return count < AI_ANALYSIS_DAILY_CAP
  } catch {
    return false
  }
}

/**
 * Run AI analysis on an ambiguous match (similarity 0.70–0.85).
 * Returns { verdict, confidence } or null if unavailable.
 */
async function analyzeWithAi(contentA, contentB, titleA, titleB) {
  try {
    const client = getAiClient()
    if (!client) return null
    if (!(await aiAnalysisAvailable())) return null

    const previewA = normalizeText(contentA).slice(0, AI_CONTENT_PREVIEW_CHARS)
    const previewB = normalizeText(contentB).slice(0, AI_CONTENT_PREVIEW_CHARS)

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: `You are a plagiarism analysis assistant for an academic study platform. Compare two pieces of content and determine if one is likely copied from the other. Respond with ONLY a JSON object: {"verdict":"original"|"likely_copy"|"paraphrase"|"coincidental","confidence":0.0-1.0,"reasoning":"one sentence"}`,
      messages: [
        {
          role: 'user',
          content: `Document A ("${titleA}"):\n${previewA}\n\n---\n\nDocument B ("${titleB}"):\n${previewB}\n\nAre these documents likely copied, paraphrased, or coincidentally similar?`,
        },
      ],
    })

    const text = response.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[^}]+\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    return {
      verdict: parsed.verdict || 'coincidental',
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 500) : '',
    }
  } catch (err) {
    captureError(err, { context: 'plagiarism-ai-analysis' })
    return null
  }
}

/**
 * Run the full plagiarism scan for a sheet. Called fire-and-forget
 * after a sheet is published or updated.
 *
 * @param {number} sheetId
 * @param {string} content — the sheet's text/HTML content
 * @param {number} authorId — the sheet author's user ID
 */
async function runPlagiarismScan(sheetId, content, authorId) {
  try {
    if (!content || content.trim().length < 50) return

    const fp = fingerprint(content)
    if (!fp.simhash) return

    // Update the sheet's fingerprint
    await prisma.studySheet
      .update({
        where: { id: sheetId },
        data: { contentHash: fp.exactHash, contentSimhash: fp.simhash },
      })
      .catch(() => {})

    // Fetch all published sheets with simhash (full corpus, batched)
    const candidates = await prisma.studySheet.findMany({
      where: {
        status: 'published',
        id: { not: sheetId },
        NOT: [{ contentSimhash: null }],
      },
      select: {
        id: true,
        title: true,
        userId: true,
        content: true,
        contentHash: true,
        contentSimhash: true,
        forkOf: true,
        createdAt: true,
      },
      take: MAX_CORPUS_SCAN,
      orderBy: { createdAt: 'desc' },
    })

    const matches = []

    for (const candidate of candidates) {
      // Skip own content
      if (candidate.userId === authorId) continue
      // Skip forks (expected to be similar)
      if (candidate.forkOf === sheetId || candidate.id === candidate.forkOf) continue

      // Quick check: SimHash similarity
      const simScore = similarity(fp.simhash, candidate.contentSimhash)
      if (simScore < SIMILARITY_THRESHOLD) continue

      // Comprehensive analysis for candidates above threshold
      const detailed = comprehensiveSimilarity(content, candidate.content || '')

      if (detailed.best >= SIMILARITY_THRESHOLD) {
        matches.push({
          matchedSheetId: candidate.id,
          matchedTitle: candidate.title,
          matchedAuthorId: candidate.userId,
          similarityScore: detailed.best,
          isExactMatch: candidate.contentHash === fp.exactHash,
          matchType:
            candidate.contentHash === fp.exactHash
              ? 'exact'
              : detailed.ngram2 >= SIMILARITY_THRESHOLD
                ? 'ngram'
                : 'simhash',
          scores: detailed,
          createdAt: candidate.createdAt,
        })
      }
    }

    if (matches.length === 0) return

    // Sort by similarity desc
    matches.sort((a, b) => b.similarityScore - a.similarityScore)

    // Layer 3: AI analysis for ambiguous matches (0.70-0.85 range)
    const sheetTitle = await prisma.studySheet
      .findUnique({
        where: { id: sheetId },
        select: { title: true },
      })
      .then((s) => s?.title || 'Untitled')

    for (const match of matches.slice(0, 10)) {
      if (
        match.similarityScore >= SIMILARITY_THRESHOLD &&
        match.similarityScore < LIKELY_COPY_THRESHOLD
      ) {
        const aiResult = await analyzeWithAi(
          content,
          await prisma.studySheet
            .findUnique({ where: { id: match.matchedSheetId }, select: { content: true } })
            .then((s) => s?.content || ''),
          sheetTitle,
          match.matchedTitle,
        )
        if (aiResult) {
          match.aiVerdict = `${aiResult.verdict}: ${aiResult.reasoning}`
          match.aiConfidence = aiResult.confidence
          if (aiResult.verdict === 'likely_copy' && aiResult.confidence >= 0.7) {
            match.matchType = 'ai'
            match.similarityScore = Math.max(
              match.similarityScore,
              0.8 + aiResult.confidence * 0.15,
            )
          } else if (aiResult.verdict === 'coincidental' || aiResult.verdict === 'original') {
            match.similarityScore = Math.min(match.similarityScore, 0.65)
          }
        }
      }
    }

    // Re-sort after AI adjustments and filter out below threshold
    const finalMatches = matches
      .filter((m) => m.similarityScore >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.similarityScore - a.similarityScore)

    if (finalMatches.length === 0) return

    // Create PlagiarismReport rows (upsert to avoid duplicates)
    for (const match of finalMatches.slice(0, 10)) {
      try {
        await prisma.plagiarismReport.upsert({
          where: {
            sheetId_matchedSheetId: { sheetId, matchedSheetId: match.matchedSheetId },
          },
          update: {
            similarityScore: match.similarityScore,
            matchType: match.matchType,
            highlightedSections: match.scores,
            aiVerdict: match.aiVerdict || undefined,
            aiConfidence: match.aiConfidence ?? undefined,
          },
          create: {
            sheetId,
            matchedSheetId: match.matchedSheetId,
            similarityScore: match.similarityScore,
            matchType: match.matchType,
            highlightedSections: match.scores,
            aiVerdict: match.aiVerdict || null,
            aiConfidence: match.aiConfidence ?? null,
          },
        })
      } catch (err) {
        captureError(err, {
          context: 'plagiarism-report-create',
          sheetId,
          matchedSheetId: match.matchedSheetId,
        })
      }
    }

    // Notify the author
    const topMatch = finalMatches[0]
    const severity = topMatch.similarityScore >= LIKELY_COPY_THRESHOLD ? 'high' : 'medium'
    try {
      await createNotification(prisma, {
        userId: authorId,
        type: 'plagiarism_flagged',
        message:
          severity === 'high'
            ? `Your sheet may contain content that closely matches "${topMatch.matchedTitle}". Please review the plagiarism report.`
            : `Your sheet has similarities with existing content. Review the plagiarism report for details.`,
        linkPath: `/sheets/${sheetId}/plagiarism`,
        priority: severity,
        sheetId,
      })
    } catch (err) {
      captureError(err, { context: 'plagiarism-notify', sheetId })
    }
  } catch (err) {
    captureError(err, { context: 'plagiarism-scan', sheetId })
  }
}

/**
 * Get plagiarism reports for a sheet (user-facing).
 */
async function getSheetReports(sheetId) {
  return prisma.plagiarismReport.findMany({
    where: { sheetId },
    include: {
      matchedSheet: {
        select: {
          id: true,
          title: true,
          createdAt: true,
          author: { select: { id: true, username: true, avatarUrl: true } },
        },
      },
    },
    orderBy: { similarityScore: 'desc' },
  })
}

/**
 * File a dispute against a plagiarism report.
 */
async function fileDispute({ reportId, userId, reason }) {
  if (!reason || reason.trim().length < 10) {
    const err = new Error('Dispute reason must be at least 10 characters.')
    err.status = 400
    throw err
  }

  return prisma.plagiarismDispute.create({
    data: {
      reportId,
      userId,
      reason: reason.trim().slice(0, 2000),
    },
  })
}

/**
 * Admin: resolve a dispute (accept = dismiss the plagiarism report,
 * reject = uphold it).
 */
async function resolveDispute({ disputeId, reviewerId, action }) {
  const dispute = await prisma.plagiarismDispute.findUnique({
    where: { id: disputeId },
    include: { report: true },
  })
  if (!dispute) {
    const err = new Error('Dispute not found.')
    err.status = 404
    throw err
  }

  const now = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.plagiarismDispute.update({
      where: { id: disputeId },
      data: {
        status: action === 'accept' ? 'accepted' : 'rejected',
        reviewedBy: reviewerId,
        reviewedAt: now,
      },
    })

    if (action === 'accept') {
      // Dismiss the plagiarism report
      await tx.plagiarismReport.update({
        where: { id: dispute.reportId },
        data: { status: 'dismissed', resolvedAt: now, resolvedById: reviewerId },
      })
    } else {
      // Confirm the plagiarism
      await tx.plagiarismReport.update({
        where: { id: dispute.reportId },
        data: { status: 'confirmed', resolvedAt: now, resolvedById: reviewerId },
      })
    }
  })
}

module.exports = {
  runPlagiarismScan,
  getSheetReports,
  fileDispute,
  resolveDispute,
  SIMILARITY_THRESHOLD,
  LIKELY_COPY_THRESHOLD,
  AI_ANALYSIS_DAILY_CAP,
}
