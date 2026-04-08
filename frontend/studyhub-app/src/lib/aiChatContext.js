/**
 * useSharedAiChat -- Hook to consume the shared AI chat context.
 *
 * Extracted from AiChatProvider.jsx to satisfy react-refresh/only-export-components.
 */
import { createContext, useContext } from 'react'

export const AiChatContext = createContext(null)

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
  truncated: false,
  error: null,
  usage: null,
  loadingConversations: false,
  sendMessage: () => {},
  continueGeneration: () => {},
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
    if (import.meta.env.DEV) {
      console.warn('[useSharedAiChat] No AiChatProvider found -- returning inert fallback.')
    }
    return INERT_CHAT
  }
  return ctx
}
