/**
 * Tiny shared-state context so components outside the Navbar subtree can
 * observe whether the Messages chat panel is open.
 *
 * Why this exists: Navbar.jsx owns the `chatOpen` local state that controls
 * the slide-out ChatPanel. AiBubble.jsx is rendered at the app root
 * (App.jsx -> AuthenticatedBubble), so it cannot see Navbar's state. We need
 * a cross-tree signal to let AiBubble hide itself when the chat panel opens
 * (and also when the user is on the full Messages page).
 *
 * Non-component exports (context object, useChatPanel hook) live in the
 * sibling .js file to satisfy react-refresh/only-export-components.
 */
import { useCallback, useMemo, useState } from 'react'
import { ChatPanelContext } from './chatPanelContext'

export function ChatPanelProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)

  const setOpen = useCallback((value) => {
    setIsOpen(Boolean(value))
  }, [])

  const value = useMemo(() => ({ isOpen, setOpen }), [isOpen, setOpen])

  return (
    <ChatPanelContext.Provider value={value}>
      {children}
    </ChatPanelContext.Provider>
  )
}
