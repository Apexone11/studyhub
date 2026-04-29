import { useEffect, useRef, useState } from 'react'
import { TENOR_API_KEY } from '../config'

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
  const timerRef = useRef(null)

  const trimmedQuery = query.trim()
  const hasTenorApiKey = Boolean(String(TENOR_API_KEY || '').trim())
  const displayResults = hasTenorApiKey && trimmedQuery ? results : []
  const displayLoading = hasTenorApiKey && trimmedQuery ? loading : false

  useEffect(() => {
    if (!trimmedQuery) return undefined
    if (!hasTenorApiKey) return undefined

    let cancelled = false
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      if (cancelled) return
      setLoading(true)

      try {
        const response = await fetch(
          `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(trimmedQuery)}&key=${encodeURIComponent(TENOR_API_KEY)}&client_key=studyhub&limit=12&media_filter=tinygif,gif`,
        )

        if (response.ok && !cancelled) {
          const data = await response.json()
          const gifs = (data.results || []).map((item) => ({
            id: item.id,
            preview: item.media_formats?.tinygif?.url || item.media_formats?.gif?.url || '',
            full: item.media_formats?.gif?.url || item.media_formats?.tinygif?.url || '',
            title: item.content_description || 'GIF',
          }))
          setResults(gifs)
        }
      } catch {
        // Silent network failure: leave the picker usable for another search.
      }

      if (!cancelled) setLoading(false)
    }, 400)

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [hasTenorApiKey, trimmedQuery])

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

        {!hasTenorApiKey && trimmedQuery ? (
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

        {hasTenorApiKey && !displayLoading && displayResults.length === 0 && trimmedQuery ? (
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
