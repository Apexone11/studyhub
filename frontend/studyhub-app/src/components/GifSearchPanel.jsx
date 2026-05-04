import { useEffect, useRef, useState } from 'react'
import { API } from '../config'

const PAGE_FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

export default function GifSearchPanel({
  onSelect,
  onClose,
  maxHeight = 360,
  previewHeight = 112,
  marginBottom = 8,
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const timerRef = useRef(null)

  const trimmedQuery = query.trim()
  // Empty query: render zero results without setting state in an effect.
  // Effect only runs when there's actually a query to fetch.
  const displayResults = !trimmedQuery || unavailable ? [] : results
  const displayLoading = !trimmedQuery || unavailable ? false : loading

  useEffect(() => {
    if (!trimmedQuery) return undefined

    let cancelled = false
    const controller = new AbortController()
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      if (cancelled) return
      setLoading(true)
      // Always start from "available" — a prior 503 must not stick across
      // searches so a key rotation or recovery is visible to the user. We
      // call the setter unconditionally; React no-ops if value is already
      // false. Avoids a stale-closure read on `unavailable` in the effect.
      setUnavailable(false)

      try {
        const response = await fetch(
          `${API}/api/gifs/search?q=${encodeURIComponent(trimmedQuery)}&limit=12`,
          { credentials: 'include', signal: controller.signal },
        )

        if (response.status === 503) {
          if (!cancelled) {
            setUnavailable(true)
            setResults([])
          }
        } else if (response.ok && !cancelled) {
          const data = await response.json().catch(() => ({}))
          const gifs = Array.isArray(data?.results) ? data.results : []
          setResults(gifs)
          setUnavailable(false)
        } else if (!cancelled) {
          // Non-OK + non-503: keep the picker usable, drop stale results.
          setResults([])
        }
      } catch (error) {
        if (error?.name === 'AbortError') return
        // Network blip: clear results so the user can retry.
        if (!cancelled) setResults([])
      }

      if (!cancelled) setLoading(false)
    }, 400)

    return () => {
      cancelled = true
      controller.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [trimmedQuery])

  return (
    <div
      style={{
        marginBottom,
        padding: '10px 12px',
        background: 'var(--sh-soft)',
        borderRadius: 12,
        border: '1px solid var(--sh-border)',
        maxHeight,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--sh-heading)',
            fontFamily: PAGE_FONT,
          }}
        >
          Search GIFs
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--sh-muted)',
            fontSize: 12,
            fontFamily: PAGE_FONT,
            padding: 0,
          }}
        >
          Cancel
        </button>
      </div>

      <input
        type="text"
        placeholder="Search for GIFs..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus
        style={{
          width: '100%',
          padding: '7px 10px',
          background: 'var(--sh-input-bg)',
          color: 'var(--sh-input-text)',
          border: '1px solid var(--sh-input-border)',
          borderRadius: 10,
          fontSize: 12,
          fontFamily: PAGE_FONT,
          boxSizing: 'border-box',
        }}
      />

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        {displayLoading ? (
          <div
            style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              color: 'var(--sh-muted)',
              fontSize: 12,
              padding: 10,
            }}
          >
            Searching...
          </div>
        ) : null}

        {unavailable && trimmedQuery ? (
          <div
            style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              color: 'var(--sh-muted)',
              fontSize: 12,
              padding: 10,
            }}
          >
            GIF search is unavailable
          </div>
        ) : null}

        {!unavailable && !displayLoading && displayResults.length === 0 && trimmedQuery ? (
          <div
            style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              color: 'var(--sh-muted)',
              fontSize: 12,
              padding: 10,
            }}
          >
            No GIFs found
          </div>
        ) : null}

        {displayResults.map((gif) => (
          <button
            key={gif.id}
            type="button"
            onClick={() => onSelect(gif)}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: 0,
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <img
              src={gif.preview}
              alt={gif.title}
              loading="lazy"
              style={{
                width: '100%',
                height: previewHeight,
                objectFit: 'cover',
                borderRadius: 8,
                display: 'block',
              }}
            />
          </button>
        ))}
      </div>

      <div
        style={{ textAlign: 'right', fontSize: 9, color: 'var(--sh-muted)', fontFamily: PAGE_FONT }}
      >
        Powered by Tenor
      </div>
    </div>
  )
}
