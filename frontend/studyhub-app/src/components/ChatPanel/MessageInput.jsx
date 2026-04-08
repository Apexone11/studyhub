import { useRef } from 'react'
import GifSearchPanel from './GifSearchPanel'

const PAGE_FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

function truncate(text, max = 50) {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '...' : text
}

export default function MessageInput({
  input,
  onInputChange,
  onSend,
  onKeyDown,
  sending,
  replyTo,
  onCancelReply,
  attachmentPreviews,
  onRemoveAttachment,
  showImageInput,
  imageUrl,
  onImageUrlChange,
  onToggleImageInput,
  showGifPicker,
  onToggleGifPicker,
  onGifSelect,
  onFileSelect,
  emitTypingStart,
}) {
  const fileInputRef = useRef(null)

  const canSend = input.trim() || attachmentPreviews.length > 0 || (showImageInput && imageUrl.trim())

  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid var(--sh-border)' }}>
      {/* Reply-to banner */}
      {replyTo && (
        <div style={{
          marginBottom: 6, padding: '5px 8px',
          background: 'var(--sh-soft)', borderRadius: 6,
          border: '1px solid var(--sh-border)', borderLeft: '3px solid var(--sh-brand)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--sh-brand)' }}>
              Replying to {replyTo.sender?.username || 'message'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--sh-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {truncate(replyTo.content, 50)}
            </div>
          </div>
          <button onClick={onCancelReply} aria-label="Cancel reply" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sh-muted)', fontSize: 13, padding: '0 3px', fontFamily: PAGE_FONT }}>x</button>
        </div>
      )}

      {/* Attachment previews */}
      {attachmentPreviews.length > 0 && (
        <div style={{ marginBottom: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {attachmentPreviews.map((ap, i) => (
            <div key={i} style={{ position: 'relative', border: '1px solid var(--sh-border)', borderRadius: 4, overflow: 'hidden' }}>
              {ap.type === 'image' && ap.previewUrl ? (
                <img src={ap.previewUrl} alt={ap.name} style={{ width: 52, height: 52, objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: 52, height: 52, display: 'grid', placeItems: 'center', background: 'var(--sh-soft)', fontSize: 9, color: 'var(--sh-muted)', padding: 3, textAlign: 'center', wordBreak: 'break-all' }}>
                  {truncate(ap.name, 10)}
                </div>
              )}
              <button
                onClick={() => onRemoveAttachment(i)}
                aria-label={`Remove attachment ${ap.name || ''}`}
                style={{
                  position: 'absolute', top: 1, right: 1,
                  width: 14, height: 14, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.6)', color: 'white',
                  border: 'none', cursor: 'pointer', fontSize: 9,
                  display: 'grid', placeItems: 'center', lineHeight: 1,
                }}
              >x</button>
            </div>
          ))}
        </div>
      )}

      {/* Image URL input */}
      {showImageInput && (
        <div style={{ marginBottom: 6, display: 'flex', gap: 4 }}>
          <input
            type="text"
            placeholder="Paste image URL..."
            aria-label="Image URL"
            value={imageUrl}
            onChange={(e) => onImageUrlChange(e.target.value)}
            autoFocus
            style={{ flex: 1, padding: '5px 8px', background: 'var(--sh-surface)', color: 'var(--sh-text)', border: '1px solid var(--sh-border)', borderRadius: 6, fontSize: 11, fontFamily: PAGE_FONT }}
          />
          <button onClick={() => onToggleImageInput(false)} style={{ padding: '3px 6px', background: 'var(--sh-soft)', color: 'var(--sh-muted)', border: '1px solid var(--sh-border)', borderRadius: 6, fontSize: 10, cursor: 'pointer', fontFamily: PAGE_FONT }}>
            Cancel
          </button>
        </div>
      )}

      {/* GIF search panel */}
      {showGifPicker && (
        <GifSearchPanel
          onSelect={onGifSelect}
          onClose={() => onToggleGifPicker(false)}
        />
      )}

      {/* Action bar + text input */}
      <form onSubmit={onSend} style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.gif,.pdf,.doc,.docx,.txt,.zip"
          multiple
          onChange={onFileSelect}
          style={{ display: 'none' }}
        />

        {/* File attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
          aria-label="Attach file"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: attachmentPreviews.length > 0 ? 'var(--sh-brand)' : 'var(--sh-muted)', padding: '5px 2px', flexShrink: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
        </button>
        {/* Image URL button */}
        <button
          type="button"
          onClick={() => onToggleImageInput(!showImageInput)}
          title="Share image URL"
          aria-label="Share image URL"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: showImageInput ? 'var(--sh-brand)' : 'var(--sh-muted)', padding: '5px 2px', flexShrink: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
        </button>
        {/* GIF button */}
        <button
          type="button"
          onClick={() => onToggleGifPicker(!showGifPicker)}
          title="Send GIF"
          aria-label="Send GIF"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: showGifPicker ? 'var(--sh-brand)' : 'var(--sh-muted)', padding: '5px 2px', flexShrink: 0, fontWeight: 800, fontSize: 11, fontFamily: PAGE_FONT }}
        >
          GIF
        </button>

        <textarea
          value={input}
          onChange={e => { onInputChange(e.target.value); if (e.target.value.trim()) emitTypingStart() }}
          onKeyDown={onKeyDown}
          placeholder="Type a message..."
          aria-label="Message input"
          rows={1}
          maxLength={5000}
          style={{
            flex: 1, resize: 'none', border: '1px solid var(--sh-border)',
            borderRadius: 10, padding: '7px 10px', fontSize: 12,
            fontFamily: PAGE_FONT, background: 'var(--sh-surface)',
            color: 'var(--sh-text)', outline: 'none', maxHeight: 80,
            lineHeight: 1.4,
          }}
        />
        <button
          type="submit"
          disabled={!canSend || sending}
          aria-label="Send message"
          style={{
            background: 'var(--sh-brand)', color: 'var(--sh-surface)',
            border: 'none', borderRadius: 10, padding: '7px 14px',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            opacity: (!canSend || sending) ? 0.5 : 1,
            fontFamily: PAGE_FONT, transition: 'opacity .15s',
            flexShrink: 0,
          }}
        >
          Send
        </button>
      </form>
    </div>
  )
}
