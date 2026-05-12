/* ═══════════════════════════════════════════════════════════════════════════
 * useAiPermission — universal Claude-Code-style permission gate for AI
 * write actions across StudyHub.
 *
 * The hook itself + context live in `aiPermissionContext.js` (so this
 * file only-exports components, satisfying react-refresh). This file
 * exports the Provider component that wraps the app root.
 *
 * Contract:
 *   1. AI generates a proposed change.
 *   2. Caller invokes `requestPermission(payload)` → returns a Promise
 *      that resolves to `true` (accept) or `false` (reject).
 *   3. Until the user clicks Accept/Reject, NOTHING persists.
 *
 * Usage:
 *   const { requestPermission } = useAiPermission()
 *   const ok = await requestPermission({
 *     kind: 'sheet.edit',
 *     title: 'Apply AI edit to sheet?',
 *     summary: 'Hub AI is suggesting these changes...',
 *     preview: <DiffView old={old} next={proposed} />,
 *     destructive: false,
 *   })
 *   if (ok) await applyEdit(...)
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useMemo, useRef, useState } from 'react'
import { AiPermissionContext } from './aiPermissionContext'

// The hook itself + context are in `./aiPermissionContext` — import from
// there in consumers. This file only exports the Provider component so
// react-refresh stays happy.

export function AiPermissionProvider({ children, Dialog }) {
  const [request, setRequest] = useState(null)
  // resolveRef holds the deferred promise's resolver so we can fire it
  // when the user clicks an action button.
  const resolveRef = useRef(null)

  const requestPermission = useCallback((payload) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setRequest({
        kind: payload?.kind || 'generic',
        title: payload?.title || 'Apply AI suggestion?',
        summary: payload?.summary || 'Hub AI wants to make a change.',
        preview: payload?.preview ?? null,
        destructive: Boolean(payload?.destructive),
        applyLabel: payload?.applyLabel || 'Apply',
        rejectLabel: payload?.rejectLabel || 'Discard',
        details: payload?.details || null,
      })
    })
  }, [])

  const closeWith = useCallback((result) => {
    const resolver = resolveRef.current
    resolveRef.current = null
    setRequest(null)
    if (typeof resolver === 'function') resolver(result)
  }, [])

  const accept = useCallback(() => closeWith(true), [closeWith])
  const reject = useCallback(() => closeWith(false), [closeWith])

  const value = useMemo(
    () => ({ requestPermission, isPending: Boolean(request) }),
    [requestPermission, request],
  )

  return (
    <AiPermissionContext.Provider value={value}>
      {children}
      {Dialog && request ? <Dialog request={request} onAccept={accept} onReject={reject} /> : null}
    </AiPermissionContext.Provider>
  )
}
