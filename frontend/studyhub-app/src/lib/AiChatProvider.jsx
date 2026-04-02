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
import { useAiChat } from './useAiChat'
import { AiChatContext, useSharedAiChat } from './aiChatContext'

// Re-export hook for backward compatibility
export { useSharedAiChat }

export function AiChatProvider({ children }) {
  const chat = useAiChat()
  return (
    <AiChatContext.Provider value={chat}>
      {children}
    </AiChatContext.Provider>
  )
}
