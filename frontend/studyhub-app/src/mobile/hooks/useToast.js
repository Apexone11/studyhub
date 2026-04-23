// src/mobile/hooks/useToast.js
// Context + hook for the mobile Toast system. Kept in a separate file so
// Toast.jsx stays component-only (react-refresh/only-export-components).

import { createContext, useContext } from 'react'

export const ToastContext = createContext(null)

/**
 * useToast — access the imperative toast API.
 *   const { show, dismiss } = useToast()
 *   show({ message: 'Saved', kind: 'success' })
 *
 * Returns a no-op stub when no provider is mounted — safe for tests
 * and for non-mobile surfaces that import primitives.
 */
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return {
      show: () => '',
      dismiss: () => {},
    }
  }
  return ctx
}

export default useToast
