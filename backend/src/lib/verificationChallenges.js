// Barrel re-export for backwards compatibility.
// Storage, helpers, and constants live in verificationStorage.js.
// Validation and workflow logic live in verificationValidation.js.

const storage = require('./verificationStorage')
const validation = require('./verificationValidation')

module.exports = {
  ...storage,
  ...validation,
}
