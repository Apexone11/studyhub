import { useState, useRef, useEffect, useCallback } from 'react'
import { API } from '../../../config'
import { SearchIcon, CloseIcon } from './icons'
import './admin-primitives.css'

export default function UserSearchInput({ value, onChange, label = 'User' }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const timerRef = useRef(null)
  const wrapperRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const search = useCallback((q) => {
    if (q.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    setLoading(true)
    setSearchError(false)
    fetch(`${API}/api/admin/users/search?q=${encodeURIComponent(q)}&limit=10`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((data) => {
        setResults(Array.isArray(data) ? data : [])
        setSearchError(false)
        setOpen(true)
      })
      .catch(() => {
        setResults([])
        setSearchError(true)
        setOpen(true)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleInput = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(val), 300)
  }

  const handleSelect = (user) => {
    onChange(user)
    setQuery('')
    setOpen(false)
    setResults([])
  }

  const handleClear = () => {
    onChange(null)
    setQuery('')
    setResults([])
  }

  if (value) {
    return (
      <div className="admin-field">
        {label && <span className="admin-field__label">{label}</span>}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid var(--sh-border)',
            background: 'var(--sh-soft)',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 14,
          }}
        >
          {value.avatarUrl ? (
            <img
              src={value.avatarUrl}
              alt=""
              loading="lazy"
              style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--sh-brand-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--sh-brand)',
              }}
            >
              {(value.username || '?')[0].toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: 'var(--sh-heading)' }}>
              {value.displayName || value.username}
            </div>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
              @{value.username} · {value.email}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--sh-muted)',
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="Clear selection"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-field" ref={wrapperRef} style={{ position: 'relative' }}>
      {label && <span className="admin-field__label">{label}</span>}
      <div style={{ position: 'relative' }}>
        <SearchIcon
          size={16}
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--sh-muted)',
            pointerEvents: 'none',
          }}
        />
        <input
          className="admin-field__input"
          style={{ paddingLeft: 36 }}
          placeholder="Search by name or email..."
          value={query}
          onChange={handleInput}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
      </div>
      {open && results.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            marginTop: 4,
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {results.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => handleSelect(user)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 14px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sh-soft)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  loading="lazy"
                  style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--sh-brand-soft)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--sh-brand)',
                  }}
                >
                  {(user.username || '?')[0].toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--sh-heading)' }}>
                  {user.displayName || user.username}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--sh-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  @{user.username} · {user.email}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {loading && query.length >= 2 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            marginTop: 4,
            padding: '16px',
            textAlign: 'center',
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            borderRadius: 12,
            color: 'var(--sh-muted)',
            fontSize: 13,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          Searching...
        </div>
      )}
      {open && !loading && results.length === 0 && query.length >= 2 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            marginTop: 4,
            padding: '16px',
            textAlign: 'center',
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            borderRadius: 12,
            color: searchError ? 'var(--sh-danger-text)' : 'var(--sh-muted)',
            fontSize: 13,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {searchError ? 'Search failed. Check connection and try again.' : 'No users found.'}
        </div>
      )}
    </div>
  )
}
