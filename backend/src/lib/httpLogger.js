/* ═══════════════════════════════════════════════════════════════════════════
 * httpLogger.js — HTTP request/response logging middleware (pino-http)
 *
 * Automatically logs every HTTP request with: method, url, status code,
 * response time, request ID, and user ID (if authenticated). Replaces
 * the need for morgan or custom console.log middleware.
 *
 * Usage in index.js:
 *   const { httpLogger } = require('./lib/httpLogger')
 *   app.use(httpLogger)
 *
 * Each log line includes the X-Request-Id for end-to-end tracing.
 * ═══════════════════════════════════════════════════════════════════════════ */
const pinoHttp = require('pino-http')
const logger = require('./logger')

const httpLogger = pinoHttp({
  logger,

  // Use the request ID we set in the X-Request-Id middleware
  genReqId: (req) => req.requestId || req.headers['x-request-id'],

  // Customize what gets logged per request
  customProps: (req) => ({
    requestId: req.requestId,
    userId: req.user?.userId || req.user?.id || undefined,
  }),

  // Don't log health checks and static assets (too noisy)
  autoLogging: {
    ignore: (req) => {
      const path = req.url || ''
      return (
        path === '/health' ||
        path === '/' ||
        path.startsWith('/uploads/avatars/') ||
        path.startsWith('/favicon')
      )
    },
  },

  // Custom log level based on response status
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },

  // Reduce noise: only log essential request fields
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      requestId: req.requestId,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
})

module.exports = { httpLogger }
