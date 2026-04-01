import { Link } from 'react-router-dom'

const PAGE_FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

export default function ChatHeader({ activeId, activeConvo, onBack, onClose }) {
  return (
    <div style={{
      padding: '14px 16px', borderBottom: '1px solid var(--sh-border)',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      {activeId ? (
        <>
          <button
            onClick={onBack}
            aria-label="Back to conversations"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--sh-brand)', fontSize: 16, padding: 4,
            }}
          >
            &larr;
          </button>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--sh-heading)', flex: 1 }}>
            {activeConvo?.participants?.[0]?.username || activeConvo?.name || 'Chat'}
          </span>
        </>
      ) : (
        <>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--sh-heading)', flex: 1 }}>
            Messages
          </span>
          <Link
            to="/messages"
            onClick={onClose}
            style={{ fontSize: 12, color: 'var(--sh-brand)', textDecoration: 'none', fontWeight: 600 }}
          >
            Open full
          </Link>
        </>
      )}
      <button
        onClick={onClose}
        aria-label="Close chat panel"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--sh-muted)', fontSize: 18, padding: 4, lineHeight: 1,
        }}
      >
        x
      </button>
    </div>
  )
}
