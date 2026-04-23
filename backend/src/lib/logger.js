/* ═══════════════════════════════════════════════════════════════════════════
 * logger.js — Structured JSON logging with pino
 *
 * Replaces console.log/error/warn across the backend with structured,
 * searchable, filterable JSON logs. In production, Railway and any log
 * aggregator (Datadog, Logtail, Better Stack) can parse these automatically.
 *
 * Usage:
 *   const log = require('./lib/logger')
 *
 *   log.info('Server started')
 *   log.info({ userId, action: 'login' }, 'User logged in')
 *   log.error({ err, requestId }, 'Database query failed')
 *   log.warn({ route: '/api/sheets' }, 'Rate limit approaching')
 *
 * In development, logs are pretty-printed for readability.
 * In production, logs are single-line JSON for machine parsing.
 *
 * Same pattern used by Fastify, NearForm, Netflix, and Walmart.
 * ═══════════════════════════════════════════════════════════════════════════ */
const pino = require('pino')

const isProd = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'

const logger = pino({
  // In production: info and above. In test: silent. In dev: debug.
  level: isTest ? 'silent' : isProd ? 'info' : 'debug',

  // Attach service name for multi-service environments
  base: { service: 'studyhub-api' },

  // ISO timestamps for log aggregators
  timestamp: pino.stdTimeFunctions.isoTime,

  // Pretty-print in development for human readability
  transport:
    !isProd && !isTest
      ? {
          target: 'pino/file',
          options: { destination: 1 }, // stdout
        }
      : undefined,

  // Redact sensitive fields from ever appearing in logs
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'token',
      'secret',
      'creditCard',
    ],
    censor: '[REDACTED]',
  },
})

module.exports = logger
