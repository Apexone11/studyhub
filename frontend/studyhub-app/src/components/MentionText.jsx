/* ═══════════════════════════════════════════════════════════════════════════
 * MentionText — Renders text with @mention usernames highlighted as links
 *
 * Usage:  <MentionText text="Hello @john, check this out!" />
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link } from 'react-router-dom'

export default function MentionText({ text, style }) {
  if (!text) return null

  const re = /(^|[\s(])@([a-zA-Z0-9_]{3,20})(?=$|[\s),.!?:;])/g
  const parts = []
  let lastIndex = 0

  for (const match of text.matchAll(re)) {
    const [fullMatch, prefix, username] = match
    const matchStart = match.index

    // Add text before the match (including the prefix whitespace)
    if (matchStart + prefix.length > lastIndex) {
      parts.push(text.slice(lastIndex, matchStart + prefix.length))
    }

    // Add the @mention as a link
    parts.push(
      <Link
        key={`${username}-${matchStart}`}
        to={`/users/${username}`}
        style={{
          color: '#3b82f6',
          fontWeight: 700,
          textDecoration: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        @{username}
      </Link>
    )

    lastIndex = matchStart + fullMatch.length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  // If no mentions found, just return the text
  if (parts.length === 0) return <span style={style}>{text}</span>

  return <span style={style}>{parts}</span>
}
