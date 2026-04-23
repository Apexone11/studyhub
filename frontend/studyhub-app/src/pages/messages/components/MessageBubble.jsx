/* ─────────────────────────────────────────────────────────────
 * MessageBubble.jsx
 * Message display with edit/delete actions and link preview
 * ───────────────────────────────────────────────────────────── */
import { useState } from 'react'
import UserAvatar from '../../../components/UserAvatar'
import { truncateText, groupReactions, formatMessageTime } from '../messagesHelpers'
import { PAGE_FONT } from '../../shared/pageUtils'
import { MessagePollDisplay } from './MessagePollDisplay'

function LinkPreview({ content, isOwn }) {
  const urlMatch = content?.match(/https?:\/\/[^\s]+/)
  if (!urlMatch) return null
  const url = urlMatch[0]

  // Only show preview for common linkable domains
  const domain = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  })()
  if (!domain) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block',
        marginTop: 6,
        padding: '6px 10px',
        background: isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
        borderRadius: 6,
        textDecoration: 'none',
        color: 'inherit',
        borderLeft: '3px solid var(--sh-brand)',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{domain}</div>
      <div
        style={{ opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {truncateText(url, 60)}
      </div>
    </a>
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

export function MessageBubble({
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
    ? message.replyTo || (messages || []).find((m) => m.id === message.replyToId)
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
      <UserAvatar username={senderName} avatarUrl={senderAvatar} size={28} />

      <div style={{ maxWidth: '75%', position: 'relative' }}>
        {/* Reply-to reference */}
        {replyToMsg && !isDeleted && (
          <div
            style={{
              padding: '4px 8px',
              marginBottom: 2,
              background: isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
              borderRadius: '6px 6px 0 0',
              borderLeft: '2px solid var(--sh-brand)',
              fontSize: 11,
              color: isOwn ? 'rgba(255,255,255,0.8)' : 'var(--sh-muted)',
            }}
          >
            <span style={{ fontWeight: 600 }}>
              {replyToMsg.sender?.username || replyToMsg.senderId || 'User'}
            </span>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {truncateText(replyToMsg.content, 50)}
            </div>
          </div>
        )}

        {isEditing ? (
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--sh-soft)',
              borderRadius: 'var(--radius-control)',
              border: '1px solid var(--sh-brand)',
            }}
          >
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
                  padding: '4px 8px',
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
                  padding: '4px 8px',
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
              borderRadius: replyToMsg
                ? '0 0 var(--radius-control) var(--radius-control)'
                : 'var(--radius-control)',
              fontSize: 13,
              lineHeight: 1.5,
              wordWrap: 'break-word',
              opacity: message.pending ? 0.6 : 1,
            }}
          >
            {isDeleted ? (
              <span style={{ fontStyle: 'italic', opacity: 0.6 }}>[Message deleted]</span>
            ) : (
              <>
                {message.content}

                {/* Link preview */}
                <LinkPreview content={message.content} isOwn={isOwn} />

                {/* Attachments (images/files) */}
                {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {message.attachments.map((att, idx) =>
                      att.type === 'image' ? (
                        <a
                          key={att.id || idx}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={att.url}
                            alt={att.fileName || 'Image'}
                            style={{
                              maxWidth: '100%',
                              maxHeight: 200,
                              borderRadius: 6,
                              display: 'block',
                            }}
                            onError={(e) => {
                              e.target.style.display = 'none'
                            }}
                          />
                        </a>
                      ) : (
                        <a
                          key={att.id || idx}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 10px',
                            background: isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
                            borderRadius: 6,
                            color: 'inherit',
                            textDecoration: 'none',
                            fontSize: 12,
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          {att.fileName || 'Download file'}
                          {att.fileSize ? ` (${Math.round(att.fileSize / 1024)}KB)` : ''}
                        </a>
                      ),
                    )}
                  </div>
                )}

                {/* Poll */}
                {message.poll && (
                  <MessagePollDisplay
                    poll={message.poll}
                    messageId={message.id}
                    currentUserId={currentUserId}
                    isOwn={isOwn}
                  />
                )}
              </>
            )}

            {message.editedAt && !isDeleted && (
              <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>(edited)</div>
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
          <div
            style={{
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
            }}
          >
            {/* Reply button */}
            {onReply && (
              <button
                onClick={onReply}
                title="Reply"
                aria-label="Reply to message"
                style={actionBtnStyle}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 17 4 12 9 7" />
                  <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                </svg>
              </button>
            )}
            {canEdit && (
              <button
                onClick={onStartEdit}
                title="Edit"
                aria-label="Edit message"
                style={actionBtnStyle}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
            {isOwn && (
              <button
                onClick={onDelete}
                title="Delete"
                aria-label="Delete message"
                style={{ ...actionBtnStyle, color: 'var(--sh-danger-text)' }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
