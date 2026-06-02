/**
 * Non-component exports for the messages-unread context. The provider
 * component lives in unreadContext.jsx; this file holds the raw context
 * object and the hook so the .jsx file can satisfy
 * react-refresh/only-export-components.
 */
import { createContext, useContext } from 'react'

export const UnreadContext = createContext({ total: 0, refresh: () => {} })

export function useUnread() {
  return useContext(UnreadContext)
}
