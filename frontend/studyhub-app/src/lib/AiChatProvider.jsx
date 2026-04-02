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
 * Inert fallback returned when AiBubble renders outside AiChatProvider.
 * Every property the bubble reads is present with a safe default so the
 * component can mount without crashing. This is defensive -- in production
 * the provider should always be present, but edge cases (route transitions,
 * error recovery) can momentarily render the bubble outside the tree.
 */
const INERT_CHAT = Object.freeze({
  conversations: [],
  activeConversationId: null,
  messages: [],
  loading: false,
  streaming: false,
  streamingText: '',
  error: null,
  usage: null,
  loadingConversations: false,
  sendMessage: () => {},
  stopStreaming: () => {},
  startNewConversation: () => {},
  selectConversation: () => {},
  deleteConversation: () => {},
})

/**
 * Hook to consume the shared AI chat state.
 * Returns an inert no-op object if rendered outside the provider instead of
 * throwing, which prevents the AiBubble from crashing host pages.
 */
export function useSharedAiChat() {
  const ctx = useContext(AiChatContext)
  if (!ctx) {
    console.warn('[useSharedAiChat] No AiChatProvider found -- returning inert fallback.')
    return INERT_CHAT
  }
  return ctx
}
