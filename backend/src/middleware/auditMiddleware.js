/**
 * Audit middleware — automatically logs security-relevant write operations.
 *
 * Attaches to response 'finish' event to record audit entries after
 * the response is sent, ensuring zero impact on response latency.
 *
 * Route-to-event mapping defines which operations are logged.
 * Only successful mutations (2xx status on POST/PATCH/DELETE) are recorded.
 */
const { auditFromRequest, AUDIT_EVENTS } = require('../lib/auditLog')

/**
 * Route patterns mapped to audit events.
 * Patterns use simple prefix matching with method filtering.
 */
const AUDIT_ROUTES = [
  // Sheet operations
  { method: 'POST',   pattern: '/api/sheets',                   event: AUDIT_EVENTS.SHEET_CREATE },
  { method: 'PATCH',  pattern: '/api/sheets/',                  event: AUDIT_EVENTS.SHEET_UPDATE, extractTarget: true },
  { method: 'DELETE', pattern: '/api/sheets/',                  event: AUDIT_EVENTS.SHEET_DELETE, extractTarget: true },

  // Fork
  { method: 'POST',   pattern: '/api/sheets/',  suffix: '/fork', event: AUDIT_EVENTS.SHEET_FORK },

  // Comments
  { method: 'POST',   pattern: '/api/sheets/',  suffix: '/comments', event: AUDIT_EVENTS.COMMENT_CREATE },
  { method: 'DELETE', pattern: '/api/sheets/',  suffix: '/comments/', event: AUDIT_EVENTS.COMMENT_DELETE },

  // Contributions
  { method: 'POST',   pattern: '/api/sheets/',  suffix: '/contributions', event: AUDIT_EVENTS.CONTRIBUTION_CREATE },
  { method: 'PATCH',  pattern: '/api/sheets/contributions/',    event: AUDIT_EVENTS.CONTRIBUTION_ACCEPT }, // accept/reject

  // Uploads
  { method: 'POST',   pattern: '/api/upload/content-image',     event: AUDIT_EVENTS.UPLOAD_CONTENT_IMAGE },
  { method: 'POST',   pattern: '/api/upload/avatar',            event: AUDIT_EVENTS.UPLOAD_AVATAR },
  { method: 'POST',   pattern: '/api/upload/attachment/',        event: AUDIT_EVENTS.UPLOAD_ATTACHMENT },

  // Admin operations
  { method: 'PATCH',  pattern: '/api/admin/users/',             event: AUDIT_EVENTS.ADMIN_USER_EDIT },
  { method: 'POST',   pattern: '/api/admin/sheets/',            event: AUDIT_EVENTS.ADMIN_SHEET_REVIEW },
  { method: 'POST',   pattern: '/api/moderation/',              event: AUDIT_EVENTS.MOD_CASE_CREATE },

  // Auth
  { method: 'POST',   pattern: '/api/auth/login',               event: AUDIT_EVENTS.AUTH_LOGIN },
  { method: 'POST',   pattern: '/api/auth/logout',              event: AUDIT_EVENTS.AUTH_LOGOUT },
  { method: 'PATCH',  pattern: '/api/auth/password',            event: AUDIT_EVENTS.AUTH_PASSWORD_CHANGE },
  { method: 'DELETE', pattern: '/api/auth/account',             event: AUDIT_EVENTS.AUTH_ACCOUNT_DELETE },

  // Settings
  { method: 'PATCH',  pattern: '/api/settings/password',        event: AUDIT_EVENTS.SETTINGS_PASSWORD_CHANGE },
  { method: 'PATCH',  pattern: '/api/settings/username',        event: AUDIT_EVENTS.SETTINGS_PROFILE_UPDATE },
  { method: 'PATCH',  pattern: '/api/settings/account-type',    event: AUDIT_EVENTS.SETTINGS_PROFILE_UPDATE },
]

/**
 * Match a request against the audit route table.
 * Returns the matched event string, or null if no match.
 */
function matchAuditRoute(method, url) {
  for (const route of AUDIT_ROUTES) {
    if (route.method !== method) continue
    if (route.suffix) {
      // Match pattern...id...suffix
      if (url.startsWith(route.pattern) && url.includes(route.suffix)) {
        return route.event
      }
    } else if (url.startsWith(route.pattern) || url === route.pattern) {
      return route.event
    }
  }
  return null
}

/**
 * Express middleware that records audit logs on successful mutations.
 * Install after auth middleware so req.user is available.
 */
function auditMiddleware(req, res, next) {
  // Only audit mutating methods
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    return next()
  }

  const event = matchAuditRoute(req.method, req.originalUrl || req.url)
  if (!event) return next()

  // Hook into response finish to log after the response is sent
  res.on('finish', () => {
    // Only audit successful operations (2xx)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      auditFromRequest(req, event)
    }
  })

  next()
}

module.exports = auditMiddleware
