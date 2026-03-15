const Sentry = require('@sentry/node')

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
      environment: process.env.NODE_ENV || 'development'
    })

    sentryEnabled = true
  }

  return sentryEnabled
}

function captureError(error, context = {}) {
  if (!sentryEnabled || !error) {
    return
  }

  Sentry.withScope((scope) => {
    Object.entries(context).forEach(([key, value]) => {
      scope.setExtra(key, value)
    })

    Sentry.captureException(error)
  })
}

module.exports = {
  initSentry,
  captureError
}
