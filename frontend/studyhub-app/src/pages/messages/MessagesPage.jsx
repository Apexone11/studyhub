/* ═══════════════════════════════════════════════════════════════════════════
 * MessagesPage.jsx — Messaging UI for StudyHub Connect
 *
 * Layout (responsive):
 *   Desktop/Tablet: split panel (340px list | flex thread) side by side
 *   Phone: single panel (list OR thread), back button to return
 *
 * Wired to real API via useMessagingData hook + useSocket for real-time.
 * Features: conversation list with search, message thread with typing indicator,
 * new conversation modal, message grouping by date, delete conversation,
 * message context menu (edit/delete), unread indicators, user avatars.
 * ═══════════════════════════════════════════════════════════════════════════ */
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import UserAvatar from '../../components/UserAvatar'
import { useProtectedPage } from '../../lib/useProtectedPage'
import { useResponsiveAppLayout } from '../../lib/ui'
import { PageShell } from '../shared/pageScaffold'
import { PAGE_FONT } from '../shared/pageUtils'
import { usePageTitle } from '../../lib/usePageTitle'
import { useSession } from '../../lib/session-context'
import { useSocket } from '../../lib/useSocket'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import {
  formatRelativeTime,
  formatMessageTime,
  formatDateSeparator,
  groupMessagesByDate,
  truncateText,
  getConversationDisplayName,
  getConversationAvatar,
} from './messagesHelpers'
import { useMessagingData } from './useMessagingData'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'

/* ═══════════════════════════════════════════════════════════════════════════
 * Subcomponents
 * ═══════════════════════════════════════════════════════════════════════════ */

function ConversationList({
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

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-muted)', fontSize: 13 }}>
          Loading conversations...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-muted)', fontSize: 13 }}>
          {conversations.length === 0 ? 'No conversations yet. Start a chat!' : 'No conversations match your search.'}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
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
    <div style={{ position: 'relative' }}>
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

/* ── GIF Search Panel ───────────────────────────────────────────────── */
function GifSearchPanel({ onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef(null)

  // Derived: if query is empty, results are empty (no effect needed)
  const trimmedQuery = query.trim()
  const displayResults = trimmedQuery ? results : []
  const displayLoading = trimmedQuery ? loading : false

  useEffect(() => {
    if (!trimmedQuery) return undefined

    let cancelled = false
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      if (cancelled) return
      setLoading(true)
      try {
        const resp = await fetch(
          `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(trimmedQuery)}&key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&client_key=studyhub&limit=12&media_filter=tinygif,gif`
        )
        if (resp.ok && !cancelled) {
          const data = await resp.json()
          const gifs = (data.results || []).map((item) => ({
            id: item.id,
            preview: item.media_formats?.tinygif?.url || item.media_formats?.gif?.url || '',
            full: item.media_formats?.gif?.url || item.media_formats?.tinygif?.url || '',
            title: item.content_description || 'GIF',
          }))
          setResults(gifs)
        }
      } catch { /* silent */ }
      if (!cancelled) setLoading(false)
    }, 400)
    return () => { cancelled = true; if (timerRef.current) clearTimeout(timerRef.current) }
  }, [trimmedQuery])

  return (
    <div style={{
      marginBottom: 8, padding: '10px 12px',
      background: 'var(--sh-soft)', borderRadius: 'var(--radius-control)',
      border: '1px solid var(--sh-border)', maxHeight: 380, display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sh-heading)', fontFamily: PAGE_FONT }}>Search GIFs</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sh-muted)', fontSize: 12, fontFamily: PAGE_FONT }}>Cancel</button>
      </div>
      <input
        type="text"
        placeholder="Search for GIFs..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        style={{
          width: '100%', padding: '6px 10px', marginBottom: 6,
          background: 'var(--sh-input-bg)', color: 'var(--sh-input-text)',
          border: '1px solid var(--sh-input-border)', borderRadius: 'var(--radius-control)',
          fontSize: 12, fontFamily: PAGE_FONT, boxSizing: 'border-box',
        }}
      />
      <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {displayLoading && <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--sh-muted)', fontSize: 12, padding: 8 }}>Searching...</div>}
        {!displayLoading && displayResults.length === 0 && trimmedQuery && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--sh-muted)', fontSize: 12, padding: 8 }}>No GIFs found</div>
        )}
        {displayResults.map((gif) => (
          <button
            key={gif.id}
            onClick={() => onSelect(gif)}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
              borderRadius: 6, overflow: 'hidden',
            }}
          >
            <img src={gif.preview} alt={gif.title} loading="lazy" style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
          </button>
        ))}
      </div>
      <div style={{ textAlign: 'right', fontSize: 9, color: 'var(--sh-muted)', marginTop: 4 }}>Powered by Tenor</div>
    </div>
  )
}

/* ── Message Search Bar ────────────────────────────────────────────── */
function MessageSearchBar({ messages, onClose }) {
  const [query, setQuery] = useState('')
  const matchedMessages = query.trim()
    ? messages.filter((m) => m.content && m.content.toLowerCase().includes(query.toLowerCase()) && !m.deletedAt)
    : []

  return (
    <div style={{
      padding: '8px 12px', borderBottom: '1px solid var(--sh-border)',
      background: 'var(--sh-soft)', display: 'flex', gap: 6, alignItems: 'center',
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sh-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      <input
        type="text"
        placeholder="Search messages..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        style={{
          flex: 1, padding: '4px 8px',
          background: 'var(--sh-input-bg)', color: 'var(--sh-input-text)',
          border: '1px solid var(--sh-input-border)', borderRadius: 'var(--radius-control)',
          fontSize: 12, fontFamily: PAGE_FONT,
        }}
      />
      {matchedMessages.length > 0 && (
        <span style={{ fontSize: 11, color: 'var(--sh-muted)', whiteSpace: 'nowrap' }}>
          {matchedMessages.length} result{matchedMessages.length !== 1 ? 's' : ''}
        </span>
      )}
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sh-muted)', fontSize: 14, fontFamily: PAGE_FONT }}>x</button>
    </div>
  )
}

function MessageThread({
  conversation,
  messages,
  typingUsernames,
  onBack,
  onSend,
  onDeleteMessage,
  onEditMessage,
  onTypingStart,
  loadingMessages,
  isPhone,
  currentUserId,
}) {
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const [inputValue, setInputValue] = useState('')
  const [inputRows, setInputRows] = useState(1)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [showPollCreator, setShowPollCreator] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [pollMultiple, setPollMultiple] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [showImageInput, setShowImageInput] = useState(false)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [showMessageSearch, setShowMessageSearch] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [attachmentPreviews, setAttachmentPreviews] = useState([]) // { file, previewUrl, type }
  const conversationName = getConversationDisplayName(conversation, currentUserId)
  const conversationAvatar = getConversationAvatar(conversation, currentUserId)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typingUsernames])

  // Clean up attachment preview URLs
  useEffect(() => {
    return () => {
      attachmentPreviews.forEach((a) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl) })
    }
  }, [attachmentPreviews])

  if (!conversation) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--sh-muted)' }}>
        Select a conversation to start messaging
      </div>
    )
  }

  const closeAllPanels = () => {
    setShowImageInput(false)
    setShowPollCreator(false)
    setShowGifPicker(false)
  }

  const handleInputChange = (e) => {
    const value = e.target.value
    setInputValue(value)
    const lineCount = (value.match(/\n/g) || []).length + 1
    setInputRows(Math.min(Math.max(lineCount, 1), 4))
    if (value.trim()) onTypingStart()
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const previews = files.slice(0, 5).map((file) => {
      const isImage = file.type.startsWith('image/')
      return {
        file,
        previewUrl: isImage ? URL.createObjectURL(file) : null,
        type: isImage ? 'image' : 'file',
        name: file.name,
        size: file.size,
      }
    })
    setAttachmentPreviews((prev) => [...prev, ...previews].slice(0, 5))
    // Reset file input so same file can be re-selected
    e.target.value = ''
  }

  const removeAttachmentPreview = (index) => {
    setAttachmentPreviews((prev) => {
      const removed = prev[index]
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleGifSelect = (gif) => {
    // Send GIF as an image-only attachment (no text description)
    onSend('', replyTo?.id || null, {
      attachments: [{ type: 'image', url: gif.full, fileName: 'gif' }],
    })
    setShowGifPicker(false)
    setReplyTo(null)
  }

  const handleSendMessage = () => {
    const hasContent = inputValue.trim()
    const hasPoll = showPollCreator && pollQuestion.trim() && pollOptions.filter((o) => o.trim()).length >= 2
    const hasImage = showImageInput && imageUrl.trim()
    const hasFiles = attachmentPreviews.length > 0

    if (!hasContent && !hasPoll && !hasFiles) return

    const options = {}
    const allAttachments = []

    // Image URL attachment
    if (hasImage) {
      allAttachments.push({ type: 'image', url: imageUrl.trim() })
    }

    // File picker attachments — use object URLs as temporary references
    // (In a production system these would be uploaded to cloud storage first,
    //  but for now we create data URLs for images)
    if (hasFiles) {
      for (const ap of attachmentPreviews) {
        if (ap.previewUrl) {
          allAttachments.push({ type: ap.type, url: ap.previewUrl, fileName: ap.name, fileSize: ap.size })
        }
      }
    }

    if (allAttachments.length > 0) {
      options.attachments = allAttachments
    }

    if (hasPoll) {
      options.poll = {
        question: pollQuestion.trim(),
        options: pollOptions.filter((o) => o.trim()),
        allowMultiple: pollMultiple,
      }
    }

    onSend(
      inputValue.trim() || (hasPoll ? pollQuestion.trim() : (hasFiles ? attachmentPreviews[0]?.name || 'Attachment' : '')),
      replyTo?.id || null,
      options,
    )
    setInputValue('')
    setInputRows(1)
    setShowPollCreator(false)
    setPollQuestion('')
    setPollOptions(['', ''])
    setPollMultiple(false)
    setShowImageInput(false)
    setImageUrl('')
    setAttachmentPreviews([])
    setReplyTo(null)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleStartEdit = (msg) => {
    setEditingMessageId(msg.id)
    setEditContent(msg.content)
  }

  const handleConfirmEdit = () => {
    if (editContent.trim() && editingMessageId) {
      onEditMessage(editingMessageId, editContent)
    }
    setEditingMessageId(null)
    setEditContent('')
  }

  const handleCancelEdit = () => {
    setEditingMessageId(null)
    setEditContent('')
  }

  const messagesByDate = groupMessagesByDate(messages)
  const dates = Object.keys(messagesByDate).sort((a, b) => new Date(a) - new Date(b))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--sh-surface)' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--sh-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'var(--sh-surface)',
      }}>
        {isPhone && (
          <button
            onClick={onBack}
            aria-label="Back to conversations"
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
        )}

        <UserAvatar
          username={conversationName}
          avatarUrl={conversationAvatar}
          size={32}
        />

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>
            {conversationName}
          </div>
          {conversation.type === 'group' && conversation.participants && (
            <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
              {conversation.participants.length} member{conversation.participants.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Search messages button */}
        <button
          onClick={() => setShowMessageSearch(!showMessageSearch)}
          title="Search messages"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: showMessageSearch ? 'var(--sh-brand)' : 'var(--sh-muted)', padding: 4 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        </button>
      </div>

      {/* Message search bar */}
      {showMessageSearch && (
        <MessageSearchBar
          messages={messages}
          onClose={() => setShowMessageSearch(false)}
        />
      )}

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column' }}>
        {loadingMessages && messages.length === 0 && (
          <div style={{ color: 'var(--sh-muted)', textAlign: 'center', fontSize: 13 }}>
            Loading messages...
          </div>
        )}

        {!loadingMessages && messages.length === 0 && (
          <div style={{ color: 'var(--sh-muted)', textAlign: 'center', fontSize: 13, margin: 'auto' }}>
            No messages yet. Say hello!
          </div>
        )}

        {dates.map((date) => (
          <div key={date}>
            <div style={{
              textAlign: 'center',
              margin: '16px 0 12px',
              fontSize: 11,
              color: 'var(--sh-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {formatDateSeparator(new Date(date))}
            </div>

            {messagesByDate[date].map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                currentUserId={currentUserId}
                isEditing={editingMessageId === msg.id}
                editContent={editContent}
                onEditContentChange={setEditContent}
                onStartEdit={() => handleStartEdit(msg)}
                onConfirmEdit={handleConfirmEdit}
                onCancelEdit={handleCancelEdit}
                onDelete={() => onDeleteMessage(msg.id)}
                onReply={() => setReplyTo(msg)}
                messages={messages}
              />
            ))}
          </div>
        ))}

        {typingUsernames.length > 0 && (
          <TypingIndicator usernames={typingUsernames} />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Hidden file input for attachment picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.gif,.pdf,.doc,.docx,.txt,.zip"
        multiple
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Input area */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--sh-border)', background: 'var(--sh-surface)' }}>
        {/* Reply-to banner */}
        {replyTo && (
          <div style={{
            marginBottom: 8, padding: '6px 10px',
            background: 'var(--sh-soft)', borderRadius: 'var(--radius-control)',
            border: '1px solid var(--sh-border)', borderLeft: '3px solid var(--sh-brand)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sh-brand)' }}>
                Replying to {replyTo.sender?.username || 'message'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--sh-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {truncateText(replyTo.content, 60)}
              </div>
            </div>
            <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sh-muted)', fontSize: 14, padding: '0 4px', fontFamily: PAGE_FONT }}>x</button>
          </div>
        )}

        {/* Attachment previews */}
        {attachmentPreviews.length > 0 && (
          <div style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {attachmentPreviews.map((ap, i) => (
              <div key={i} style={{ position: 'relative', border: '1px solid var(--sh-border)', borderRadius: 6, overflow: 'hidden' }}>
                {ap.type === 'image' && ap.previewUrl ? (
                  <img src={ap.previewUrl} alt={ap.name} style={{ width: 64, height: 64, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: 64, height: 64, display: 'grid', placeItems: 'center', background: 'var(--sh-soft)', fontSize: 10, color: 'var(--sh-muted)', padding: 4, textAlign: 'center', wordBreak: 'break-all' }}>
                    {truncateText(ap.name, 12)}
                  </div>
                )}
                <button
                  onClick={() => removeAttachmentPreview(i)}
                  style={{
                    position: 'absolute', top: 2, right: 2,
                    width: 16, height: 16, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)', color: 'white',
                    border: 'none', cursor: 'pointer', fontSize: 10,
                    display: 'grid', placeItems: 'center', lineHeight: 1,
                  }}
                >x</button>
              </div>
            ))}
          </div>
        )}

        {/* Image URL input (toggle) */}
        {showImageInput && (
          <div style={{ marginBottom: 8, display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder="Paste image URL (https://...)..."
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              style={{ flex: 1, padding: '6px 10px', background: 'var(--sh-input-bg)', color: 'var(--sh-input-text)', border: '1px solid var(--sh-input-border)', borderRadius: 'var(--radius-control)', fontSize: 12, fontFamily: PAGE_FONT }}
            />
            <button onClick={() => { setShowImageInput(false); setImageUrl('') }} style={{ padding: '4px 8px', background: 'var(--sh-soft)', color: 'var(--sh-muted)', border: '1px solid var(--sh-border)', borderRadius: 'var(--radius-control)', fontSize: 11, cursor: 'pointer', fontFamily: PAGE_FONT }}>
              Cancel
            </button>
          </div>
        )}

        {/* GIF search panel */}
        {showGifPicker && (
          <GifSearchPanel
            onSelect={handleGifSelect}
            onClose={() => setShowGifPicker(false)}
          />
        )}

        {/* Poll creator (toggle) */}
        {showPollCreator && (
          <div style={{ marginBottom: 8, padding: '10px 12px', background: 'var(--sh-soft)', borderRadius: 'var(--radius-control)', border: '1px solid var(--sh-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sh-heading)', fontFamily: PAGE_FONT }}>Create Poll</span>
              <button onClick={() => { setShowPollCreator(false); setPollQuestion(''); setPollOptions(['', '']); setPollMultiple(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sh-muted)', fontSize: 12, fontFamily: PAGE_FONT }}>Cancel</button>
            </div>
            <input
              type="text"
              placeholder="Ask a question..."
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', marginBottom: 6, background: 'var(--sh-input-bg)', color: 'var(--sh-input-text)', border: '1px solid var(--sh-input-border)', borderRadius: 'var(--radius-control)', fontSize: 12, fontFamily: PAGE_FONT, boxSizing: 'border-box' }}
              maxLength={200}
            />
            {pollOptions.map((opt, i) => (
              <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <input
                  type="text"
                  placeholder={`Option ${i + 1}`}
                  value={opt}
                  onChange={(e) => { const next = [...pollOptions]; next[i] = e.target.value; setPollOptions(next) }}
                  style={{ flex: 1, padding: '4px 8px', background: 'var(--sh-input-bg)', color: 'var(--sh-input-text)', border: '1px solid var(--sh-input-border)', borderRadius: 'var(--radius-control)', fontSize: 12, fontFamily: PAGE_FONT }}
                  maxLength={100}
                />
                {pollOptions.length > 2 && (
                  <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sh-danger-text)', fontSize: 14, padding: '0 4px' }}>x</button>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              {pollOptions.length < 6 && (
                <button onClick={() => setPollOptions([...pollOptions, ''])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sh-brand)', fontSize: 12, fontWeight: 600, fontFamily: PAGE_FONT, padding: 0 }}>+ Add option</button>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--sh-muted)', fontFamily: PAGE_FONT }}>
                <input type="checkbox" checked={pollMultiple} onChange={(e) => setPollMultiple(e.target.checked)} />
                Allow multiple
              </label>
            </div>
          </div>
        )}

        {/* Action bar + text input */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          {/* File picker button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach file"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: attachmentPreviews.length > 0 ? 'var(--sh-brand)' : 'var(--sh-muted)', padding: '6px 4px', flexShrink: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
          </button>
          {/* Image URL button */}
          <button
            onClick={() => { closeAllPanels(); setShowImageInput(!showImageInput) }}
            title="Share image URL"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: showImageInput ? 'var(--sh-brand)' : 'var(--sh-muted)', padding: '6px 4px', flexShrink: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
          </button>
          {/* GIF button */}
          <button
            onClick={() => { closeAllPanels(); setShowGifPicker(!showGifPicker) }}
            title="Send GIF"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: showGifPicker ? 'var(--sh-brand)' : 'var(--sh-muted)', padding: '6px 4px', flexShrink: 0, fontWeight: 800, fontSize: 12, fontFamily: PAGE_FONT }}
          >
            GIF
          </button>
          {/* Create poll button */}
          <button
            onClick={() => { closeAllPanels(); setShowPollCreator(!showPollCreator) }}
            title="Create poll"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: showPollCreator ? 'var(--sh-brand)' : 'var(--sh-muted)', padding: '6px 4px', flexShrink: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
          </button>

          <textarea
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={inputRows}
            maxLength={5000}
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
            disabled={!inputValue.trim() && !(showPollCreator && pollQuestion.trim()) && attachmentPreviews.length === 0}
            style={{
              padding: '8px 16px',
              background: (inputValue.trim() || (showPollCreator && pollQuestion.trim()) || attachmentPreviews.length > 0) ? 'var(--sh-brand)' : 'var(--sh-soft)',
              color: (inputValue.trim() || (showPollCreator && pollQuestion.trim()) || attachmentPreviews.length > 0) ? 'var(--sh-surface)' : 'var(--sh-muted)',
              border: 'none',
              borderRadius: 'var(--radius-control)',
              fontSize: 13,
              fontWeight: 700,
              cursor: (inputValue.trim() || (showPollCreator && pollQuestion.trim()) || attachmentPreviews.length > 0) ? 'pointer' : 'default',
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

/* ── LinkPreview ── Auto-detect and preview URLs in messages ────────── */
function LinkPreview({ content, isOwn }) {
  const urlMatch = content?.match(/https?:\/\/[^\s]+/)
  if (!urlMatch) return null
  const url = urlMatch[0]

  // Only show preview for common linkable domains
  const domain = (() => { try { return new URL(url).hostname } catch { return '' } })()
  if (!domain) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block', marginTop: 6, padding: '6px 10px',
        background: isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
        borderRadius: 6, textDecoration: 'none', color: 'inherit',
        borderLeft: '3px solid var(--sh-brand)', fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{domain}</div>
      <div style={{ opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {truncateText(url, 60)}
      </div>
    </a>
  )
}

function MessageBubble({
  message,
  currentUserId,
  isEditing,
  editContent,
  onEditContentChange,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onDelete,
  onReply,
  messages,
}) {
  const [showActions, setShowActions] = useState(false)
  const isOwn = message.sender?.id === currentUserId || message.pending
  const isDeleted = Boolean(message.deletedAt)
  const bgColor = isOwn ? 'var(--sh-brand)' : 'var(--sh-soft)'
  const textColor = isOwn ? 'var(--sh-surface)' : 'var(--sh-text)'
  const senderName = message.sender?.username || 'Unknown'
  const senderAvatar = message.sender?.avatarUrl || null

  // Only own, non-deleted, recent messages can be edited (15-minute window)
  const canEdit = isOwn && !isDeleted && Boolean(message.editableUntil || message.createdAt)

  // Find the replied-to message
  const replyToMsg = message.replyToId
    ? (message.replyTo || (messages || []).find((m) => m.id === message.replyToId))
    : null

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        marginBottom: 12,
        alignItems: 'flex-end',
        flexDirection: isOwn ? 'row-reverse' : 'row',
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <UserAvatar
        username={senderName}
        avatarUrl={senderAvatar}
        size={28}
      />

      <div style={{ maxWidth: '60%', position: 'relative' }}>
        {/* Reply-to reference */}
        {replyToMsg && !isDeleted && (
          <div style={{
            padding: '4px 8px', marginBottom: 2,
            background: isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
            borderRadius: '6px 6px 0 0',
            borderLeft: '2px solid var(--sh-brand)',
            fontSize: 11, color: isOwn ? 'rgba(255,255,255,0.8)' : 'var(--sh-muted)',
          }}>
            <span style={{ fontWeight: 600 }}>{replyToMsg.sender?.username || replyToMsg.senderId || 'User'}</span>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {truncateText(replyToMsg.content, 50)}
            </div>
          </div>
        )}

        {isEditing ? (
          <div style={{
            padding: '8px 12px',
            background: 'var(--sh-soft)',
            borderRadius: 'var(--radius-control)',
            border: '1px solid var(--sh-brand)',
          }}>
            <textarea
              value={editContent}
              onChange={(e) => onEditContentChange(e.target.value)}
              style={{
                width: '100%',
                padding: 4,
                background: 'transparent',
                color: 'var(--sh-text)',
                border: 'none',
                fontSize: 13,
                fontFamily: PAGE_FONT,
                resize: 'none',
                outline: 'none',
              }}
              rows={2}
              maxLength={5000}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                onClick={onCancelEdit}
                style={{
                  padding: '3px 8px',
                  background: 'var(--sh-soft)',
                  border: '1px solid var(--sh-border)',
                  borderRadius: 4,
                  fontSize: 11,
                  cursor: 'pointer',
                  color: 'var(--sh-text)',
                  fontFamily: PAGE_FONT,
                }}
              >
                Cancel
              </button>
              <button
                onClick={onConfirmEdit}
                style={{
                  padding: '3px 8px',
                  background: 'var(--sh-brand)',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 11,
                  cursor: 'pointer',
                  color: 'var(--sh-surface)',
                  fontWeight: 600,
                  fontFamily: PAGE_FONT,
                }}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: '8px 12px',
              background: bgColor,
              color: textColor,
              borderRadius: replyToMsg ? '0 0 var(--radius-control) var(--radius-control)' : 'var(--radius-control)',
              fontSize: 13,
              lineHeight: 1.5,
              wordWrap: 'break-word',
              opacity: message.pending ? 0.6 : 1,
            }}
          >
            {isDeleted ? (
              <span style={{ fontStyle: 'italic', opacity: 0.6 }}>
                [Message deleted]
              </span>
            ) : (
              <>
                {message.content}

                {/* Link preview */}
                <LinkPreview content={message.content} isOwn={isOwn} />

                {/* Attachments (images/files) */}
                {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {message.attachments.map((att, idx) => (
                      att.type === 'image' ? (
                        <a key={att.id || idx} href={att.url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={att.url}
                            alt={att.fileName || 'Image'}
                            style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, display: 'block' }}
                            onError={(e) => { e.target.style.display = 'none' }}
                          />
                        </a>
                      ) : (
                        <a
                          key={att.id || idx}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 10px', background: isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
                            borderRadius: 6, color: 'inherit', textDecoration: 'none', fontSize: 12,
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                          {att.fileName || 'Download file'}
                          {att.fileSize ? ` (${Math.round(att.fileSize / 1024)}KB)` : ''}
                        </a>
                      )
                    ))}
                  </div>
                )}

                {/* Poll */}
                {message.poll && (
                  <MessagePollDisplay poll={message.poll} messageId={message.id} currentUserId={currentUserId} isOwn={isOwn} />
                )}
              </>
            )}

            {message.editedAt && !isDeleted && (
              <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                (edited)
              </div>
            )}

            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
              {formatMessageTime(message.createdAt)}
            </div>
          </div>
        )}

        {/* Reactions display */}
        {Array.isArray(message.reactions) && message.reactions.length > 0 && !isDeleted && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {groupReactions(message.reactions).map((group) => (
              <span
                key={group.emoji}
                style={{
                  padding: '2px 6px',
                  background: 'var(--sh-soft)',
                  border: '1px solid var(--sh-border)',
                  borderRadius: 12,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {group.emoji} {group.count}
              </span>
            ))}
          </div>
        )}

        {/* Action buttons on hover */}
        {showActions && !isDeleted && !isEditing && !message.pending && (
          <div style={{
            position: 'absolute',
            top: replyToMsg ? -4 : -24,
            right: isOwn ? 0 : undefined,
            left: isOwn ? undefined : 0,
            display: 'flex',
            gap: 2,
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            borderRadius: 6,
            padding: 2,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}>
            {/* Reply button */}
            {onReply && (
              <button
                onClick={onReply}
                title="Reply"
                style={actionBtnStyle}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
              </button>
            )}
            {canEdit && (
              <button
                onClick={onStartEdit}
                title="Edit"
                style={actionBtnStyle}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
            )}
            {isOwn && (
              <button
                onClick={onDelete}
                title="Delete"
                style={{ ...actionBtnStyle, color: 'var(--sh-danger-text)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const actionBtnStyle = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '4px 6px',
  borderRadius: 4,
  color: 'var(--sh-muted)',
  display: 'flex',
  alignItems: 'center',
}

/* ── MessagePollDisplay ─── Shows a poll with vote buttons ──────────── */
function MessagePollDisplay({ poll, messageId, currentUserId, isOwn }) {
  const [voting, setVoting] = useState(false)

  if (!poll) return null

  const isClosed = Boolean(poll.closedAt)
  const totalVotes = poll.options?.reduce((sum, opt) => sum + (opt.votes?.length || 0), 0) || 0

  const handleVote = async (optionId) => {
    if (voting || isClosed) return
    setVoting(true)
    try {
      await fetch(`${API}/api/messages/messages/${messageId}/poll/vote`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({ optionId }),
      })
    } catch { /* silent */ }
    setVoting(false)
  }

  const handleClose = async () => {
    if (isClosed) return
    try {
      await fetch(`${API}/api/messages/messages/${messageId}/poll/close`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
      })
    } catch { /* silent */ }
  }

  return (
    <div style={{
      marginTop: 8, padding: '10px 12px',
      background: 'rgba(0,0,0,0.08)', borderRadius: 8,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
        {poll.question}
        {isClosed && <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6, opacity: 0.7 }}>(Closed)</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {poll.options?.map((opt) => {
          const voteCount = opt.votes?.length || 0
          const hasVoted = opt.votes?.some((v) => v.user?.id === currentUserId || v.userId === currentUserId)
          const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0

          return (
            <button
              key={opt.id}
              onClick={() => !isClosed && handleVote(opt.id)}
              disabled={isClosed || voting}
              style={{
                position: 'relative', overflow: 'hidden',
                padding: '6px 10px', borderRadius: 6,
                border: hasVoted ? '2px solid var(--sh-brand)' : '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)',
                color: 'inherit', cursor: isClosed ? 'default' : 'pointer',
                fontSize: 12, fontWeight: hasVoted ? 600 : 400,
                fontFamily: PAGE_FONT, textAlign: 'left',
                display: 'flex', justifyContent: 'space-between',
              }}
            >
              <div style={{
                position: 'absolute', top: 0, left: 0, bottom: 0,
                width: `${pct}%`, background: 'rgba(255,255,255,0.12)',
                transition: 'width 0.3s',
              }} />
              <span style={{ position: 'relative', zIndex: 1 }}>{opt.text}</span>
              <span style={{ position: 'relative', zIndex: 1, fontSize: 11, opacity: 0.8 }}>
                {voteCount} ({pct}%)
              </span>
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, opacity: 0.7 }}>
        <span>{totalVotes} vote{totalVotes === 1 ? '' : 's'}{poll.allowMultiple ? ' (multiple choice)' : ''}</span>
        {isOwn && !isClosed && (
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 11, fontWeight: 600, textDecoration: 'underline', fontFamily: PAGE_FONT }}
          >
            Close poll
          </button>
        )}
      </div>
    </div>
  )
}

function groupReactions(reactions) {
  const groups = {}
  for (const r of reactions) {
    if (!groups[r.emoji]) groups[r.emoji] = { emoji: r.emoji, count: 0 }
    groups[r.emoji].count++
  }
  return Object.values(groups)
}

function TypingIndicator({ usernames }) {
  const text = usernames.length === 1
    ? `${usernames[0]} is typing`
    : usernames.length === 2
      ? `${usernames[0]} and ${usernames[1]} are typing`
      : `${usernames[0]} and ${usernames.length - 1} others are typing`

  return (
    <div style={{
      display: 'flex',
      gap: 4,
      marginBottom: 12,
      alignItems: 'flex-end',
    }}>
      <div style={{
        padding: '8px 12px',
        background: 'var(--sh-soft)',
        color: 'var(--sh-text)',
        borderRadius: 'var(--radius-control)',
        fontSize: 13,
      }}>
        <span style={{ opacity: 0.7 }}>{text}</span>
        <span style={{ marginLeft: 4 }}>...</span>
      </div>
    </div>
  )
}

function NewConversationModal({ isOpen, onClose, onCreate, currentUserId }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUsers, setSelectedUsers] = useState([])
  const [groupName, setGroupName] = useState('')
  const [isGroup, setIsGroup] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const query = searchQuery.trim()

    if (!query) {
      setSearchResults([])
      setLoading(false)
      return undefined
    }

    setLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `${API}/api/search?q=${encodeURIComponent(query)}&type=users&limit=10`,
          { headers: authHeaders(), credentials: 'include' },
        )
        if (response.ok) {
          const data = await response.json()
          const users = (data.results?.users || data.users || [])
            .filter((u) => u.id !== currentUserId)
          setSearchResults(users)
        } else {
          setSearchResults([])
        }
      } catch {
        setSearchResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => window.clearTimeout(timer)
  }, [searchQuery, currentUserId])

  const handleUserSelect = (user) => {
    if (selectedUsers.find((u) => u.id === user.id)) {
      setSelectedUsers(selectedUsers.filter((u) => u.id !== user.id))
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
      participantIds: selectedUsers.map((u) => u.id),
    })

    setSearchQuery('')
    setSelectedUsers([])
    setGroupName('')
    setIsGroup(false)
  }

  if (!isOpen) return null

  const canCreate = isGroup
    ? (groupName.trim() && selectedUsers.length > 0)
    : selectedUsers.length > 0

  return createPortal(
    <div
      style={{
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
      role="dialog"
      aria-modal="true"
      aria-label="Start a conversation"
    >
      <div style={{
        width: '90%',
        maxWidth: 450,
        background: 'var(--sh-surface)',
        borderRadius: 'var(--radius-card)',
        padding: 24,
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        fontFamily: PAGE_FONT,
      }}>
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
            <input type="radio" name="type" checked={!isGroup} onChange={() => setIsGroup(false)} />
            Direct Message
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="radio" name="type" checked={isGroup} onChange={() => setIsGroup(true)} />
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
        }}>
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

          {!loading && searchResults.map((user) => (
            <button
              key={user.id}
              onClick={() => handleUserSelect(user)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: selectedUsers.find((u) => u.id === user.id) ? 'var(--sh-brand-soft)' : 'transparent',
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
                if (!selectedUsers.find((u) => u.id === user.id)) {
                  e.currentTarget.style.background = 'var(--sh-soft)'
                }
              }}
              onMouseLeave={(e) => {
                if (!selectedUsers.find((u) => u.id === user.id)) {
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
              {selectedUsers.map((user) => (
                <div
                  key={user.id}
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
            disabled={!canCreate}
            style={{
              padding: '8px 16px',
              background: canCreate ? 'var(--sh-brand)' : 'var(--sh-soft)',
              color: canCreate ? 'var(--sh-surface)' : 'var(--sh-muted)',
              border: 'none',
              borderRadius: 'var(--radius-control)',
              fontSize: 13,
              fontWeight: 700,
              cursor: canCreate ? 'pointer' : 'default',
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
 * Confirm dialog for delete conversation
 * ═══════════════════════════════════════════════════════════════════════════ */
function ConfirmDeleteModal({ isOpen, onConfirm, onCancel }) {
  if (!isOpen) return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm delete conversation"
    >
      <div style={{
        width: '90%',
        maxWidth: 380,
        background: 'var(--sh-surface)',
        borderRadius: 'var(--radius-card)',
        padding: 24,
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        fontFamily: PAGE_FONT,
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 12 }}>
          Delete Conversation
        </h3>
        <p style={{ fontSize: 13, color: 'var(--sh-text)', marginBottom: 20, lineHeight: 1.5 }}>
          Are you sure? For DMs this will archive the conversation. For groups you will leave the group. This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
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
            onClick={onConfirm}
            style={{
              padding: '8px 16px',
              background: 'var(--sh-danger)',
              color: 'var(--sh-surface)',
              border: 'none',
              borderRadius: 'var(--radius-control)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: PAGE_FONT,
            }}
          >
            Delete
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
  const { user } = useSession()
  const layout = useResponsiveAppLayout()
  const { socket } = useSocket()

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
  } = useMessagingData(socket, currentUserId)

  const [showNewModal, setShowNewModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const dmInitRef = useRef(false)

  // Load conversations on mount
  useEffect(() => {
    if (user) {
      loadConversations()
    }
  }, [user, loadConversations])

  // Auto-start DM if navigated with ?dm=userId from profile
  useEffect(() => {
    const dmUserId = searchParams.get('dm')
    if (!dmUserId || !user || dmInitRef.current) return
    dmInitRef.current = true

    const targetId = parseInt(dmUserId, 10)
    if (!Number.isFinite(targetId) || targetId === currentUserId) return

    // Clear the dm param from URL
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('dm')
      return next
    }, { replace: true })

    // Start or open existing DM
    startConversation([targetId], 'dm').then((conv) => {
      if (conv) selectConversation(conv.id)
    })
  }, [searchParams, user, currentUserId, startConversation, selectConversation, setSearchParams])

  // Get typing usernames for current conversation
  const typingUsernames = activeConversation
    ? Array.from(typingUsers.get(activeConversation.id) || [])
    : []

  const handleCreateConversation = useCallback(async (data) => {
    const conv = await startConversation(
      data.participantIds,
      data.isGroup ? 'group' : 'dm',
      data.groupName,
    )
    if (conv) {
      setShowNewModal(false)
      selectConversation(conv.id)
    }
  }, [startConversation, selectConversation])

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
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--sh-muted)',
        fontFamily: PAGE_FONT,
      }}>
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
        }}>
          {authError}
        </div>
      )}

      <div className="messages-split-panel">
        {showListPanel && (
          <div style={{ minWidth: 0 }}>
            <ConversationList
              conversations={conversations}
              activeConversationId={activeConversation?.id}
              selectConversation={selectConversation}
              onNewClick={() => setShowNewModal(true)}
              onDeleteConversation={(id) => setDeleteTarget(id)}
              loading={loadingConversations}
              currentUserId={currentUserId}
            />
          </div>
        )}

        {showThreadPanel && (
          <div style={{ minWidth: 0, flex: 1 }}>
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
            />
          </div>
        )}
      </div>

      <NewConversationModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreate={handleCreateConversation}
        currentUserId={currentUserId}
      />

      <ConfirmDeleteModal
        isOpen={deleteTarget !== null}
        onConfirm={handleDeleteConversation}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageShell>
  )
}
