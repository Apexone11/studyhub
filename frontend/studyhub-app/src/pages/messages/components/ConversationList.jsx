/* ─────────────────────────────────────────────────────────────
 * ConversationList.jsx
 * Conversation list with search, message requests, archived,
 * and kebab menu (mute/archive/block) per conversation
 * ───────────────────────────────────────────────────────────── */
import { useState, useRef, useEffect } from 'react'
import UserAvatar from '../../../components/UserAvatar'
import {
  getConversationDisplayName,
  getConversationAvatar,
  formatRelativeTime,
  truncateText,
} from '../messagesHelpers'
import { PAGE_FONT } from '../../shared/pageUtils'

/* ── SVG icon helpers ──────────────────────────────────────────────── */

function KebabIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  )
}

function MutedIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
      <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
      <path d="M18 8a6 6 0 0 0-9.33-5" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function BackArrowIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  )
}

/* ── Dropdown menu item ────────────────────────────────────────────── */

function MenuItem({ label, onClick, danger = false }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      style={{
        width: '100%',
        padding: '8px 12px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
        color: danger ? 'var(--sh-danger-text)' : 'var(--sh-text)',
        textAlign: 'left',
        borderRadius: 6,
        fontFamily: PAGE_FONT,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? 'var(--sh-danger-bg)' : 'var(--sh-soft)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {label}
    </button>
  )
}

/* ── Request item ──────────────────────────────────────────────────── */

function RequestItem({ request, onAccept, onDecline, currentUserId }) {
  const name = getConversationDisplayName(request, currentUserId)
  const avatar = getConversationAvatar(request, currentUserId)
  const other = request.participants?.find((p) => p.id !== currentUserId)
  const preview = request.lastMessage?.content || ''

  return (
    <div
      style={{
        padding: '12px 12px',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        borderBottom: '1px solid var(--sh-border)',
      }}
    >
      <a
        href={other ? `/users/${other.username}` : '#'}
        target="_blank"
        rel="noopener noreferrer"
        style={{ flexShrink: 0, textDecoration: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        <UserAvatar username={name} avatarUrl={avatar} size={40} />
      </a>

      <div style={{ flex: 1, minWidth: 0 }}>
        <a
          href={other ? `/users/${other.username}` : '#'}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--sh-heading)',
            textDecoration: 'none',
            display: 'block',
            marginBottom: 2,
          }}
        >
          {name}
        </a>
        <div
          style={{
            fontSize: 12,
            color: 'var(--sh-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {truncateText(preview, 40)}
        </div>
        {request.lastMessage?.createdAt && (
          <div style={{ fontSize: 11, color: 'var(--sh-muted)', marginTop: 2 }}>
            {formatRelativeTime(request.lastMessage.createdAt)}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onAccept()
          }}
          aria-label="Accept request"
          title="Accept"
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: 'var(--sh-success-bg)',
            color: 'var(--sh-success-text)',
            border: '1px solid var(--sh-success-border)',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <CheckIcon />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDecline()
          }}
          aria-label="Decline request"
          title="Decline"
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: 'var(--sh-danger-bg)',
            color: 'var(--sh-danger-text)',
            border: '1px solid var(--sh-danger-border)',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <XIcon />
        </button>
      </div>
    </div>
  )
}

/* ── Conversation item with kebab menu ─────────────────────────────── */

function ConversationItem({
  conversation,
  isActive,
  onClick,
  onDelete,
  onMute,
  onArchive,
  onBlock,
  currentUserId,
}) {
  const [showMenu, setShowMenu] = useState(false)
  const [hovered, setHovered] = useState(false)
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
  const lastMsgText = lastMsg ? lastMsg.content || lastMsg.sender?.username || '' : ''
  const hasUnread = conversation.unreadCount > 0
  const isMuted = !!conversation.muted
  const isDM = conversation.type === 'dm'

  return (
    <div
      style={{ position: 'relative', padding: '0 14px 10px' }}
      role="listitem"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onClick}
        style={{
          width: '100%',
          padding: '14px 14px',
          background: isActive
            ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.14), rgba(124, 58, 237, 0.1))'
            : 'var(--sh-surface)',
          border: isActive ? '1px solid var(--sh-brand-border)' : '1px solid var(--sh-border)',
          borderLeft: 'none',
          borderRadius: 18,
          cursor: 'pointer',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          fontFamily: PAGE_FONT,
          boxShadow: isActive ? '0 16px 32px rgba(37, 99, 235, 0.08)' : 'var(--shadow-sm)',
          transition: 'background 0.15s, border-color 0.15s, transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'var(--sh-soft)'
            e.currentTarget.style.borderColor = 'var(--sh-border-strong)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'var(--sh-surface)'
            e.currentTarget.style.borderColor = 'var(--sh-border)'
            e.currentTarget.style.transform = 'translateY(0)'
          }
        }}
      >
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <UserAvatar username={name} avatarUrl={avatar} size={40} />
          {conversation.unreadCount > 0 && (
            <span
              aria-label={`${conversation.unreadCount} unread`}
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 18,
                height: 18,
                borderRadius: 99,
                background: 'var(--sh-danger)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                padding: '0 4px',
                lineHeight: 1,
                border: '2px solid var(--sh-surface)',
              }}
            >
              {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
            </span>
          )}
        </div>

        <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: hasUnread ? 800 : 600,
              color: 'var(--sh-heading)',
              marginBottom: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </span>
            {isMuted && (
              <span title="Muted" style={{ color: 'var(--sh-muted)' }}>
                <MutedIcon />
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 12,
              color: hasUnread ? 'var(--sh-text)' : 'var(--sh-muted)',
              fontWeight: hasUnread ? 600 : 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {truncateText(lastMsgText, 40)}
          </div>
          {lastMsg?.createdAt && (
            <div style={{ fontSize: 11, color: 'var(--sh-muted)', marginTop: 4 }}>
              {formatRelativeTime(lastMsg.createdAt)}
            </div>
          )}
        </div>

        {/* Kebab menu trigger -- visible on hover or when menu is open */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowMenu(!showMenu)
          }}
          aria-label="Conversation options"
          aria-haspopup="menu"
          aria-expanded={showMenu}
          style={{
            flexShrink: 0,
            padding: '2px 4px',
            cursor: 'pointer',
            color: 'var(--sh-muted)',
            borderRadius: 999,
            background: showMenu ? 'var(--sh-soft)' : 'transparent',
            border: 'none',
            opacity: hovered || showMenu ? 1 : 0,
            transition: 'opacity 0.15s',
          }}
        >
          <KebabIcon />
        </button>
      </button>

      {showMenu && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            top: 12,
            right: 24,
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            borderRadius: 12,
            boxShadow: '0 18px 36px rgba(15, 23, 42, 0.16)',
            zIndex: 100,
            padding: 6,
            minWidth: 160,
          }}
        >
          <MenuItem
            label={isMuted ? 'Unmute' : 'Mute'}
            onClick={() => {
              setShowMenu(false)
              onMute(conversation.id, !isMuted)
            }}
          />
          <MenuItem
            label="Archive"
            onClick={() => {
              setShowMenu(false)
              onArchive(conversation.id)
            }}
          />
          {isDM && (
            <MenuItem
              label="Block User"
              onClick={() => {
                setShowMenu(false)
                onBlock(conversation)
              }}
              danger
            />
          )}
          <MenuItem
            label="Delete Conversation"
            onClick={() => {
              setShowMenu(false)
              onDelete()
            }}
            danger
          />
        </div>
      )}
    </div>
  )
}

/* ── Archived conversation item ────────────────────────────────────── */

function ArchivedItem({ conversation, onUnarchive, currentUserId }) {
  const name = getConversationDisplayName(conversation, currentUserId)
  const avatar = getConversationAvatar(conversation, currentUserId)

  return (
    <div
      style={{
        padding: '10px 12px',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        borderBottom: '1px solid var(--sh-border)',
      }}
    >
      <UserAvatar username={name} avatarUrl={avatar} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--sh-heading)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
      </div>
      <button
        onClick={() => onUnarchive(conversation.id)}
        title="Unarchive"
        style={{
          padding: '6px 12px',
          background: 'var(--sh-soft)',
          border: '1px solid var(--sh-border)',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--sh-text)',
          fontFamily: PAGE_FONT,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--sh-brand-soft)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--sh-soft)'
        }}
      >
        Unarchive
      </button>
    </div>
  )
}

/* ── Main ConversationList ─────────────────────────────────────────── */

export function ConversationList({
  conversations,
  activeConversationId,
  selectConversation,
  onNewClick,
  onDeleteConversation,
  onMuteConversation,
  onArchiveConversation,
  onBlockUser,
  loading,
  currentUserId,
  // Requests
  messageRequests,
  totalPending,
  onAcceptRequest,
  onDeclineRequest,
  // Archived
  archivedConversations,
  archivedCount,
  onUnarchiveConversation,
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [view, setView] = useState('main') // 'main' | 'requests' | 'archived'

  const filtered = conversations.filter((conv) => {
    const name = getConversationDisplayName(conv, currentUserId)
    return name.toLowerCase().includes(searchQuery.toLowerCase())
  })

  /* ── Requests view ──────────────────────────────────────────── */
  if (view === 'requests') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: 'var(--sh-bg)',
        }}
      >
        <div
          style={{
            padding: 18,
            borderBottom: '1px solid var(--sh-border)',
            display: 'grid',
            gap: 10,
            background: 'linear-gradient(180deg, rgba(37, 99, 235, 0.06), transparent)',
          }}
        >
          <button
            onClick={() => setView('main')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--sh-brand)',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: PAGE_FONT,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginBottom: 10,
            }}
          >
            <BackArrowIcon /> Back to Messages
          </button>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--sh-heading)', margin: 0 }}>
            Message Requests
          </h2>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--sh-muted)' }}>
            Review who wants to start a conversation before they enter your main inbox.
          </p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {messageRequests.length === 0 ? (
            <div
              style={{ padding: 24, textAlign: 'center', color: 'var(--sh-muted)', fontSize: 13 }}
            >
              No pending requests.
            </div>
          ) : (
            messageRequests.map((req) => (
              <RequestItem
                key={req.id}
                request={req}
                onAccept={() => onAcceptRequest(req.id)}
                onDecline={() => onDeclineRequest(req.id)}
                currentUserId={currentUserId}
              />
            ))
          )}
        </div>
      </div>
    )
  }

  /* ── Archived view ──────────────────────────────────────────── */
  if (view === 'archived') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: 'var(--sh-bg)',
        }}
      >
        <div
          style={{
            padding: 18,
            borderBottom: '1px solid var(--sh-border)',
            display: 'grid',
            gap: 10,
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.04), transparent)',
          }}
        >
          <button
            onClick={() => setView('main')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--sh-brand)',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: PAGE_FONT,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginBottom: 10,
            }}
          >
            <BackArrowIcon /> Back to Messages
          </button>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--sh-heading)', margin: 0 }}>
            Archived
          </h2>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--sh-muted)' }}>
            Bring older threads back whenever you need the context again.
          </p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {archivedConversations.length === 0 ? (
            <div
              style={{ padding: 24, textAlign: 'center', color: 'var(--sh-muted)', fontSize: 13 }}
            >
              No archived conversations.
            </div>
          ) : (
            archivedConversations.map((conv) => (
              <ArchivedItem
                key={conv.id}
                conversation={conv}
                onUnarchive={onUnarchiveConversation}
                currentUserId={currentUserId}
              />
            ))
          )}
        </div>
      </div>
    )
  }

  /* ── Main conversation list view ────────────────────────────── */
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--sh-bg)',
      }}
    >
      <div
        style={{
          padding: 18,
          borderBottom: '1px solid var(--sh-border)',
          display: 'grid',
          gap: 12,
          background: 'linear-gradient(180deg, rgba(37, 99, 235, 0.06), transparent)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--sh-heading)', margin: 0 }}>
              Messages
            </h2>
            <p
              style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--sh-muted)' }}
            >
              Jump between DMs, groups, requests, and archived threads from one place.
            </p>
          </div>
          <button
            data-tutorial="messages-new"
            onClick={onNewClick}
            style={{
              padding: '10px 16px',
              background: 'linear-gradient(135deg, var(--sh-brand), var(--sh-brand-hover))',
              color: 'var(--sh-surface)',
              border: 'none',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: PAGE_FONT,
              boxShadow: '0 12px 24px rgba(37, 99, 235, 0.18)',
              whiteSpace: 'nowrap',
            }}
            aria-label="Start new conversation"
          >
            New Chat
          </button>
        </div>
        <input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: 'var(--sh-input-bg)',
            color: 'var(--sh-input-text)',
            border: '1px solid var(--sh-input-border)',
            borderRadius: 14,
            fontSize: 13,
            fontFamily: PAGE_FONT,
          }}
          aria-label="Search conversations"
        />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => totalPending > 0 && setView('requests')}
            disabled={totalPending === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 999,
              border: '1px solid var(--sh-border)',
              background: totalPending > 0 ? 'var(--sh-info-bg)' : 'var(--sh-surface)',
              color: totalPending > 0 ? 'var(--sh-info-text)' : 'var(--sh-muted)',
              fontSize: 12,
              fontWeight: 700,
              cursor: totalPending > 0 ? 'pointer' : 'default',
              fontFamily: PAGE_FONT,
            }}
          >
            Requests
            <span
              style={{
                minWidth: 20,
                height: 20,
                borderRadius: 99,
                background: totalPending > 0 ? 'var(--sh-brand)' : 'var(--sh-soft)',
                color: totalPending > 0 ? '#fff' : 'var(--sh-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                padding: '0 6px',
              }}
            >
              {totalPending}
            </span>
          </button>

          <button
            type="button"
            onClick={() => archivedCount > 0 && setView('archived')}
            disabled={archivedCount === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 999,
              border: '1px solid var(--sh-border)',
              background: 'var(--sh-surface)',
              color: archivedCount > 0 ? 'var(--sh-text)' : 'var(--sh-muted)',
              fontSize: 12,
              fontWeight: 700,
              cursor: archivedCount > 0 ? 'pointer' : 'default',
              fontFamily: PAGE_FONT,
            }}
          >
            <ArchiveIcon /> Archived ({archivedCount})
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-muted)', fontSize: 13 }}>
          Loading conversations...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-muted)', fontSize: 13 }}>
          {conversations.length === 0
            ? 'No conversations yet. Start a chat!'
            : 'No conversations match your search.'}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', paddingTop: 12 }} role="list">
          {filtered.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={activeConversationId === conv.id}
              onClick={() => selectConversation(conv.id)}
              onDelete={() => onDeleteConversation(conv.id)}
              onMute={onMuteConversation}
              onArchive={onArchiveConversation}
              onBlock={onBlockUser}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
