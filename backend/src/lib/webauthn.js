/**
 * WebAuthn barrel re-export.
 *
 * All registration and authentication ceremony functions are split into
 * dedicated modules for maintainability. This file preserves the original
 * public API so existing consumers continue to work unchanged.
 */
const { generateRegistrationOptions, verifyRegistration } = require('./webauthnRegistration')
const { generateAuthenticationOptions, verifyAuthentication } = require('./webauthnAuthentication')

module.exports = {
  generateRegistrationOptions,
  verifyRegistration,
  generateAuthenticationOptions,
  verifyAuthentication,
}
