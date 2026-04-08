import { useEffect, useState } from 'react'
import { API } from '../../config'
import { showToast } from '../../lib/toast'

export default function NoteTagsInput({ noteId, initialTags = [], onTagsChange }) {
  const [tags, setTags] = useState(initialTags)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setTags(Array.isArray(initialTags) ? initialTags : [])
  }, [initialTags, noteId])

  const updateTags = async (newTags) => {
    setLoading(true)
    try {
      const response = await fetch(`${API}/api/notes/${noteId}/tags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: newTags }),
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to update tags')
      }

      const data = await response.json().catch(() => ({}))
      const savedTags = Array.isArray(data.tags) ? data.tags : newTags
      setTags(savedTags)
      onTagsChange?.(savedTags)
      showToast('Tags updated', 'success')
    } catch (err) {
      console.error('Error updating tags:', err)
      showToast('Failed to update tags', 'error')
    } finally {
      setLoading(false)
    }
  }

  const addTag = () => {
    const trimmed = input.trim().toLowerCase()

    // Validation
    if (!trimmed) return
    if (trimmed.length > 30) {
      showToast('Tag must be 30 characters or less', 'error')
      return
    }
    if (tags.length >= 10) {
      showToast('Maximum 10 tags allowed', 'error')
      return
    }
    if (tags.includes(trimmed)) {
      showToast('Tag already exists', 'info')
      setInput('')
      return
    }

    const newTags = [...tags, trimmed]
    setInput('')
    updateTags(newTags)
  }

  const removeTag = (tagToRemove) => {
    const newTags = tags.filter((t) => t !== tagToRemove)
    updateTags(newTags)
  }

  const handleKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault()
      addTag()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-1)',
        alignItems: 'flex-start',
      }}
    >
      {/* Tag pills */}
      {tags.map((tag) => (
        <div
          key={tag}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'var(--sh-brand-soft)',
            color: 'var(--sh-brand)',
            borderRadius: '6px',
            padding: '2px 8px',
            fontSize: '11px',
            fontWeight: '600',
          }}
        >
          <span>{tag}</span>
          <button
            type="button"
            disabled={loading}
            onClick={() => removeTag(tag)}
            aria-label={`Remove tag ${tag}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: loading ? 'not-allowed' : 'pointer',
              padding: '0',
              marginLeft: '2px',
              fontSize: '12px',
              opacity: 0.7,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--sh-danger)'
              e.currentTarget.style.opacity = '1'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--sh-brand)'
              e.currentTarget.style.opacity = '0.7'
            }}
          >
            &#215;
          </button>
        </div>
      ))}

      {/* Input field */}
      {tags.length < 10 && (
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder="Add tag..."
          aria-label="Add tag"
          style={{
            flex: '1 1 auto',
            minWidth: '80px',
            background: 'none',
            border: 'none',
            outline: 'none',
            color: 'var(--sh-input-text)',
            fontSize: '12px',
            padding: '4px 0',
            fontFamily: 'var(--font)',
          }}
        />
      )}
    </div>
  )
}
