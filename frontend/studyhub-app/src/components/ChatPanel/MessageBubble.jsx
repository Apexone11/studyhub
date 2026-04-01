const PAGE_FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

function truncate(text, max = 50) {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '...' : text
}

export default function MessageBubble({ msg, currentUserId, onReply, isHovered, onHoverChange }) {
  const isOwn = msg.sender?.id === currentUserId || msg.senderId === currentUserId
  const isDeleted = Boolean(msg.deletedAt)

  // Find reply-to message
  const replyToMsg = msg.replyToId
    ? (msg.replyTo || null)
    : null

  return (
    <div
      style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', position: 'relative' }}
      onMouseEnter={() => onHoverChange(msg.id)}
      onMouseLeave={() => onHoverChange(null)}
    >
      <div style={{ maxWidth: '80%', position: 'relative' }}>
        {/* Reply-to reference */}
        {replyToMsg && !isDeleted && (
          <div style={{
            padding: '3px 6px', marginBottom: 1,
            background: isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
            borderRadius: '6px 6px 0 0',
            borderLeft: '2px solid var(--sh-brand)',
            fontSize: 10, color: isOwn ? 'rgba(255,255,255,0.8)' : 'var(--sh-muted)',
          }}>
            <span style={{ fontWeight: 600 }}>{replyToMsg.sender?.username || 'User'}</span>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {truncate(replyToMsg.content, 40)}
            </div>
          </div>
        )}

        <div style={{
          padding: '8px 12px', borderRadius: replyToMsg && !isDeleted ? '0 0 12px 12px' : 12,
          background: isOwn ? 'var(--sh-brand)' : 'var(--sh-soft)',
          color: isOwn ? 'var(--sh-surface)' : 'var(--sh-text)',
          fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word',
        }}>
          {isDeleted ? (
            <em style={{ opacity: 0.6 }}>[Message deleted]</em>
          ) : (
            msg.content
          )}

          {/* Inline attachments */}
          {!isDeleted && Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {msg.attachments.map((att, idx) => (
                att.type === 'image' ? (
                  <a key={att.id || idx} href={att.url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={att.url}
                      alt={att.fileName || 'Image'}
                      style={{ maxWidth: '100%', maxHeight: 140, borderRadius: 4, display: 'block' }}
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
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '4px 8px',
                      background: isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
                      borderRadius: 4, color: 'inherit', textDecoration: 'none', fontSize: 11,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    {att.fileName || 'Download'}
                    {att.fileSize ? ` (${Math.round(att.fileSize / 1024)}KB)` : ''}
                  </a>
                )
              ))}
            </div>
          )}

          <div style={{ fontSize: 10, marginTop: 3, textAlign: 'right', opacity: 0.7 }}>
            {new Date(msg.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            {msg.editedAt ? ' (edited)' : ''}
          </div>
        </div>

        {/* Reply action on hover */}
        {isHovered && !isDeleted && !msg.pending && (
          <button
            onClick={() => onReply(msg)}
            title="Reply"
            style={{
              position: 'absolute', top: -8, right: isOwn ? 0 : undefined, left: isOwn ? undefined : 0,
              width: 22, height: 22, borderRadius: 4,
              background: 'var(--sh-surface)', border: '1px solid var(--sh-border)',
              cursor: 'pointer', display: 'grid', placeItems: 'center',
              boxShadow: '0 1px 4px rgba(0,0,0,0.1)', color: 'var(--sh-muted)',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
          </button>
        )}
      </div>
    </div>
  )
}
