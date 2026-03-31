const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { findSimilarSheets, runPlagiarismScan } = require('../../lib/plagiarism')

const router = express.Router()

/* Rate limiting: full scan is expensive, limit to once per minute */
const scanLimiter = new Map()
function checkScanRate() {
  const now = Date.now()
  const lastScan = scanLimiter.get('lastFullScan') || 0
  const timeSinceLastScan = now - lastScan
  if (timeSinceLastScan < 60000) { // 60 seconds
    return { allowed: false, retryAfter: Math.ceil((60000 - timeSinceLastScan) / 1000) }
  }
  scanLimiter.set('lastFullScan', now)
  return { allowed: true }
}

/* ── GET /api/admin/plagiarism/check/:sheetId ────────────────────────────
   Find sheets with similar content to a specific sheet
 */
router.get('/plagiarism/check/:sheetId', async (req, res) => {
  const sheetId = Number.parseInt(req.params.sheetId, 10)
  const threshold = req.query.threshold ? Number.parseInt(req.query.threshold, 10) : 10

  if (!Number.isInteger(sheetId) || sheetId <= 0) {
    return res.status(400).json({ error: 'Invalid sheet ID.' })
  }

  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 64) {
    return res.status(400).json({ error: 'Threshold must be between 0 and 64.' })
  }

  try {
    /* Verify sheet exists */
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        title: true,
        userId: true,
        contentSimhash: true,
        author: { select: { id: true, username: true } },
      },
    })

    if (!sheet) {
      return res.status(404).json({ error: 'Sheet not found.' })
    }

    if (!sheet.contentSimhash) {
      return res.status(400).json({ error: 'Sheet has no fingerprint. It may have been created before plagiarism detection was enabled.' })
    }

    /* Find similar sheets */
    const similarSheets = await findSimilarSheets(sheetId, threshold)

    res.json({
      sheet: {
        id: sheet.id,
        title: sheet.title,
        author: sheet.author?.username || 'Unknown',
        contentSimhash: sheet.contentSimhash,
      },
      threshold,
      matchCount: similarSheets.length,
      matches: similarSheets.slice(0, 50), // limit to 50 results
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* ── GET /api/admin/plagiarism/scan ──────────────────────────────────────
   Run full plagiarism scan across all published sheets
   Rate limited to once per minute (expensive operation)
 */
router.get('/plagiarism/scan', async (req, res) => {
  const threshold = req.query.threshold ? Number.parseInt(req.query.threshold, 10) : 10

  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 64) {
    return res.status(400).json({ error: 'Threshold must be between 0 and 64.' })
  }

  /* Rate limiting check */
  const rateCheck = checkScanRate()
  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: `Full scan rate limited. Try again in ${rateCheck.retryAfter} seconds.`,
      retryAfter: rateCheck.retryAfter,
    })
  }

  try {
    /* Count total published sheets with fingerprints */
    const totalSheets = await prisma.studySheet.count({
      where: {
        status: 'published',
        contentSimhash: { not: null },
      },
    })

    /* Run scan */
    const clusters = await runPlagiarismScan(threshold)

    /* Calculate summary stats */
    const stats = {
      totalSheetsScanned: totalSheets,
      clustersFound: clusters.length,
      sheetsInClusters: clusters.reduce((sum, c) => sum + c.clusterSize, 0),
      avgClusterSize: clusters.length > 0
        ? Math.round((clusters.reduce((sum, c) => sum + c.clusterSize, 0) / clusters.length) * 100) / 100
        : 0,
      threshold,
      scanTimestamp: new Date().toISOString(),
    }

    res.json({
      stats,
      topClusters: clusters.slice(0, 20), // Return top 20 clusters
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* ── GET /api/admin/plagiarism/stats ─────────────────────────────────────
   Return plagiarism scan statistics
   Aggregates data from previous scans to give quick overview
 */
router.get('/plagiarism/stats', async (req, res) => {
  try {
    /* Count sheets by status and fingerprint coverage */
    const [
      publishedWithFingerprint,
      publishedTotal,
      moderationCasesCount,
    ] = await Promise.all([
      prisma.studySheet.count({
        where: {
          status: 'published',
          contentSimhash: { not: null },
        },
      }),
      prisma.studySheet.count({
        where: { status: 'published' },
      }),
      prisma.moderationCase.count({
        where: { source: 'plagiarism' },
      }),
    ])

    /* Find top similar pairs (sheets with exact hash matches) */
    const exactMatches = await prisma.studySheet.groupBy({
      by: ['contentHash'],
      where: {
        status: 'published',
        contentHash: { not: null },
        NOT: { contentHash: '' },
      },
      _count: true,
      having: { _count: { gt: 1 } },
      orderBy: { _count: { descending: true } },
      take: 10,
    })

    /* Map back to actual sheets for display */
    const topExactPairs = []
    for (const match of exactMatches) {
      if (match._count > 1) {
        const sheets = await prisma.studySheet.findMany({
          where: {
            contentHash: match.contentHash,
            status: 'published',
          },
          select: {
            id: true,
            title: true,
            author: { select: { username: true } },
            createdAt: true,
          },
          take: 5,
        })
        topExactPairs.push({
          contentHash: match.contentHash,
          count: match._count,
          sheets: sheets.map((s) => ({
            sheetId: s.id,
            title: s.title,
            author: s.author?.username || 'Unknown',
            createdAt: s.createdAt,
          })),
        })
      }
    }

    res.json({
      coverage: {
        publishedSheetsWithFingerprint: publishedWithFingerprint,
        publishedSheetsTotal: publishedTotal,
        fingerprintCoveragePercent: publishedTotal > 0
          ? Math.round((publishedWithFingerprint / publishedTotal) * 10000) / 100
          : 0,
      },
      moderation: {
        plagiarismCasesCount: moderationCasesCount,
      },
      exactMatches: {
        pairsDetected: topExactPairs.length,
        topPairs: topExactPairs,
      },
      scanTimestamp: new Date().toISOString(),
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
