/**
 * mfaStepUpContext.js — frontend half of the step-up MFA contract.
 *
 * Pairs with backend/src/middleware/requireRecentMfa.js.
 *
 * Flow:
 *   1. An admin-sensitive request returns 403 with
 *      `{ code: 'MFA_STEP_UP_REQUIRED', setupRequired, reason }`.
 *   2. The caller (an admin-page apiJson wrapper) catches that and
 *      calls `requestStepUp({ setupRequired })` exposed by this hook.
 *   3. `MfaStepUpProvider` opens `MfaStepUpModal`:
 *      - setupRequired=true → modal explains 2FA must be set up first
 *        and offers a "Go to Settings" button. resolve(false).
 *      - setupRequired=false → modal POSTs /api/auth/mfa/step-up/start
 *        to email a code, then prompts the user for it. On submit,
 *        POSTs /api/auth/mfa/step-up/verify. On success, resolve(true).
 *      - On cancel → resolve(false).
 *   4. The caller, on resolve(true), retries the original request.
 *      On resolve(false), surfaces the error normally.
 *
 * If the Provider is not mounted, `requestStepUp` falls back to
 * `window.confirm` — the call STILL won't refresh the session, so the
 * retry would 403 again. The fallback exists only to keep the call
 * chain from throwing in non-app contexts (Storybook, isolated tests).
 */
import { createContext, useContext } from 'react'

const MfaStepUpContext = createContext(null)

export const MfaStepUpContextRaw = MfaStepUpContext

export function useMfaStepUp() {
  const ctx = useContext(MfaStepUpContext)
  if (!ctx) {
    // No-op fallback so callers don't need a hard dependency on the
    // Provider being mounted.
    return {
      requestStepUp: async () => false,
      isPending: false,
    }
  }
  return ctx
}
