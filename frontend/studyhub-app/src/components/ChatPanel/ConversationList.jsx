import { Link } from 'react-router-dom'
import UserAvatar from '../UserAvatar'

const PAGE_FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

function relTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function ConversationList({
  conversations,
  loading,
  onSelectConversation,
  onOpenFull,
}) {
  return (
    <>
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-muted)', fontSize: 13 }}>
          Loading...
        </div>
      ) : conversations.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ color: 'var(--sh-muted)', fontSize: 13, margin: 0 }}>No conversations yet</p>
          <Link
            to="/messages"
            onClick={onOpenFull}
            style={{
              color: 'var(--sh-brand)',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Start a chat
          </Link>
        </div>
      ) : (
        conversations.map((c) => {
          const other = c.participants?.[0] || {}
          return (
            <button
              key={c.id}
              onClick={() => onSelectConversation(c.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 16px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                borderBottom: '1px solid var(--sh-border)',
                fontFamily: PAGE_FONT,
              }}
            >
              <UserAvatar username={other.username} avatarUrl={other.avatarUrl} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: c.unreadCount > 0 ? 800 : 600,
                    fontSize: 13,
                    color: 'var(--sh-heading)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {other.username || 'Unknown'}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: c.unreadCount > 0 ? 'var(--sh-text)' : 'var(--sh-muted)',
                    fontWeight: c.unreadCount > 0 ? 600 : 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.lastMessage?.content?.slice(0, 50) || 'No messages yet'}
                </div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--sh-muted)', flexShrink: 0 }}>
                {relTime(c.lastMessage?.createdAt || c.updatedAt)}
              </span>
              {c.unreadCount > 0 && (
                <span
                  aria-label={`${c.unreadCount} unread`}
                  style={{
                    minWidth: 18,
                    height: 18,
                    borderRadius: 99,
                    background: 'var(--sh-danger)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  {c.unreadCount > 9 ? '9+' : c.unreadCount}
                </span>
              )}
            </button>
          )
        })
      )}
    </>
  )
}
