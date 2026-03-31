/* ─────────────────────────────────────────────────────────────
 * MessageSearchBar.jsx
 * Search bar for filtering messages in current conversation
 * ───────────────────────────────────────────────────────────── */
import { useState } from 'react'
import { PAGE_FONT } from '../../shared/pageUtils'

export function MessageSearchBar({ messages, onClose }) {
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
