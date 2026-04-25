const express = require('express')
const { Webhook } = require('svix')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')

const router = express.Router()
const WEBHOOK_PROVIDER = 'resend'
const WEBHOOK_BODY_LIMIT = '1mb'

function envFlag(name, fallback = false) {
  const value = String(process.env[name] || '').trim()
  if (!value) return fallback
  return /^(1|true|yes|on)$/i.test(value)
}

function isStrictWebhookMode() {
  return envFlag('RESEND_WEBHOOK_STRICT', process.env.NODE_ENV === 'production')
}

function normalizeString(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function parseDateOrNull(value) {
  if (!value) return null
  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

function normalizeEmailAddress(value) {
  const normalized = normalizeString(value)
  return normalized ? normalized.toLowerCase() : null
}

function getEventRecipients(eventData) {
  if (!eventData || typeof eventData !== 'object') return []

  if (Array.isArray(eventData.to)) {
    return [...new Set(eventData.to.map((entry) => normalizeEmailAddress(entry)).filter(Boolean))]
  }

  const singleRecipient = normalizeEmailAddress(eventData.to)
  return singleRecipient ? [singleRecipient] : []
}

function isPermanentBounce(eventData) {
  if (!eventData || typeof eventData !== 'object') return true
  const { bounce } = eventData
  if (!bounce || typeof bounce !== 'object') return true

  const bounceType = normalizeString(bounce.type)
  if (!bounceType) return true

  return bounceType.toLowerCase() === 'permanent'
}

function buildSuppressionDetails(eventData) {
  if (!eventData || typeof eventData !== 'object') return null

  const details = {}

  if (eventData.bounce && typeof eventData.bounce === 'object') {
    details.bounce = eventData.bounce
  }

  if (eventData.complaint && typeof eventData.complaint === 'object') {
    details.complaint = eventData.complaint
  }

  if (eventData.tags && typeof eventData.tags === 'object') {
    details.tags = eventData.tags
  }

  return Object.keys(details).length > 0 ? details : null
}

function getSuppressionReason(eventType, eventData) {
  const normalizedType = String(eventType || '').toLowerCase()
  if (normalizedType === 'email.complained') return 'complained'
  if (normalizedType === 'email.bounced' && isPermanentBounce(eventData)) return 'bounced'
  return null
}

function getRawPayloadText(req) {
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (typeof req.body === 'string') return req.body
  return ''
}

function requireObjectPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Webhook payload must be an object.')
  }

  return payload
}

function parseUnsignedPayload(payloadText) {
  try {
    return requireObjectPayload(JSON.parse(payloadText))
  } catch {
    const error = new Error('Webhook payload must be valid JSON.')
    error.statusCode = 400
    throw error
  }
}

function verifyResendPayload(payloadText, req) {
  const secret = String(process.env.RESEND_WEBHOOK_SECRET || '').trim()
  const strict = isStrictWebhookMode()

  if (!secret) {
    if (strict) {
      const error = new Error('Webhook signing secret is not configured.')
      error.statusCode = 503
      throw error
    }

    return parseUnsignedPayload(payloadText)
  }

  const headers = {
    'svix-id': req.get('svix-id'),
    'svix-timestamp': req.get('svix-timestamp'),
    'svix-signature': req.get('svix-signature'),
  }

  try {
    const webhook = new Webhook(secret)
    const verifiedPayload = webhook.verify(payloadText, headers)
    return requireObjectPayload(verifiedPayload)
  } catch (error) {
    const wrappedError = new Error('Invalid webhook signature.')
    wrappedError.statusCode = 400
    wrappedError.cause = error
    throw wrappedError
  }
}

function getPrimaryRecipient(data) {
  if (!data || typeof data !== 'object') return null

  if (Array.isArray(data.to)) {
    return normalizeString(data.to[0])
  }

  return normalizeString(data.to)
}

async function persistDeliveryEvent(payload, req) {
  const eventData =
    payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? payload.data
      : {}

  const svixId = normalizeString(req.get('svix-id'))
  const providerWebhookId = svixId ? `svix:${svixId}` : null
  const eventType = normalizeString(payload.type) || 'unknown'

  const record = {
    provider: WEBHOOK_PROVIDER,
    eventType,
    providerWebhookId,
    providerMessageId: normalizeString(eventData.email_id),
    recipient: getPrimaryRecipient(eventData),
    subject: normalizeString(eventData.subject),
    eventCreatedAt: parseDateOrNull(payload.created_at || eventData.created_at),
    payload,
  }

  const suppressionReason = getSuppressionReason(eventType, eventData)
  const suppressionRecipients = suppressionReason ? getEventRecipients(eventData) : []
  const suppressionDetails = suppressionReason ? buildSuppressionDetails(eventData) : null
  const sourceMessageId = normalizeString(eventData.email_id)
  const lastSuppressedAt = parseDateOrNull(payload.created_at || eventData.created_at) || new Date()

  try {
    await prisma.$transaction(async (tx) => {
      await tx.emailDeliveryEvent.create({ data: record })

      if (suppressionReason && suppressionRecipients.length > 0) {
        await Promise.all(
          suppressionRecipients.map(async (email) => {
            const suppression = await tx.emailSuppression.upsert({
              where: { email },
              update: {
                active: true,
                reason: suppressionReason,
                provider: WEBHOOK_PROVIDER,
                sourceEventType: eventType,
                sourceEventId: providerWebhookId,
                sourceMessageId,
                details: suppressionDetails,
                lastSuppressedAt,
              },
              create: {
                email,
                active: true,
                reason: suppressionReason,
                provider: WEBHOOK_PROVIDER,
                sourceEventType: eventType,
                sourceEventId: providerWebhookId,
                sourceMessageId,
                details: suppressionDetails,
                firstSuppressedAt: lastSuppressedAt,
                lastSuppressedAt,
              },
            })

            await tx.emailSuppressionAudit.create({
              data: {
                suppressionId: suppression.id,
                action: 'auto-suppress',
                reason: `Automatic suppression from ${eventType}.`,
                context: {
                  provider: WEBHOOK_PROVIDER,
                  sourceEventType: eventType,
                  sourceEventId: providerWebhookId,
                  sourceMessageId,
                },
              },
            })
          }),
        )
      }
    })

    return { duplicate: false, eventType }
  } catch (error) {
    if (error?.code === 'P2002') {
      return { duplicate: true, eventType }
    }

    throw error
  }
}

router.post(
  '/resend',
  express.raw({ type: 'application/json', limit: WEBHOOK_BODY_LIMIT }),
  async (req, res) => {
    const payloadText = getRawPayloadText(req)
    if (!payloadText) {
      return res.status(400).json({ error: 'Webhook payload is required.' })
    }

    try {
      const payload = verifyResendPayload(payloadText, req)
      const result = await persistDeliveryEvent(payload, req)

      return res.status(200).json({
        ok: true,
        eventType: result.eventType,
        duplicate: result.duplicate,
      })
    } catch (error) {
      if (error?.statusCode === 400) {
        captureError(error, { source: 'resendWebhookSignatureVerification' })
        return res.status(400).json({ error: 'Invalid webhook request.' })
      }

      if (error?.statusCode === 503) {
        captureError(error, { source: 'resendWebhookConfig' })
        return res.status(503).json({ error: 'Webhook endpoint is not configured.' })
      }

      captureError(error, { source: 'resendWebhookPersistence' })
      console.error(error)
      return res.status(500).json({ error: 'Failed to process webhook event.' })
    }
  },
)

module.exports = router
