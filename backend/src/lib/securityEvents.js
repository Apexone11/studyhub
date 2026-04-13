const log = require('./logger')

// Structured security event logging keeps auth and authorization decisions
// attributable even before a full external alerting pipeline is added.
function logSecurityEvent(event, metadata = {}) {
  const payload = {
    event,
    occurredAt: new Date().toISOString(),
    ...metadata,
  }

  log.info(payload, '[security-event]')
  return payload
}

module.exports = {
  logSecurityEvent,
}
