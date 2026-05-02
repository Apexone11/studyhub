/* ═══════════════════════════════════════════════════════════════════════════
 * MessagesPage.jsx — Messaging UI for StudyHub Connect
 *
 * Thin orchestrator that wires up the messaging interface.
 * Layout (responsive):
 *   Desktop/Tablet: split panel (340px list | flex thread) side by side
 *   Phone: single panel (list OR thread), back button to return
 *
 * Wired to real API via useMessagingData hook + useSocket for real-time.
 * ═══════════════════════════════════════════════════════════════════════════ */
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import SafeJoyride from '../../components/SafeJoyride'
import { useProtectedPage } from '../../lib/useProtectedPage'
import { useResponsiveAppLayout } from '../../lib/ui'
import { useTutorial } from '../../lib/useTutorial'
import { MESSAGES_STEPS, TUTORIAL_VERSIONS } from '../../lib/tutorialSteps'
import { PageShell } from '../shared/pageScaffold'
import { PAGE_FONT } from '../shared/pageUtils'
import { usePageTitle } from '../../lib/usePageTitle'
import { useSession } from '../../lib/session-context'
import { useSocket } from '../../lib/useSocket'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMessagingData } from './useMessagingData'
import { SkeletonList, SkeletonCard } from '../../components/Skeleton'

// Sub-components from ./components/
import { ConversationList } from './components/ConversationList'
import { MessageThread } from './components/MessageThread'
import { NewConversationModal } from './components/NewConversationModal'
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal'

/* ═══════════════════════════════════════════════════════════════════════════
 * Main MessagesPage
 * ═══════════════════════════════════════════════════════════════════════════ */

export default function MessagesPage() {
  usePageTitle('Messages')
  const { status: authStatus, error: authError } = useProtectedPage()
  const { user } = useSession()
  const layout = useResponsiveAppLayout()
  const tutorial = useTutorial('messages', MESSAGES_STEPS, { version: TUTORIAL_VERSIONS.messages })
  const { socket, connectionError: socketError } = useSocket()

  const currentUserId = user?.id || null

  const {
    conversations,
    activeConversation,
    messages,
    loadingConversations,
    loadingMessages,
    typingUsers,
    loadConversations,
    selectConversation,
    sendMessage,
    startConversation,
    editMessage,
    deleteMessage,
    deleteConversation,
    setActiveConversation,
    emitTypingStart,
    archiveConversation,
    unarchiveConversation,
    muteConversation,
    blockUser,
    sendBlocked,
    // Requests
    messageRequests,
    totalPending,
    loadRequests,
    acceptRequest,
    declineRequest,
    // Archived
    archivedConversations,
    archivedCount,
    loadArchived,
  } = useMessagingData(socket, currentUserId)

  const [showNewModal, setShowNewModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const dmInitRef = useRef(false)

  // Load conversations, requests, and archived on mount
  useEffect(() => {
    if (user) {
      loadConversations()
      loadRequests()
      loadArchived()
    }
  }, [user, loadConversations, loadRequests, loadArchived])

  // Auto-start DM if navigated with ?dm=userId from profile
  useEffect(() => {
    const dmUserId = searchParams.get('dm')
    if (!dmUserId || !user || dmInitRef.current) return
    dmInitRef.current = true

    const targetId = Number.parseInt(dmUserId, 10)
    if (!Number.isInteger(targetId) || targetId < 1 || targetId === currentUserId) return

    // Clear the dm param from URL
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('dm')
        return next
      },
      { replace: true },
    )

    // Start or open existing DM
    startConversation([targetId], 'dm')
      .then((conv) => {
        if (conv) selectConversation(conv.id)
      })
      .catch(() => {
        // Silent failure -- DM auto-start is best-effort
      })
  }, [searchParams, user, currentUserId, startConversation, selectConversation, setSearchParams])

  // Get typing usernames for current conversation
  const typingUsernames = activeConversation
    ? Array.from(typingUsers.get(activeConversation.id) || [])
    : []

  const handleCreateConversation = useCallback(
    async (data) => {
      const conv = await startConversation(
        data.participantIds,
        data.isGroup ? 'group' : 'dm',
        data.groupName,
      )
      if (conv) {
        setShowNewModal(false)
        selectConversation(conv.id)
      }
    },
    [startConversation, selectConversation],
  )

  const handleBlockUser = useCallback(
    async (conversation) => {
      if (!conversation || conversation.type !== 'dm') return
      const other = conversation.participants?.find((p) => p.id !== currentUserId)
      if (!other?.username) return
      const confirmed = window.confirm(
        `Block ${other.username}? They will no longer be able to message you.`,
      )
      if (!confirmed) return
      const success = await blockUser(other.username)
      if (success) {
        // Remove conversation from list
        deleteConversation(conversation.id)
      }
    },
    [currentUserId, blockUser, deleteConversation],
  )

  const handleDeleteConversation = useCallback(() => {
    if (deleteTarget) {
      deleteConversation(deleteTarget)
      setDeleteTarget(null)
    }
  }, [deleteTarget, deleteConversation])

  const showListPanel = !layout.isPhone || !activeConversation
  const showThreadPanel = !layout.isPhone || activeConversation

  if (authStatus === 'loading') {
    return (
      <PageShell
        nav={<Navbar crumbs={[{ label: 'Messages', to: '/messages' }]} hideTabs />}
        sidebar={<AppSidebar />}
      >
        <div className="messages-split-panel">
          <div data-tutorial="messages-conversations" style={{ minWidth: 0 }}>
            <div
              style={{
                background: 'var(--sh-surface)',
                borderRadius: 16,
                border: '1px solid var(--sh-border)',
                padding: '20px 22px',
              }}
            >
              <SkeletonList count={5} />
            </div>
          </div>
          <div data-tutorial="messages-compose" style={{ minWidth: 0, flex: 1 }}>
            <SkeletonCard />
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      nav={<Navbar crumbs={[{ label: 'Messages', to: '/messages' }]} hideTabs />}
      sidebar={<AppSidebar />}
    >
      {authError && (
        <div
          style={{
            background: 'var(--sh-warning-bg)',
            border: '1px solid var(--sh-warning-border)',
            color: 'var(--sh-warning-text)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {authError}
        </div>
      )}

      {socketError && (
        <div
          role="alert"
          style={{
            background: 'var(--sh-info-bg)',
            border: '1px solid var(--sh-info-border)',
            color: 'var(--sh-info-text)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 12,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--sh-warning-text)',
              flexShrink: 0,
            }}
          />
          {socketError}
        </div>
      )}

      <div className="messages-split-panel">
        {showListPanel && (
          <div data-tutorial="messages-conversations" style={{ minWidth: 0 }}>
            <ConversationList
              conversations={conversations}
              activeConversationId={activeConversation?.id}
              selectConversation={selectConversation}
              onNewClick={() => setShowNewModal(true)}
              onDeleteConversation={(id) => setDeleteTarget(id)}
              onMuteConversation={muteConversation}
              onArchiveConversation={archiveConversation}
              onBlockUser={handleBlockUser}
              loading={loadingConversations}
              currentUserId={currentUserId}
              messageRequests={messageRequests}
              totalPending={totalPending}
              onAcceptRequest={acceptRequest}
              onDeclineRequest={declineRequest}
              archivedConversations={archivedConversations}
              archivedCount={archivedCount}
              onUnarchiveConversation={unarchiveConversation}
            />
          </div>
        )}

        {showThreadPanel && (
          <div data-tutorial="messages-compose" style={{ minWidth: 0, flex: 1 }}>
            <MessageThread
              conversation={activeConversation}
              messages={messages}
              typingUsernames={typingUsernames}
              onBack={() => setActiveConversation(null)}
              onSend={sendMessage}
              onDeleteMessage={deleteMessage}
              onEditMessage={editMessage}
              onTypingStart={emitTypingStart}
              loadingMessages={loadingMessages}
              isPhone={layout.isPhone}
              currentUserId={currentUserId}
              onMute={muteConversation}
              onArchive={archiveConversation}
              onBlock={handleBlockUser}
              sendBlocked={sendBlocked}
            />
          </div>
        )}
      </div>

      <div>
        <NewConversationModal
          isOpen={showNewModal}
          onClose={() => setShowNewModal(false)}
          onCreate={handleCreateConversation}
          currentUserId={currentUserId}
        />
      </div>

      <ConfirmDeleteModal
        isOpen={deleteTarget !== null}
        onConfirm={handleDeleteConversation}
        onCancel={() => setDeleteTarget(null)}
      />

      <SafeJoyride {...tutorial.joyrideProps} />
    </PageShell>
  )
}
