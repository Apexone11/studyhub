/* ─────────────────────────────────────────────────────────────
 * MessagePollDisplay.jsx
 * Shows a poll with voting interface
 * ───────────────────────────────────────────────────────────── */
import { useState } from 'react'
import { API } from '../../../config'
import { authHeaders, PAGE_FONT } from '../../shared/pageUtils'

export function MessagePollDisplay({ poll, messageId, currentUserId, isOwn }) {
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
    } catch {
      /* silent */
    }
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
    } catch {
      /* silent */
    }
  }

  return (
    <div
      style={{
        marginTop: 8,
        padding: '10px 12px',
        background: 'rgba(0,0,0,0.08)',
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
        {poll.question}
        {isClosed && (
          <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6, opacity: 0.7 }}>
            (Closed)
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {poll.options?.map((opt) => {
          const voteCount = opt.votes?.length || 0
          const hasVoted = opt.votes?.some(
            (v) => v.user?.id === currentUserId || v.userId === currentUserId,
          )
          const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0

          return (
            <button
              key={opt.id}
              onClick={() => !isClosed && handleVote(opt.id)}
              disabled={isClosed || voting}
              style={{
                position: 'relative',
                overflow: 'hidden',
                padding: '6px 10px',
                borderRadius: 6,
                border: hasVoted ? '2px solid var(--sh-brand)' : '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)',
                color: 'inherit',
                cursor: isClosed ? 'default' : 'pointer',
                fontSize: 12,
                fontWeight: hasVoted ? 600 : 400,
                fontFamily: PAGE_FONT,
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: `${pct}%`,
                  background: 'rgba(255,255,255,0.12)',
                  transition: 'width 0.3s',
                }}
              />
              <span style={{ position: 'relative', zIndex: 1 }}>{opt.text}</span>
              <span style={{ position: 'relative', zIndex: 1, fontSize: 11, opacity: 0.8 }}>
                {voteCount} ({pct}%)
              </span>
            </button>
          )
        })}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: 11,
          opacity: 0.7,
        }}
      >
        <span>
          {totalVotes} vote{totalVotes === 1 ? '' : 's'}
          {poll.allowMultiple ? ' (multiple choice)' : ''}
        </span>
        {isOwn && !isClosed && (
          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              textDecoration: 'underline',
              fontFamily: PAGE_FONT,
            }}
          >
            Close poll
          </button>
        )}
      </div>
    </div>
  )
}
