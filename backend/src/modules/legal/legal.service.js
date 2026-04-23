const prisma = require('../../lib/prisma')
const { createNotification } = require('../../lib/notify')
const {
  CURRENT_LEGAL_VERSION,
  LEGAL_ACCEPTANCE_SOURCES,
  LEGAL_DOCUMENT_ORDER,
  LEGAL_REMINDER_LINK_PATH,
  LEGAL_REMINDER_NOTIFICATION_TYPE,
} = require('./legal.constants')
const { LEGAL_REQUIRED_SIGNUP_SLUGS, getLegalDocumentSeeds } = require('./legal.seed')

let seedPromise = null

const STATUS_DOCUMENT_SELECT = {
  id: true,
  slug: true,
  version: true,
  title: true,
  summary: true,
  intro: true,
  updatedLabel: true,
  source: true,
  termlyEmbedId: true,
  termlyUrl: true,
  requiredAtSignup: true,
  isCurrent: true,
  publishedAt: true,
}

const FULL_DOCUMENT_SELECT = {
  ...STATUS_DOCUMENT_SELECT,
  bodyText: true,
}

function sortDocuments(documents) {
  const orderMap = new Map(LEGAL_DOCUMENT_ORDER.map((slug, index) => [slug, index]))
  return [...documents].sort((left, right) => {
    const leftOrder = orderMap.has(left.slug) ? orderMap.get(left.slug) : Number.MAX_SAFE_INTEGER
    const rightOrder = orderMap.has(right.slug) ? orderMap.get(right.slug) : Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder
  })
}

function compareAcceptedVersion(version) {
  return typeof version === 'string' && version >= CURRENT_LEGAL_VERSION
}

function getLegalNotificationMessage() {
  return `Review and accept the current StudyHub legal documents (version ${CURRENT_LEGAL_VERSION}) in Settings > Legal to keep using your account.`
}

async function seedLegalDocuments(db) {
  const seeds = getLegalDocumentSeeds()

  for (const seed of seeds) {
    await db.legalDocument.updateMany({
      where: {
        slug: seed.slug,
        isCurrent: true,
        NOT: { version: seed.version },
      },
      data: { isCurrent: false },
    })

    await db.legalDocument.upsert({
      where: {
        slug_version: {
          slug: seed.slug,
          version: seed.version,
        },
      },
      create: {
        slug: seed.slug,
        version: seed.version,
        title: seed.title,
        summary: seed.summary,
        intro: seed.intro,
        updatedLabel: seed.updatedLabel,
        bodyText: seed.bodyText,
        source: seed.termlyEmbedId ? 'termly-backup' : 'internal',
        termlyEmbedId: seed.termlyEmbedId,
        termlyUrl: seed.termlyUrl,
        requiredAtSignup: Boolean(seed.requiredAtSignup),
        isCurrent: true,
        publishedAt: new Date(`${seed.version}T00:00:00.000Z`),
      },
      update: {
        title: seed.title,
        summary: seed.summary,
        intro: seed.intro,
        updatedLabel: seed.updatedLabel,
        bodyText: seed.bodyText,
        source: seed.termlyEmbedId ? 'termly-backup' : 'internal',
        termlyEmbedId: seed.termlyEmbedId,
        termlyUrl: seed.termlyUrl,
        requiredAtSignup: Boolean(seed.requiredAtSignup),
        isCurrent: true,
        publishedAt: new Date(`${seed.version}T00:00:00.000Z`),
      },
    })
  }
}

async function ensureLegalDocumentsSeeded(db = prisma) {
  if (db !== prisma) {
    await seedLegalDocuments(db)
    return
  }

  if (!seedPromise) {
    seedPromise = seedLegalDocuments(db).catch((error) => {
      seedPromise = null
      throw error
    })
  }

  await seedPromise
}

async function getCurrentStatusDocuments(tx) {
  const documents = await tx.legalDocument.findMany({
    where: { isCurrent: true },
    select: STATUS_DOCUMENT_SELECT,
  })
  return sortDocuments(documents)
}

async function getCurrentRequiredDocuments(tx) {
  const documents = await tx.legalDocument.findMany({
    where: {
      isCurrent: true,
      slug: { in: LEGAL_REQUIRED_SIGNUP_SLUGS },
    },
    select: { id: true, slug: true },
  })
  return sortDocuments(documents)
}

async function maybeBackfillLegacyAcceptances(user, tx) {
  if (!user?.id || !compareAcceptedVersion(user.termsAcceptedVersion) || !user.termsAcceptedAt) {
    return
  }

  const requiredDocuments = await getCurrentRequiredDocuments(tx)
  if (requiredDocuments.length === 0) return

  const existingAcceptances = await tx.legalAcceptance.findMany({
    where: {
      userId: user.id,
      documentId: { in: requiredDocuments.map((document) => document.id) },
    },
    select: { documentId: true },
  })

  const acceptedIds = new Set(existingAcceptances.map((acceptance) => acceptance.documentId))
  const missingDocuments = requiredDocuments.filter((document) => !acceptedIds.has(document.id))
  if (missingDocuments.length === 0) return

  await tx.legalAcceptance.createMany({
    data: missingDocuments.map((document) => ({
      userId: user.id,
      documentId: document.id,
      source: LEGAL_ACCEPTANCE_SOURCES.LEGACY_BACKFILL,
      acceptedAt: user.termsAcceptedAt,
    })),
    skipDuplicates: true,
  })
}

function buildLegalStatus(user, documents, acceptances) {
  const acceptanceByDocumentId = new Map(
    acceptances.map((acceptance) => [acceptance.documentId, acceptance.acceptedAt]),
  )

  const statusDocuments = documents.map((document) => {
    const acceptedAt = acceptanceByDocumentId.get(document.id) || null
    return {
      ...document,
      acceptedAt,
      isAccepted: Boolean(acceptedAt),
    }
  })

  const acceptedRequiredDocuments = statusDocuments.filter(
    (document) => document.requiredAtSignup && document.isAccepted,
  )
  const missingRequiredDocuments = statusDocuments
    .filter((document) => document.requiredAtSignup && !document.isAccepted)
    .map((document) => document.slug)
  const lastAcceptedAt =
    acceptedRequiredDocuments.length > 0
      ? new Date(
          Math.max(
            ...acceptedRequiredDocuments.map((document) => new Date(document.acceptedAt).getTime()),
          ),
        )
      : user?.termsAcceptedAt || null

  return {
    currentVersion: CURRENT_LEGAL_VERSION,
    acceptedVersion: user?.termsAcceptedVersion || null,
    acceptedAt: user?.termsAcceptedAt || null,
    lastAcceptedAt,
    documents: statusDocuments,
    requiredDocuments: statusDocuments
      .filter((document) => document.requiredAtSignup)
      .map((document) => document.slug),
    acceptedDocuments: statusDocuments
      .filter((document) => document.isAccepted)
      .map((document) => document.slug),
    missingRequiredDocuments,
    needsAcceptance: missingRequiredDocuments.length > 0,
    remediationPath: LEGAL_REMINDER_LINK_PATH,
  }
}

async function getCurrentLegalDocuments(db = prisma) {
  await ensureLegalDocumentsSeeded(db)
  const documents = await db.legalDocument.findMany({
    where: { isCurrent: true },
    select: STATUS_DOCUMENT_SELECT,
  })
  return sortDocuments(documents)
}

async function getCurrentLegalDocument(slug, db = prisma) {
  await ensureLegalDocumentsSeeded(db)
  return db.legalDocument.findFirst({
    where: { slug, isCurrent: true },
    select: FULL_DOCUMENT_SELECT,
  })
}

async function getUserLegalStatus(userId, db = prisma) {
  await ensureLegalDocumentsSeeded(db)

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        termsAcceptedVersion: true,
        termsAcceptedAt: true,
      },
    })

    if (!user) return null

    await maybeBackfillLegacyAcceptances(user, tx)

    const documents = await getCurrentStatusDocuments(tx)
    const acceptances = await tx.legalAcceptance.findMany({
      where: {
        userId,
        documentId: { in: documents.map((document) => document.id) },
      },
      select: {
        documentId: true,
        acceptedAt: true,
      },
    })

    return buildLegalStatus(user, documents, acceptances)
  })
}

async function recordCurrentRequiredLegalAcceptancesTx(tx, userId, options = {}) {
  const acceptedAt = options.acceptedAt || new Date()
  const source = options.source || LEGAL_ACCEPTANCE_SOURCES.SETTINGS
  const requiredDocuments = await getCurrentRequiredDocuments(tx)

  if (requiredDocuments.length === 0) {
    throw new Error('Current required legal documents are unavailable.')
  }

  await tx.legalAcceptance.createMany({
    data: requiredDocuments.map((document) => ({
      userId,
      documentId: document.id,
      source,
      acceptedAt,
    })),
    skipDuplicates: true,
  })

  await tx.user.update({
    where: { id: userId },
    data: {
      termsAcceptedVersion: CURRENT_LEGAL_VERSION,
      termsAcceptedAt: acceptedAt,
    },
  })

  return acceptedAt
}

async function recordCurrentRequiredLegalAcceptances(userId, options = {}, db = prisma) {
  await ensureLegalDocumentsSeeded(db)

  if (db === prisma) {
    return prisma.$transaction((tx) => recordCurrentRequiredLegalAcceptancesTx(tx, userId, options))
  }

  return recordCurrentRequiredLegalAcceptancesTx(db, userId, options)
}

async function markLegalReminderNotificationsRead(tx, userId) {
  await tx.notification.updateMany({
    where: {
      userId,
      type: LEGAL_REMINDER_NOTIFICATION_TYPE,
      linkPath: LEGAL_REMINDER_LINK_PATH,
      message: { contains: CURRENT_LEGAL_VERSION },
    },
    data: { read: true },
  })
}

async function acceptCurrentLegalDocuments(userId, options = {}, db = prisma) {
  await ensureLegalDocumentsSeeded(db)

  await db.$transaction(async (tx) => {
    await recordCurrentRequiredLegalAcceptancesTx(tx, userId, options)
    await markLegalReminderNotificationsRead(tx, userId)
  })

  return getUserLegalStatus(userId, db)
}

async function ensureLegalReminderNotification(userId, status, db = prisma) {
  if (!status?.needsAcceptance) return

  const existingNotification = await db.notification.findFirst({
    where: {
      userId,
      type: LEGAL_REMINDER_NOTIFICATION_TYPE,
      linkPath: LEGAL_REMINDER_LINK_PATH,
      message: { contains: CURRENT_LEGAL_VERSION },
    },
    select: { id: true },
  })

  if (existingNotification) return

  await createNotification(db, {
    userId,
    type: LEGAL_REMINDER_NOTIFICATION_TYPE,
    message: getLegalNotificationMessage(),
    linkPath: LEGAL_REMINDER_LINK_PATH,
    priority: 'medium',
  })
}

async function getSessionLegalAcceptanceState(userId, db = prisma) {
  const status = await getUserLegalStatus(userId, db)
  if (!status) return null

  await ensureLegalReminderNotification(userId, status, db)

  return {
    currentVersion: status.currentVersion,
    acceptedVersion: status.acceptedVersion,
    acceptedAt: status.acceptedAt,
    needsAcceptance: status.needsAcceptance,
    requiredDocuments: status.requiredDocuments,
    acceptedDocuments: status.acceptedDocuments,
    missingRequiredDocuments: status.missingRequiredDocuments,
    remediationPath: status.remediationPath,
  }
}

module.exports = {
  CURRENT_LEGAL_VERSION,
  LEGAL_ACCEPTANCE_SOURCES,
  acceptCurrentLegalDocuments,
  ensureLegalDocumentsSeeded,
  getCurrentLegalDocument,
  getCurrentLegalDocuments,
  getSessionLegalAcceptanceState,
  getUserLegalStatus,
  recordCurrentRequiredLegalAcceptances,
  recordCurrentRequiredLegalAcceptancesTx,
}
