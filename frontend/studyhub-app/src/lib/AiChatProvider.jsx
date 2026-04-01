/**
 * AiChatProvider.jsx -- Shared context for Hub AI chat state.
 *
 * Wraps useAiChat() in a React context so both AiBubble and AiPage
 * share the same conversation list, active conversation, messages,
 * streaming state, and usage data. Without this, each component
 * creates its own independent hook instance and they diverge.
 *
 * Usage:
 *   <AiChatProvider>
 *     <AiBubble />     -- reads shared state
 *     <AiPage />       -- reads/writes the same shared state
 *   </AiChatProvider>
 */
import { createContext, useContext } from 'react'
import { useAiChat } from './useAiChat'

const AiChatContext = createContext(null)

export function AiChatProvider({ children }) {
  const chat = useAiChat()
  return (
    <AiChatContext.Provider value={chat}>
      {children}
    </AiChatContext.Provider>
  )
}

/**
 * Hook to consume the shared AI chat state.
 * Falls back to creating a standalone instance if rendered outside the provider
 * (should not happen in production, but keeps things safe during dev).
 */
export function useSharedAiChat() {
  const ctx = useContext(AiChatContext)
  if (!ctx) {
    throw new Error('useSharedAiChat must be used within an AiChatProvider')
  }
  return ctx
}
