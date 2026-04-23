export function formatRelativeTime(date) {
  if (!date) return ''

  const now = new Date()
  const messageDate = new Date(date)
  const seconds = Math.floor((now - messageDate) / 1000)

  if (seconds < 60) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`

  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}w ago`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`

  return messageDate.toLocaleDateString()
}

export function formatMessageTime(date) {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function formatDateSeparator(date) {
  if (!date) return ''
  const d = new Date(date)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const isToday = d.toDateString() === today.toDateString()
  const isYesterday = d.toDateString() === yesterday.toDateString()

  if (isToday) return 'Today'
  if (isYesterday) return 'Yesterday'

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  })
}

export function groupMessagesByDate(messages) {
  if (!messages || messages.length === 0) return {}

  const groups = {}

  messages.forEach((msg) => {
    const dateStr = msg.createdAt || msg.timestamp
    if (!dateStr) return
    const d = new Date(dateStr)
    const key = d.toDateString()

    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(msg)
  })

  return groups
}

export function getConversationDisplayName(conversation, currentUserId) {
  if (!conversation) return ''
  if (conversation.type === 'group') return conversation.name || 'Group Chat'
  // For DMs, show the other participant's username
  const other = conversation.participants?.find((p) => p.id !== currentUserId)
  return other?.username || 'Unknown User'
}

export function getConversationAvatar(conversation, currentUserId) {
  if (!conversation) return null
  if (conversation.type === 'group') return conversation.avatarUrl || null
  const other = conversation.participants?.find((p) => p.id !== currentUserId)
  return other?.avatarUrl || null
}

export function truncateText(text, maxLength = 60) {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

export function groupReactions(reactions) {
  const groups = {}
  for (const r of reactions) {
    if (!groups[r.emoji]) groups[r.emoji] = { emoji: r.emoji, count: 0 }
    groups[r.emoji].count++
  }
  return Object.values(groups)
}
