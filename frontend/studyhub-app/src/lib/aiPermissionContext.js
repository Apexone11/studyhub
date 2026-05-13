/* ═══════════════════════════════════════════════════════════════════════════
 * aiPermissionContext.js — React Context + hook for AI permission gating.
 *
 * Split from the Provider component so the file only-exports
 * non-components, satisfying react-refresh.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { createContext, useContext } from 'react'

export const AiPermissionContext = createContext(null)

/**
 * Subscribe to the AI permission gate. Returns:
 *   { requestPermission(payload) → Promise<boolean>, isPending: boolean }
 *
 * If the AiPermissionProvider isn't mounted in the tree, the hook
 * falls back to window.confirm so calling code still gets a real
 * yes/no answer rather than an exception. Useful in isolated test
 * renders and in screens we haven't migrated yet.
 */
export function useAiPermission() {
  const ctx = useContext(AiPermissionContext)
  if (!ctx) {
    return {
      requestPermission: async (payload) => {
        if (typeof window === 'undefined') return false
        return window.confirm(
          (payload?.summary || 'Apply AI suggestion?') +
            '\n\nClick OK to apply, Cancel to discard.',
        )
      },
      isPending: false,
    }
  }
  return ctx
}
