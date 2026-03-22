const prisma = require('../../core/db/prisma')
const { SCAN_STATUS, HTML_VERSION_KIND } = require('../../lib/htmlDraftWorkflow')

function serializeContribution(contribution) {
  if (!contribution) return null

  return {
    id: contribution.id,
    status: contribution.status,
    message: contribution.message,
    createdAt: contribution.createdAt,
    updatedAt: contribution.updatedAt,
    reviewedAt: contribution.reviewedAt,
    proposer: contribution.proposer
      ? {
          id: contribution.proposer.id,
          username: contribution.proposer.username,
        }
      : null,
    reviewer: contribution.reviewer
      ? {
          id: contribution.reviewer.id,
          username: contribution.reviewer.username,
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

  const response = {
    ...sheet,
    starred,
    allowDownloads: sheet.allowDownloads !== false,
    hasAttachment: Boolean(sheet.attachmentUrl),
    attachmentName: sheet.attachmentName || null,
    attachmentUrl: null,
    commentCount,
    htmlWorkflow: {
      scanStatus: sheet.htmlScanStatus || SCAN_STATUS.QUEUED,
      riskTier: sheet.htmlRiskTier || 0,
      scanFindings: Array.isArray(sheet.htmlScanFindings) ? sheet.htmlScanFindings : [],
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
          }
        : null,
    }
  }

  return response
}

async function fetchContributionCollections(sheet, currentUser) {
  const canReviewIncoming = currentUser && (currentUser.role === 'admin' || currentUser.userId === sheet.userId)
  const canSeeOutgoing = currentUser && (currentUser.role === 'admin' || currentUser.userId === sheet.userId)

  const contributionInclude = {
    proposer: { select: { id: true, username: true } },
    reviewer: { select: { id: true, username: true } },
    forkSheet: {
      select: {
        id: true,
        title: true,
        updatedAt: true,
        author: { select: { id: true, username: true } },
      },
    },
  }

  const [incomingContributions, outgoingContributions] = await Promise.all([
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
  ])

  return {
    incomingContributions: incomingContributions.map(serializeContribution),
    outgoingContributions: outgoingContributions.map(serializeContribution),
  }
}

module.exports = { serializeSheet, serializeContribution, fetchContributionCollections }
