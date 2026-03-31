const Sentry = require('@sentry/node')
const { redactObject, redactHeaders, REDACTED } = require('../lib/redact')

let sentryEnabled = false

function parseSampleRate(value, fallbackValue) {
  const parsedValue = Number.parseFloat(value)

  if (!Number.isFinite(parsedValue) || parsedValue < 0 || parsedValue > 1) {
    return fallbackValue
  }

  return parsedValue
}

function initSentry() {
  const dsn = process.env.SENTRY_DSN

  if (!dsn) {
    return false
  }

  if (!sentryEnabled) {
    Sentry.init({
      dsn,
      tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
      environment: process.env.NODE_ENV || 'development',
      beforeSend(event) {
        // Scrub sensitive data from request headers
        if (event.request?.headers) {
          event.request.headers = redactHeaders(event.request.headers)
        }
        // Scrub sensitive data from request body/data
        if (event.request?.data) {
          event.request.data = typeof event.request.data === 'object'
            ? redactObject(event.request.data)
            : REDACTED
        }
        // Scrub cookies
        if (event.request?.cookies) {
          event.request.cookies = REDACTED
        }
        // Scrub extras
        if (event.extra) {
          event.extra = redactObject(event.extra)
        }
        return event
      },
    })

    sentryEnabled = true
  }

  return sentryEnabled
}

function captureError(error, context = {}) {
  if (!sentryEnabled || !error) {
    return
  }

  const safeContext = redactObject(context)
  Sentry.withScope((scope) => {
    Object.entries(safeContext).forEach(([key, value]) => {
      scope.setExtra(key, value)
    })

    Sentry.captureException(error)
  })
}

module.exports = {
  initSentry,
  captureError
}
