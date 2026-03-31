/* ─────────────────────────────────────────────────────────────
 * ConversationList.jsx
 * Conversation list with search and ConversationItem sub-component
 * ───────────────────────────────────────────────────────────── */
import { useState, useRef, useEffect } from 'react'
import UserAvatar from '../../../components/UserAvatar'
import { getConversationDisplayName, getConversationAvatar, formatRelativeTime, truncateText } from '../messagesHelpers'
import { PAGE_FONT } from '../../shared/pageUtils'

function ConversationItem({ conversation, isActive, onClick, onDelete, currentUserId }) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)

  // Close menu on click outside
  useEffect(() => {
    if (!showMenu) return
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  const name = getConversationDisplayName(conversation, currentUserId)
  const avatar = getConversationAvatar(conversation, currentUserId)
  const lastMsg = conversation.lastMessage
  const lastMsgText = lastMsg
    ? (lastMsg.content || lastMsg.sender?.username || '')
    : ''

  return (
    <div style={{ position: 'relative' }} role="listitem">
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
            {truncateText(lastMsgText, 40)}
          </div>
          {lastMsg?.createdAt && (
            <div style={{ fontSize: 11, color: 'var(--sh-muted)', marginTop: 4 }}>
              {formatRelativeTime(lastMsg.createdAt)}
            </div>
          )}
        </div>

        {/* Context menu trigger */}
        <div
          onClick={(e) => {
            e.stopPropagation()
            setShowMenu(!showMenu)
          }}
          style={{
            flexShrink: 0,
            padding: '2px 4px',
            cursor: 'pointer',
            color: 'var(--sh-muted)',
            borderRadius: 4,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        </div>
      </button>

      {showMenu && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            zIndex: 100,
            padding: 4,
            minWidth: 140,
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(false)
              onDelete()
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--sh-danger-text)',
              textAlign: 'left',
              borderRadius: 6,
              fontFamily: PAGE_FONT,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sh-danger-bg)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            Delete Conversation
          </button>
        </div>
      )}
    </div>
  )
}

export function ConversationList({
  conversations,
  activeConversationId,
  selectConversation,
  onNewClick,
  onDeleteConversation,
  loading,
  currentUserId,
}) {
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = conversations.filter((conv) => {
    const name = getConversationDisplayName(conv, currentUserId)
    return name.toLowerCase().includes(searchQuery.toLowerCase())
  })

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
          aria-label="Start new conversation"
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
          aria-label="Search conversations"
        />
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-muted)', fontSize: 13 }}>
          Loading conversations...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-muted)', fontSize: 13 }}>
          {conversations.length === 0 ? 'No conversations yet. Start a chat!' : 'No conversations match your search.'}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }} role="list">
          {filtered.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={activeConversationId === conv.id}
              onClick={() => selectConversation(conv.id)}
              onDelete={() => onDeleteConversation(conv.id)}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
