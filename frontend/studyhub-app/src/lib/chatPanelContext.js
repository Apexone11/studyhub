/**
 * Non-component exports for the chat panel context. The provider component
 * lives in chatPanelContext.jsx; this file holds the raw context object and
 * the hook so the .jsx file can satisfy react-refresh/only-export-components.
 */
import { createContext, useContext } from 'react'

export const ChatPanelContext = createContext({
  isOpen: false,
  setOpen: () => {},
})

export function useChatPanel() {
  return useContext(ChatPanelContext)
}
