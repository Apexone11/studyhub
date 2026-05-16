const prisma = require('../../core/db/prisma')
const { AUTHOR_SELECT } = require('./sheets.constants')
const { canModerateOrOwnSheet } = require('./sheets.service')
const { SCAN_STATUS, HTML_VERSION_KIND } = require('../../lib/html/htmlDraftWorkflow')
const {
  RISK_TIER,
  generateRiskSummary,
  generateTierExplanation,
  groupFindingsByCategory,
} = require('../../lib/html/htmlSecurity')

/**
 * Derive the preview mode string from the risk tier.
 *   interactive — Tier 0: scripts allowed, full CSP
 *   interactive — Tier 0 (CLEAN) + Tier 1 (FLAGGED): scripts allowed in
 *                 the sandboxed iframe per the publish-with-warning policy.
 *                 The "publish with warning" UI in SheetContentPanel keys
 *                 off `htmlWorkflow.ackRequired` (set true exclusively for
 *                 Tier 1 a few lines below), NOT off previewMode — so
 *                 Tier 1 still renders the Flagged badge + warning panel
 *                 even though previewMode is 'interactive'.
 *   restricted  — Tier 2 (HIGH_RISK): owner/admin only preview.
 *   disabled    — Tier 3 (QUARANTINED): no preview at all.
 */
function tierToPreviewMode(tier) {
  switch (tier) {
    case RISK_TIER.HIGH_RISK:
      return 'restricted'
    case RISK_TIER.QUARANTINED:
      return 'disabled'
    default:
      // CLEAN (0) and FLAGGED (1) both fall through. The warning UI for
      // Tier 1 lives behind `ackRequired` in the serializer payload; the
      // interactivity gate also runs in sheets.html.controller (canInteract
      // + the html-runtime token endpoint).
      return 'interactive'
  }
}

function serializeContribution(contribution) {
  if (!contribution) return null

  return {
    id: contribution.id,
    status: contribution.status,
    message: contribution.message,
    reviewComment: contribution.reviewComment || '',
    createdAt: contribution.createdAt,
    updatedAt: contribution.updatedAt,
    reviewedAt: contribution.reviewedAt,
    proposer: contribution.proposer
      ? {
          id: contribution.proposer.id,
          username: contribution.proposer.username,
          emailVerified: contribution.proposer.emailVerified || false,
          isStaffVerified: contribution.proposer.isStaffVerified || false,
        }
      : null,
    reviewer: contribution.reviewer
      ? {
          id: contribution.reviewer.id,
          username: contribution.reviewer.username,
          emailVerified: contribution.reviewer.emailVerified || false,
          isStaffVerified: contribution.reviewer.isStaffVerified || false,
        }
      : null,
    forkSheet: contribution.forkSheet
      ? {
          id: contribution.forkSheet.id,
          title: contribution.forkSheet.title,
          updatedAt: contribution.forkSheet.updatedAt,
          author: contribution.forkSheet.author
            ? {
                id: contribution.forkSheet.author.id,
                username: contribution.forkSheet.author.username,
                emailVerified: contribution.forkSheet.author.emailVerified || false,
                isStaffVerified: contribution.forkSheet.author.isStaffVerified || false,
              }
            : null,
        }
      : null,
    targetSheetId: contribution.targetSheetId,
    forkSheetId: contribution.forkSheetId,
  }
}

function serializeSheet(sheet, { starred = false, reactions = null, commentCount = 0 } = {}) {
  const originalVersion = Array.isArray(sheet.htmlVersions)
    ? sheet.htmlVersions.find((entry) => entry.kind === HTML_VERSION_KIND.ORIGINAL)
    : null
  const workingVersion = Array.isArray(sheet.htmlVersions)
    ? sheet.htmlVersions.find((entry) => entry.kind === HTML_VERSION_KIND.WORKING)
    : null

  // Strip AI review fields from public responses (admin-only data)
  const {
    aiReviewDecision: _aiD,
    aiReviewConfidence: _aiC,
    aiReviewScore: _aiS,
    aiReviewFindings: _aiF,
    aiReviewReasoning: _aiR,
    aiReviewedAt: _aiAt,
    ...publicSheet
  } = sheet

  const response = {
    ...publicSheet,
    starred,
    allowDownloads: sheet.allowDownloads !== false,
    allowEditing: sheet.allowEditing === true,
    hasAttachment: Boolean(sheet.attachmentUrl),
    attachmentName: sheet.attachmentName || null,
    attachmentUrl: null,
    commentCount,
    htmlWorkflow: {
      scanStatus: sheet.htmlScanStatus || SCAN_STATUS.QUEUED,
      riskTier: sheet.htmlRiskTier || 0,
      previewMode: tierToPreviewMode(sheet.htmlRiskTier || 0),
      ackRequired: (sheet.htmlRiskTier || 0) === RISK_TIER.FLAGGED,
      scanFindings: Array.isArray(sheet.htmlScanFindings) ? sheet.htmlScanFindings : [],
      riskSummary: generateRiskSummary(sheet.htmlRiskTier || 0, sheet.htmlScanFindings),
      tierExplanation: generateTierExplanation(sheet.htmlRiskTier || 0),
      findingsByCategory: groupFindingsByCategory(
        Array.isArray(sheet.htmlScanFindings) ? sheet.htmlScanFindings : [],
      ),
      scanUpdatedAt: sheet.htmlScanUpdatedAt || null,
      scanAcknowledgedAt: sheet.htmlScanAcknowledgedAt || null,
      hasOriginalVersion: Boolean(originalVersion),
      hasWorkingVersion: Boolean(workingVersion),
      originalSourceName: originalVersion?.sourceName || null,
    },
  }

  if (reactions) {
    response.reactions = reactions
  }

  if (sheet.forkSource) {
    response.forkSource = {
      id: sheet.forkSource.id,
      title: sheet.forkSource.title,
      userId: sheet.forkSource.userId,
      author: sheet.forkSource.author
        ? {
            id: sheet.forkSource.author.id,
            username: sheet.forkSource.author.username,
            emailVerified: sheet.forkSource.author.emailVerified || false,
            isStaffVerified: sheet.forkSource.author.isStaffVerified || false,
          }
        : null,
    }
  }

  return response
}

async function fetchContributionCollections(sheet, currentUser) {
  const canReviewIncoming = canModerateOrOwnSheet(sheet, currentUser)
  const canSeeOutgoing = canModerateOrOwnSheet(sheet, currentUser)

  const contributionInclude = {
    proposer: { select: AUTHOR_SELECT },
    reviewer: { select: AUTHOR_SELECT },
    forkSheet: {
      select: {
        id: true,
        title: true,
        updatedAt: true,
        author: { select: AUTHOR_SELECT },
      },
    },
  }

  // Public summary counts — visible to EVERY viewer (incl. anonymous /
  // logged-in non-owner). GitHub-grade UX: anyone can see "3 open
  // contributions" on a repo without needing to be a maintainer. The
  // detailed row arrays remain permission-gated below. Bug repro 2026-05-16:
  // non-owner viewers saw "No contributions yet" panels that couldn't
  // distinguish "actually empty" from "you can't see them." See
  // docs/internal/plans/bug-contribute-back-and-sheet-page-audit.md.
  // groupBy may be absent in older / mocked Prisma clients (some tests
  // assemble a partial mock without it). Fall back to a zeroed summary
  // rather than blowing up the read path — the summary is a UX-nicety,
  // not a security gate, so degrading gracefully is the right call.
  const safeGroupBy = async (where) => {
    if (typeof prisma.sheetContribution.groupBy !== 'function') return []
    try {
      return await prisma.sheetContribution.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      })
    } catch {
      return []
    }
  }

  const [incomingContributions, outgoingContributions, incomingByStatus, outgoingByStatus] =
    await Promise.all([
      canReviewIncoming
        ? prisma.sheetContribution.findMany({
            where: { targetSheetId: sheet.id },
            include: contributionInclude,
            orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
            take: 20,
          })
        : [],
      canSeeOutgoing
        ? prisma.sheetContribution.findMany({
            where: { forkSheetId: sheet.id },
            include: contributionInclude,
            orderBy: { createdAt: 'desc' },
            take: 20,
          })
        : [],
      safeGroupBy({ targetSheetId: sheet.id }),
      safeGroupBy({ forkSheetId: sheet.id }),
    ])

  const summarize = (rows) => {
    const out = { total: 0, pending: 0, accepted: 0, rejected: 0 }
    for (const row of rows) {
      const n = row?._count?._all || 0
      out.total += n
      if (row.status === 'pending') out.pending += n
      else if (row.status === 'accepted') out.accepted += n
      else if (row.status === 'rejected') out.rejected += n
    }
    return out
  }

  return {
    incomingContributions: incomingContributions.map(serializeContribution),
    outgoingContributions: outgoingContributions.map(serializeContribution),
    incomingContributionsSummary: summarize(incomingByStatus),
    outgoingContributionsSummary: summarize(outgoingByStatus),
  }
}

module.exports = {
  serializeSheet,
  serializeContribution,
  fetchContributionCollections,
  tierToPreviewMode,
}
