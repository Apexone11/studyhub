/* ═══════════════════════════════════════════════════════════════════════════
 * features/auth — barrel re-exports for the Auth feature
 *
 * Convention: new hooks, helpers, and constants go here.
 * Pages stay in pages/auth/ and import from this barrel.
 * ═══════════════════════════════════════════════════════════════════════════ */

// Hook
export { default as useRegisterFlow } from '../../pages/auth/useRegisterFlow'

// Constants & API helpers
export {
  RULES,
  validateAccountFields,
  getSteps,
  apiStartRegistration,
  apiVerifyCode,
  apiResendCode,
  apiGoogleAuth,
  apiGoogleComplete,
  apiCompleteRegistration,
  apiLoadSchools,
} from '../../pages/auth/registerConstants'
