/* ─────────────────────────────────────────────────────────────
 * MessageThread.jsx
 * Message display thread with input area, polls, GIFs, attachments
 * ───────────────────────────────────────────────────────────── */
import { useState, useRef, useEffect } from 'react'
import UserAvatar from '../../../components/UserAvatar'
import { groupMessagesByDate, getConversationDisplayName, getConversationAvatar, formatDateSeparator, truncateText } from '../messagesHelpers'
import { PAGE_FONT } from '../../shared/pageUtils'
import { API } from '../../../config'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'
import { GifSearchPanel } from './GifSearchPanel'
import { MessageSearchBar } from './MessageSearchBar'

export function MessageThread({
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
  onMute,
  onArchive,
  onBlock,
  sendBlocked,
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
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const headerMenuRef = useRef(null)
  const [replyTo, setReplyTo] = useState(null)
  const [attachmentPreviews, setAttachmentPreviews] = useState([])
  const conversationName = getConversationDisplayName(conversation, currentUserId)
  const conversationAvatar = getConversationAvatar(conversation, currentUserId)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typingUsernames])

  // Close header menu on click outside
  useEffect(() => {
    if (!showHeaderMenu) return
    function handleClickOutside(e) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target)) {
        setShowHeaderMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showHeaderMenu])

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

    if (hasImage) {
      allAttachments.push({ type: 'image', url: imageUrl.trim() })
    }

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
          aria-label="Search messages"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: showMessageSearch ? 'var(--sh-brand)' : 'var(--sh-muted)', padding: 4 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        </button>

        {/* Kebab menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowHeaderMenu(!showHeaderMenu)}
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={showHeaderMenu}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sh-muted)', padding: 4 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
          </button>

          {showHeaderMenu && (
            <div
              ref={headerMenuRef}
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                background: 'var(--sh-surface)',
                border: '1px solid var(--sh-border)',
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                zIndex: 100,
                padding: 4,
                minWidth: 160,
              }}
            >
              {[
                {
                  label: conversation.muted ? 'Unmute' : 'Mute',
                  onClick: () => { setShowHeaderMenu(false); onMute?.(conversation.id, !conversation.muted) },
                },
                {
                  label: 'Archive',
                  onClick: () => { setShowHeaderMenu(false); onArchive?.(conversation.id) },
                },
                ...(conversation.type === 'dm' ? [{
                  label: 'Block User',
                  danger: true,
                  onClick: () => { setShowHeaderMenu(false); onBlock?.(conversation) },
                }] : []),
                {
                  label: 'Report',
                  danger: true,
                  onClick: () => { setShowHeaderMenu(false); window.open('/support', '_blank') },
                },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={(e) => { e.stopPropagation(); item.onClick() }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    color: item.danger ? 'var(--sh-danger-text)' : 'var(--sh-text)',
                    textAlign: 'left',
                    borderRadius: 6,
                    fontFamily: PAGE_FONT,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = item.danger ? 'var(--sh-danger-bg)' : 'var(--sh-soft)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Message search bar */}
      {showMessageSearch && (
        <MessageSearchBar
          messages={messages}
          onClose={() => setShowMessageSearch(false)}
        />
      )}

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column' }} role="log" aria-live="polite" aria-label="Message thread">
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

      {/* Blocked banner */}
      {sendBlocked && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--sh-danger-bg)',
          borderTop: '1px solid var(--sh-danger-border)',
          color: 'var(--sh-danger-text)',
          fontSize: 13,
          fontWeight: 600,
          textAlign: 'center',
          fontFamily: PAGE_FONT,
        }}>
          You can no longer send messages to this person.
        </div>
      )}

      {/* Input area */}
      {!sendBlocked && (
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
            aria-label="Attach file"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: attachmentPreviews.length > 0 ? 'var(--sh-brand)' : 'var(--sh-muted)', padding: '4px 6px', flexShrink: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
          </button>
          {/* Image URL button */}
          <button
            onClick={() => { closeAllPanels(); setShowImageInput(!showImageInput) }}
            title="Share image URL"
            aria-label="Share image URL"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: showImageInput ? 'var(--sh-brand)' : 'var(--sh-muted)', padding: '4px 6px', flexShrink: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
          </button>
          {/* GIF button */}
          <button
            onClick={() => { closeAllPanels(); setShowGifPicker(!showGifPicker) }}
            title="Send GIF"
            aria-label="Toggle GIF picker"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: showGifPicker ? 'var(--sh-brand)' : 'var(--sh-muted)', padding: '4px 6px', flexShrink: 0, fontWeight: 800, fontSize: 12, fontFamily: PAGE_FONT }}
          >
            GIF
          </button>
          {/* Create poll button */}
          <button
            onClick={() => { closeAllPanels(); setShowPollCreator(!showPollCreator) }}
            title="Create poll"
            aria-label="Create poll"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: showPollCreator ? 'var(--sh-brand)' : 'var(--sh-muted)', padding: '4px 6px', flexShrink: 0 }}
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
            aria-label="Message input"
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
            aria-label="Send message"
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
      )}
    </div>
  )
}
