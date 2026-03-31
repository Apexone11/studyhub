/* ═══════════════════════════════════════════════════════════════════════════
 * MessagesPage.jsx — Messaging UI for StudyHub Connect
 *
 * Layout (responsive):
 *   Desktop/Tablet: split panel (340px list | flex thread) side by side
 *   Phone: single panel (list OR thread), back button to return
 *
 * Features: conversation list with search, message thread with typing indicator,
 * new conversation modal, message grouping by date, unread indicators.
 * ═══════════════════════════════════════════════════════════════════════════ */
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import UserAvatar from '../../components/UserAvatar'
import { useProtectedPage } from '../../lib/useProtectedPage'
import { useResponsiveAppLayout } from '../../lib/ui'
import { PageShell } from '../shared/pageScaffold'
import { PAGE_FONT } from '../shared/pageUtils'
import { usePageTitle } from '../../lib/usePageTitle'
import { useState, useRef, useEffect, createPortal } from 'react'
import { formatRelativeTime, formatMessageTime, formatDateSeparator, groupMessagesByDate, truncateText } from './messagesHelpers'

/* ═══════════════════════════════════════════════════════════════════════════
 * Mock data and state management (replace with real data/hooks)
 * ═══════════════════════════════════════════════════════════════════════════ */

const MOCK_CONVERSATIONS = [
  {
    id: 'conv-1',
    type: 'dm',
    participantUsername: 'alice_smith',
    participantAvatar: null,
    participantOnline: true,
    lastMessage: 'Did you finish the calc homework?',
    lastMessageTimestamp: new Date(Date.now() - 300000),
    unreadCount: 2,
  },
  {
    id: 'conv-2',
    type: 'dm',
    participantUsername: 'bob_jones',
    participantAvatar: null,
    participantOnline: false,
    lastMessage: 'Yeah, the notes really helped. Thanks!',
    lastMessageTimestamp: new Date(Date.now() - 3600000),
    unreadCount: 0,
  },
  {
    id: 'conv-3',
    type: 'group',
    groupName: 'CS101 Study Group',
    groupAvatar: null,
    lastMessage: 'Let me know if you need help with the project',
    lastMessageTimestamp: new Date(Date.now() - 86400000),
    unreadCount: 5,
  },
]

const MOCK_MESSAGES = [
  {
    id: 'msg-1',
    senderUsername: 'alice_smith',
    senderAvatar: null,
    content: 'Hey! How are you doing?',
    timestamp: new Date(Date.now() - 7200000),
    isOwn: false,
    edited: false,
    deleted: false,
  },
  {
    id: 'msg-2',
    senderUsername: 'current_user',
    senderAvatar: null,
    content: 'Great! Just working on the assignment.',
    timestamp: new Date(Date.now() - 7000000),
    isOwn: true,
    edited: false,
    deleted: false,
  },
  {
    id: 'msg-3',
    senderUsername: 'alice_smith',
    senderAvatar: null,
    content: 'Did you finish the calc homework?',
    timestamp: new Date(Date.now() - 300000),
    isOwn: false,
    edited: false,
    deleted: false,
  },
]

/* ═══════════════════════════════════════════════════════════════════════════
 * Subcomponents
 * ═══════════════════════════════════════════════════════════════════════════ */

function ConversationList({
  conversations,
  activeConversationId,
  selectConversation,
  onNewClick,
  loading,
}) {
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = conversations.filter(conv => {
    const name = conv.type === 'dm' ? conv.participantUsername : conv.groupName
    return name.toLowerCase().includes(searchQuery.toLowerCase())
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--sh-border)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 12 }}>Messages</h2>
          <button
            onClick={onNewClick}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'var(--sh-brand)',
              color: 'var(--sh-surface)',
              border: 'none',
              borderRadius: 'var(--radius-control)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: PAGE_FONT,
            }}
          >
            New
          </button>
        </div>
        <div style={{ padding: 16, color: 'var(--sh-muted)', textAlign: 'center', fontSize: 13 }}>
          Loading conversations...
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--sh-border)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 12 }}>Messages</h2>
        <button
          onClick={onNewClick}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--sh-brand)',
            color: 'var(--sh-surface)',
            border: 'none',
            borderRadius: 'var(--radius-control)',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: PAGE_FONT,
          }}
        >
          New
        </button>
        <input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            marginTop: 10,
            padding: '8px 12px',
            background: 'var(--sh-input-bg)',
            color: 'var(--sh-input-text)',
            border: '1px solid var(--sh-input-border)',
            borderRadius: 'var(--radius-control)',
            fontSize: 13,
            fontFamily: PAGE_FONT,
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-muted)', fontSize: 13 }}>
          {conversations.length === 0 ? 'No conversations yet. Start a chat!' : 'No conversations match your search.'}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.map(conv => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={activeConversationId === conv.id}
              onClick={() => selectConversation(conv.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ConversationItem({ conversation, isActive, onClick }) {
  const name = conversation.type === 'dm' ? conversation.participantUsername : conversation.groupName
  const avatar = conversation.type === 'dm' ? conversation.participantAvatar : conversation.groupAvatar
  const online = conversation.type === 'dm' ? conversation.participantOnline : false

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '12px 12px',
        background: isActive ? 'var(--sh-brand-soft)' : 'transparent',
        border: 'none',
        borderLeft: isActive ? '3px solid var(--sh-brand)' : '3px solid transparent',
        cursor: 'pointer',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        fontFamily: PAGE_FONT,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = 'var(--sh-soft)'
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'transparent'
      }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <UserAvatar
          username={name}
          avatarUrl={avatar}
          size={40}
          showStatus={conversation.type === 'dm'}
          online={online}
        />
        {conversation.unreadCount > 0 && (
          <div
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: 'var(--sh-brand)',
              color: 'var(--sh-surface)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {conversation.unreadCount}
          </div>
        )}
      </div>

      <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-heading)', marginBottom: 2 }}>
          {name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--sh-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {truncateText(conversation.lastMessage, 40)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--sh-muted)', marginTop: 4 }}>
          {formatRelativeTime(conversation.lastMessageTimestamp)}
        </div>
      </div>
    </button>
  )
}

function MessageThread({
  conversation,
  messages,
  typingUsername,
  onBack,
  loading,
  isPhone,
}) {
  const messagesEndRef = useRef(null)
  const [inputValue, setInputValue] = useState('')
  const [inputRows, setInputRows] = useState(1)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typingUsername])

  if (!conversation) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--sh-muted)' }}>
        Select a conversation to start messaging
      </div>
    )
  }

  const conversationName = conversation.type === 'dm' ? conversation.participantUsername : conversation.groupName
  const conversationAvatar = conversation.type === 'dm' ? conversation.participantAvatar : conversation.groupAvatar
  const online = conversation.type === 'dm' ? conversation.participantOnline : false

  const handleInputChange = (e) => {
    const value = e.target.value
    setInputValue(value)

    const lineCount = (value.match(/\n/g) || []).length + 1
    setInputRows(Math.min(Math.max(lineCount, 1), 4))
  }

  const handleSendMessage = () => {
    if (inputValue.trim()) {
      console.log('Send message:', inputValue)
      setInputValue('')
      setInputRows(1)
    }
  }

  const messagesByDate = groupMessagesByDate(messages)
  const dates = Object.keys(messagesByDate).sort()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--sh-surface)' }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--sh-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'var(--sh-surface)',
      }}
      >
        {isPhone && (
          <button
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--sh-brand)',
              cursor: 'pointer',
              fontSize: 20,
              padding: 0,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            chevron left
          </button>
        )}

        <UserAvatar
          username={conversationName}
          avatarUrl={conversationAvatar}
          size={32}
          showStatus={conversation.type === 'dm'}
          online={online}
        />

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>
            {conversationName}
          </div>
          {conversation.type === 'dm' && (
            <div style={{ fontSize: 11, color: online ? 'var(--sh-success)' : 'var(--sh-muted)' }}>
              {online ? 'Online' : 'Offline'}
            </div>
          )}
        </div>

        <button
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--sh-muted)',
            cursor: 'pointer',
            fontSize: 18,
            padding: '4px 8px',
          }}
        >
          ellipsis
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column' }}>
        {loading && (
          <div style={{ color: 'var(--sh-muted)', textAlign: 'center', fontSize: 13 }}>
            Loading messages...
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div style={{ color: 'var(--sh-muted)', textAlign: 'center', fontSize: 13, margin: 'auto' }}>
            No messages yet. Say hello!
          </div>
        )}

        {!loading && dates.map(date => (
          <div key={date}>
            <div style={{
              textAlign: 'center',
              margin: '16px 0 12px',
              fontSize: 11,
              color: 'var(--sh-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
            >
              {formatDateSeparator(new Date(date))}
            </div>

            {messagesByDate[date].map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        ))}

        {typingUsername && <TypingIndicator username={typingUsername} />}

        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--sh-border)', background: 'var(--sh-surface)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            value={inputValue}
            onChange={handleInputChange}
            placeholder="Type a message..."
            rows={inputRows}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: 'var(--sh-input-bg)',
              color: 'var(--sh-input-text)',
              border: '1px solid var(--sh-input-border)',
              borderRadius: 'var(--radius-control)',
              fontSize: 13,
              fontFamily: PAGE_FONT,
              resize: 'none',
              fontWeight: 500,
            }}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim()}
            style={{
              padding: '8px 16px',
              background: inputValue.trim() ? 'var(--sh-brand)' : 'var(--sh-soft)',
              color: inputValue.trim() ? 'var(--sh-surface)' : 'var(--sh-muted)',
              border: 'none',
              borderRadius: 'var(--radius-control)',
              fontSize: 13,
              fontWeight: 700,
              cursor: inputValue.trim() ? 'pointer' : 'default',
              fontFamily: PAGE_FONT,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }) {
  const bgColor = message.isOwn ? 'var(--sh-brand)' : 'var(--sh-soft)'
  const textColor = message.isOwn ? 'var(--sh-surface)' : 'var(--sh-text)'

  return (
    <div style={{
      display: 'flex',
      gap: 8,
      marginBottom: 12,
      alignItems: 'flex-end',
      flexDirection: message.isOwn ? 'row-reverse' : 'row',
    }}
    >
      <UserAvatar
        username={message.senderUsername}
        avatarUrl={message.senderAvatar}
        size={28}
      />

      <div
        style={{
          maxWidth: '60%',
          padding: '8px 12px',
          background: bgColor,
          color: textColor,
          borderRadius: 'var(--radius-control)',
          fontSize: 13,
          lineHeight: 1.5,
          wordWrap: 'break-word',
        }}
      >
        {message.deleted ? (
          <span style={{ fontStyle: 'italic', opacity: 0.6 }}>
            [Message deleted]
          </span>
        ) : (
          <>
            {message.content}
          </>
        )}

        {message.edited && (
          <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
            (edited)
          </div>
        )}

        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
          {formatMessageTime(message.timestamp)}
        </div>
      </div>
    </div>
  )
}

function TypingIndicator({ username }) {
  return (
    <div style={{
      display: 'flex',
      gap: 4,
      marginBottom: 12,
      alignItems: 'flex-end',
    }}
    >
      <UserAvatar username={username} size={28} />
      <div style={{
        padding: '8px 12px',
        background: 'var(--sh-soft)',
        color: 'var(--sh-text)',
        borderRadius: 'var(--radius-control)',
        fontSize: 13,
      }}
      >
        <span style={{ opacity: 0.7 }}>
          {username} is typing
        </span>
        <span style={{ marginLeft: 4 }}>
          ...
        </span>
      </div>
    </div>
  )
}

function NewConversationModal({ isOpen, onClose, onCreate }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUsers, setSelectedUsers] = useState([])
  const [groupName, setGroupName] = useState('')
  const [isGroup, setIsGroup] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const query = searchQuery.trim()

    if (!query) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults([])
      setLoading(false)
      return undefined
    }

    setLoading(true)
    const timer = window.setTimeout(() => {
      const mockResults = [
        { username: 'alice_smith', avatarUrl: null },
        { username: 'bob_jones', avatarUrl: null },
        { username: 'charlie_brown', avatarUrl: null },
      ].filter(u => u.username.includes(query.toLowerCase()))

      setSearchResults(mockResults)
      setLoading(false)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [searchQuery])

  const handleUserSelect = (user) => {
    if (selectedUsers.find(u => u.username === user.username)) {
      setSelectedUsers(selectedUsers.filter(u => u.username !== user.username))
    } else {
      setSelectedUsers([...selectedUsers, user])
    }
  }

  const handleCreate = () => {
    if (isGroup && (!groupName.trim() || selectedUsers.length === 0)) return
    if (!isGroup && selectedUsers.length === 0) return

    onCreate({
      isGroup,
      groupName: isGroup ? groupName : null,
      participantUsernames: selectedUsers.map(u => u.username),
    })

    setSearchQuery('')
    setSelectedUsers([])
    setGroupName('')
    setIsGroup(false)
  }

  if (!isOpen) return null

  return createPortal(
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    }}
    >
      <div style={{
        width: '90%',
        maxWidth: 450,
        background: 'var(--sh-surface)',
        borderRadius: 'var(--radius-card)',
        padding: 24,
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        fontFamily: PAGE_FONT,
      }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--sh-heading)' }}>
            Start a Conversation
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              color: 'var(--sh-muted)',
              cursor: 'pointer',
            }}
          >
            x
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 12 }}>
            <input
              type="radio"
              name="type"
              checked={!isGroup}
              onChange={() => setIsGroup(false)}
            />
            Direct Message
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input
              type="radio"
              name="type"
              checked={isGroup}
              onChange={() => setIsGroup(true)}
            />
            Group Chat
          </label>
        </div>

        {isGroup && (
          <input
            type="text"
            placeholder="Group name..."
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'var(--sh-input-bg)',
              color: 'var(--sh-input-text)',
              border: '1px solid var(--sh-input-border)',
              borderRadius: 'var(--radius-control)',
              fontSize: 13,
              fontFamily: PAGE_FONT,
              marginBottom: 12,
            }}
          />
        )}

        <input
          type="text"
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--sh-input-bg)',
            color: 'var(--sh-input-text)',
            border: '1px solid var(--sh-input-border)',
            borderRadius: 'var(--radius-control)',
            fontSize: 13,
            fontFamily: PAGE_FONT,
            marginBottom: 12,
          }}
        />

        <div style={{
          maxHeight: 200,
          overflowY: 'auto',
          marginBottom: 16,
          border: '1px solid var(--sh-border)',
          borderRadius: 'var(--radius)',
          padding: 8,
        }}
        >
          {loading && (
            <div style={{ padding: 8, color: 'var(--sh-muted)', textAlign: 'center', fontSize: 13 }}>
              Searching...
            </div>
          )}

          {!loading && searchResults.length === 0 && searchQuery && (
            <div style={{ padding: 8, color: 'var(--sh-muted)', textAlign: 'center', fontSize: 13 }}>
              No users found
            </div>
          )}

          {!loading && searchResults.map(user => (
            <button
              key={user.username}
              onClick={() => handleUserSelect(user)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: selectedUsers.find(u => u.username === user.username) ? 'var(--sh-brand-soft)' : 'transparent',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                fontSize: 13,
                borderRadius: 'var(--radius-sm)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!selectedUsers.find(u => u.username === user.username)) {
                  e.currentTarget.style.background = 'var(--sh-soft)'
                }
              }}
              onMouseLeave={(e) => {
                if (!selectedUsers.find(u => u.username === user.username)) {
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={24} />
              <span>{user.username}</span>
            </button>
          ))}
        </div>

        {selectedUsers.length > 0 && (
          <div style={{ marginBottom: 16, fontSize: 12 }}>
            <div style={{ color: 'var(--sh-muted)', marginBottom: 6 }}>
              Selected ({selectedUsers.length}):
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {selectedUsers.map(user => (
                <div
                  key={user.username}
                  style={{
                    padding: '4px 8px',
                    background: 'var(--sh-brand-soft)',
                    color: 'var(--sh-brand-hover)',
                    borderRadius: 'var(--radius-full)',
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                  }}
                >
                  {user.username}
                  <button
                    onClick={() => handleUserSelect(user)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      fontSize: 12,
                      padding: 0,
                      lineHeight: 1,
                    }}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'var(--sh-soft)',
              color: 'var(--sh-text)',
              border: '1px solid var(--sh-border)',
              borderRadius: 'var(--radius-control)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: PAGE_FONT,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isGroup ? (!groupName.trim() || selectedUsers.length === 0) : selectedUsers.length === 0}
            style={{
              padding: '8px 16px',
              background: (isGroup ? (!groupName.trim() || selectedUsers.length === 0) : selectedUsers.length === 0)
                ? 'var(--sh-soft)'
                : 'var(--sh-brand)',
              color: (isGroup ? (!groupName.trim() || selectedUsers.length === 0) : selectedUsers.length === 0)
                ? 'var(--sh-muted)'
                : 'var(--sh-surface)',
              border: 'none',
              borderRadius: 'var(--radius-control)',
              fontSize: 13,
              fontWeight: 700,
              cursor: (isGroup ? (!groupName.trim() || selectedUsers.length === 0) : selectedUsers.length === 0) ? 'default' : 'pointer',
              fontFamily: PAGE_FONT,
            }}
          >
            Start Chat
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Main MessagesPage
 * ═══════════════════════════════════════════════════════════════════════════ */

export default function MessagesPage() {
  usePageTitle('Messages')
  const { status: authStatus, error: authError } = useProtectedPage()
  const layout = useResponsiveAppLayout()

  const [conversations] = useState(MOCK_CONVERSATIONS)
  const [activeConversationId, setActiveConversationId] = useState(MOCK_CONVERSATIONS[0]?.id || null)
  const [messages] = useState(MOCK_MESSAGES)
  const [typingUsername] = useState(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [loading] = useState(false)

  const activeConversation = conversations.find(c => c.id === activeConversationId)

  const showListPanel = !layout.isPhone || !activeConversationId
  const showThreadPanel = !layout.isPhone || activeConversationId

  if (authStatus === 'loading') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--sh-muted)',
        fontFamily: PAGE_FONT,
      }}
      >
        Loading...
      </div>
    )
  }

  return (
    <PageShell nav={<Navbar crumbs={[{ label: 'Messages', to: '/messages' }]} hideTabs />} sidebar={<AppSidebar />}>
      {authError && (
        <div style={{
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

      <div className="messages-split-panel">
        {showListPanel && (
          <div style={{ minWidth: 0 }}>
            <ConversationList
              conversations={conversations}
              activeConversationId={activeConversationId}
              selectConversation={setActiveConversationId}
              onNewClick={() => setShowNewModal(true)}
              loading={loading}
              layout={layout}
            />
          </div>
        )}

        {showThreadPanel && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <MessageThread
              conversation={activeConversation}
              messages={messages}
              typingUsername={typingUsername}
              onBack={() => setActiveConversationId(null)}
              loading={loading}
              isPhone={layout.isPhone}
            />
          </div>
        )}
      </div>

      <NewConversationModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreate={(data) => {
          console.log('Create conversation:', data)
          setShowNewModal(false)
        }}
      />
    </PageShell>
  )
}
