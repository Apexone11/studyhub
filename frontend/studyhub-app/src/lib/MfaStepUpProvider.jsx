/**
 * MfaStepUpProvider.jsx — hosts the step-up MFA modal.
 *
 * Mounted in App.jsx inside the authenticated tree. Exposes
 * `requestStepUp(details)` via the useMfaStepUp() hook. See
 * `mfaStepUpContext.js` docblock for the full flow.
 */
import { useCallback, useMemo, useState } from 'react'
import { MfaStepUpContextRaw } from './mfaStepUpContext'
import MfaStepUpModal from '../components/MfaStepUpModal'

export default function MfaStepUpProvider({ children }) {
  // Resolver of the active requestStepUp() promise. The modal calls
  // resolver(true) on success, resolver(false) on cancel.
  const [pending, setPending] = useState(null)

  const requestStepUp = useCallback((details = {}) => {
    return new Promise((resolve) => {
      setPending({ resolve, details })
    })
  }, [])

  const closeWith = useCallback(
    (result) => {
      setPending((current) => {
        if (current) current.resolve(result)
        return null
      })
    },
    [setPending],
  )

  const value = useMemo(
    () => ({
      requestStepUp,
      isPending: Boolean(pending),
    }),
    [requestStepUp, pending],
  )

  return (
    <MfaStepUpContextRaw.Provider value={value}>
      {children}
      {pending ? (
        <MfaStepUpModal
          setupRequired={Boolean(pending.details.setupRequired)}
          reason={pending.details.reason}
          onSuccess={() => closeWith(true)}
          onCancel={() => closeWith(false)}
        />
      ) : null}
    </MfaStepUpContextRaw.Provider>
  )
}
