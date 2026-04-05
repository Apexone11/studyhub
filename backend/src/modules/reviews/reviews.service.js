/**
 * reviews.service.js -- AI-powered review analysis.
 * Collects user reviews from a period, sends to Claude for analysis,
 * and stores the resulting ReviewReport.
 */

const Anthropic = require('@anthropic-ai/sdk')
const prisma = require('../../lib/prisma')
// ── Anthropic client (lazy-initialized, shared with ai.service) ───

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

const ANALYSIS_MODEL = 'claude-sonnet-4-20250514'

/**
 * Generate a weekly review report.
 * Collects all reviews from the past `days` days, sends them to Claude
 * for analysis, and stores the result as a ReviewReport.
 *
 * @param {object} options
 * @param {number} [options.days=7] - Number of days to look back.
 * @param {number} [options.adminUserId] - Admin who triggered the report.
 * @returns {Promise<object>} The created ReviewReport record.
 */
async function generateReviewReport({ days = 7, adminUserId } = {}) {
  const periodEnd = new Date()
  const periodStart = new Date()
  periodStart.setDate(periodStart.getDate() - days)

  // Fetch all reviews in the period (any status, for full picture)
  const reviews = await prisma.userReview.findMany({
    where: {
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    include: {
      user: {
        select: { username: true, accountType: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (reviews.length === 0) {
    throw new Error('No reviews found in the specified period.')
  }

  // Calculate average stars
  const totalStars = reviews.reduce((sum, r) => sum + r.stars, 0)
  const averageStars = Math.round((totalStars / reviews.length) * 100) / 100

  // Build the prompt for Claude
  const reviewsText = reviews
    .map((r, i) => {
      const role = r.user?.accountType || 'student'
      return `Review #${i + 1} (${r.stars}/5 stars, ${r.status}, by ${role}):\n"${r.text}"`
    })
    .join('\n\n')

  const starDistribution = [1, 2, 3, 4, 5].map((s) => {
    const count = reviews.filter((r) => r.stars === s).length
    return `${s} star: ${count}`
  }).join(', ')

  const prompt = `You are an analytics assistant for StudyHub, a collaborative study platform for college students. Analyze the following ${reviews.length} user reviews from the past ${days} days and provide actionable insights for the platform administrators.

Review Period: ${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}
Total Reviews: ${reviews.length}
Average Rating: ${averageStars}/5
Star Distribution: ${starDistribution}
Status Breakdown: ${reviews.filter((r) => r.status === 'approved').length} approved, ${reviews.filter((r) => r.status === 'pending').length} pending, ${reviews.filter((r) => r.status === 'rejected').length} rejected

Reviews:
${reviewsText}

Respond in the following JSON format exactly (no markdown, no code blocks, just raw JSON):
{
  "strengths": ["strength 1", "strength 2", ...],
  "weaknesses": ["weakness 1", "weakness 2", ...],
  "improvements": ["actionable improvement 1", "actionable improvement 2", ...],
  "summary": "A 2-3 paragraph executive summary of the overall sentiment, key themes, and priority areas for the StudyHub team."
}

Guidelines:
- Strengths: What users consistently praise. Be specific (e.g., "Course organization and sheet discovery" not just "good platform").
- Weaknesses: What users complain about or rate poorly. Even in positive reviews, note any friction mentioned.
- Improvements: Concrete, actionable steps the team can take. Prioritize by impact.
- Summary: Include overall sentiment trend, most common themes, and 1-2 priority recommendations.
- Keep each list to 3-7 items. Quality over quantity.`

  const client = getClient()
  const response = await client.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawAnalysis = response.content[0]?.text || ''

  // Parse the JSON response from Claude
  let parsed
  try {
    // Strip any markdown code fences if present
    const cleaned = rawAnalysis.replace(/^```(?:json)?\n?/gm, '').replace(/\n?```$/gm, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    // If parsing fails, store raw text with fallback structure
    parsed = {
      strengths: ['Analysis generated but could not be parsed into structured format.'],
      weaknesses: [],
      improvements: [],
      summary: rawAnalysis,
    }
  }

  // Store the report
  const report = await prisma.reviewReport.create({
    data: {
      periodStart,
      periodEnd,
      reviewCount: reviews.length,
      averageStars,
      strengths: JSON.stringify(parsed.strengths || []),
      weaknesses: JSON.stringify(parsed.weaknesses || []),
      improvements: JSON.stringify(parsed.improvements || []),
      rawAnalysis: parsed.summary || rawAnalysis,
      generatedBy: adminUserId || null,
    },
  })

  return report
}

/**
 * List all review reports, newest first.
 */
async function listReviewReports({ limit = 10, page = 1 } = {}) {
  const skip = (page - 1) * limit
  const [reports, total] = await Promise.all([
    prisma.reviewReport.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        generatedByUser: {
          select: { id: true, username: true },
        },
      },
    }),
    prisma.reviewReport.count(),
  ])

  return { reports, total, page, limit, totalPages: Math.ceil(total / limit) }
}

/**
 * Get a single review report by ID.
 */
async function getReviewReport(id) {
  return prisma.reviewReport.findUnique({
    where: { id },
    include: {
      generatedByUser: {
        select: { id: true, username: true },
      },
    },
  })
}

module.exports = {
  generateReviewReport,
  listReviewReports,
  getReviewReport,
}
