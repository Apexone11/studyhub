import { useRef, useEffect } from 'react'
import MessageBubble from './MessageBubble'

const PAGE_FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

export default function MessageThread({
  messages,
  currentUserId,
  typingUsers,
  onReply,
  hoveredMsgId,
  onHoverChange,
}) {
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {messages.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-muted)', fontSize: 13 }}>
            No messages yet. Say hello!
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              currentUserId={currentUserId}
              onReply={onReply}
              isHovered={hoveredMsgId === msg.id}
              onHoverChange={onHoverChange}
            />
          ))
        )}
        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div
            style={{
              padding: '4px 0',
              fontSize: 11,
              color: 'var(--sh-muted)',
              fontStyle: 'italic',
            }}
          >
            {typingUsers.map((u) => u.username).join(', ')}{' '}
            {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
