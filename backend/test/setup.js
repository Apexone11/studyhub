process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'studyhub-test-secret-must-be-32-chars-minimum'
// 64-char hex placeholder so secretValidator's production-mode check passes
// when a test temporarily sets NODE_ENV=production (e.g. security.headers test).
// Not a real key — just enough to satisfy the format gate in validateSecrets.
process.env.FIELD_ENCRYPTION_KEY =
  process.env.FIELD_ENCRYPTION_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
