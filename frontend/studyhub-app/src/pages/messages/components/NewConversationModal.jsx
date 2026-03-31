/* ─────────────────────────────────────────────────────────────
 * NewConversationModal.jsx
 * Modal to start a new DM or group conversation
 * ───────────────────────────────────────────────────────────── */
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import UserAvatar from '../../../components/UserAvatar'
import { PAGE_FONT, authHeaders } from '../../shared/pageUtils'
import { API } from '../../../config'

export function NewConversationModal({ isOpen, onClose, onCreate, currentUserId }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUsers, setSelectedUsers] = useState([])
  const [groupName, setGroupName] = useState('')
  const [isGroup, setIsGroup] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const query = searchQuery.trim()

    if (!query) {
      setSearchResults([])
      setLoading(false)
      return undefined
    }

    setLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `${API}/api/search?q=${encodeURIComponent(query)}&type=users&limit=10`,
          { headers: authHeaders(), credentials: 'include' },
        )
        if (response.ok) {
          const data = await response.json()
          const users = (data.results?.users || data.users || [])
            .filter((u) => u.id !== currentUserId)
          setSearchResults(users)
        } else {
          setSearchResults([])
        }
      } catch {
        setSearchResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => window.clearTimeout(timer)
  }, [searchQuery, currentUserId])

  const handleUserSelect = (user) => {
    if (selectedUsers.find((u) => u.id === user.id)) {
      setSelectedUsers(selectedUsers.filter((u) => u.id !== user.id))
    } else {
      setSelectedUsers([...selectedUsers, user])
    }
  }

  const handleCreate = () => {
    if (isGroup && (!groupName.trim() || selectedUsers.length === 0)) return
    if (!isGroup && selectedUsers.length === 0) return

    onCreate({
      isGroup,
      groupName: isGroup ? groupName : null,
      participantIds: selectedUsers.map((u) => u.id),
    })

    setSearchQuery('')
    setSelectedUsers([])
    setGroupName('')
    setIsGroup(false)
  }

  if (!isOpen) return null

  const canCreate = isGroup
    ? (groupName.trim() && selectedUsers.length > 0)
    : selectedUsers.length > 0

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Start a conversation"
    >
      <div style={{
        width: '90%',
        maxWidth: 450,
        background: 'var(--sh-surface)',
        borderRadius: 'var(--radius-card)',
        padding: 24,
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        fontFamily: PAGE_FONT,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--sh-heading)' }}>
            Start a Conversation
          </h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              color: 'var(--sh-muted)',
              cursor: 'pointer',
            }}
          >
            x
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 12 }}>
            <input type="radio" name="type" checked={!isGroup} onChange={() => setIsGroup(false)} />
            Direct Message
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="radio" name="type" checked={isGroup} onChange={() => setIsGroup(true)} />
            Group Chat
          </label>
        </div>

        {isGroup && (
          <input
            type="text"
            placeholder="Group name..."
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'var(--sh-input-bg)',
              color: 'var(--sh-input-text)',
              border: '1px solid var(--sh-input-border)',
              borderRadius: 'var(--radius-control)',
              fontSize: 13,
              fontFamily: PAGE_FONT,
              marginBottom: 12,
            }}
          />
        )}

        <input
          type="text"
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--sh-input-bg)',
            color: 'var(--sh-input-text)',
            border: '1px solid var(--sh-input-border)',
            borderRadius: 'var(--radius-control)',
            fontSize: 13,
            fontFamily: PAGE_FONT,
            marginBottom: 12,
          }}
          aria-label="Search users"
        />

        <div style={{
          maxHeight: 200,
          overflowY: 'auto',
          marginBottom: 16,
          border: '1px solid var(--sh-border)',
          borderRadius: 'var(--radius)',
          padding: 8,
        }}>
          {loading && (
            <div style={{ padding: 8, color: 'var(--sh-muted)', textAlign: 'center', fontSize: 13 }}>
              Searching...
            </div>
          )}

          {!loading && searchResults.length === 0 && searchQuery && (
            <div style={{ padding: 8, color: 'var(--sh-muted)', textAlign: 'center', fontSize: 13 }}>
              No users found
            </div>
          )}

          {!loading && searchResults.map((user) => (
            <button
              key={user.id}
              onClick={() => handleUserSelect(user)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: selectedUsers.find((u) => u.id === user.id) ? 'var(--sh-brand-soft)' : 'transparent',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                fontSize: 13,
                borderRadius: 'var(--radius-sm)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!selectedUsers.find((u) => u.id === user.id)) {
                  e.currentTarget.style.background = 'var(--sh-soft)'
                }
              }}
              onMouseLeave={(e) => {
                if (!selectedUsers.find((u) => u.id === user.id)) {
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={24} />
              <span>{user.username}</span>
            </button>
          ))}
        </div>

        {selectedUsers.length > 0 && (
          <div style={{ marginBottom: 16, fontSize: 12 }}>
            <div style={{ color: 'var(--sh-muted)', marginBottom: 6 }}>
              Selected ({selectedUsers.length}):
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {selectedUsers.map((user) => (
                <div
                  key={user.id}
                  style={{
                    padding: '4px 8px',
                    background: 'var(--sh-brand-soft)',
                    color: 'var(--sh-brand-hover)',
                    borderRadius: 'var(--radius-full)',
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                  }}
                >
                  {user.username}
                  <button
                    onClick={() => handleUserSelect(user)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      fontSize: 12,
                      padding: 0,
                      lineHeight: 1,
                    }}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'var(--sh-soft)',
              color: 'var(--sh-text)',
              border: '1px solid var(--sh-border)',
              borderRadius: 'var(--radius-control)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: PAGE_FONT,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            style={{
              padding: '8px 16px',
              background: canCreate ? 'var(--sh-brand)' : 'var(--sh-soft)',
              color: canCreate ? 'var(--sh-surface)' : 'var(--sh-muted)',
              border: 'none',
              borderRadius: 'var(--radius-control)',
              fontSize: 13,
              fontWeight: 700,
              cursor: canCreate ? 'pointer' : 'default',
              fontFamily: PAGE_FONT,
            }}
          >
            Start Chat
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
