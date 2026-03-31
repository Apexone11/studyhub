/* ─────────────────────────────────────────────────────────────
 * GifSearchPanel.jsx
 * GIF search and selection panel (Tenor API)
 * ───────────────────────────────────────────────────────────── */
import { useState, useRef, useEffect } from 'react'
import { TENOR_API_KEY } from '../../../config'
import { PAGE_FONT } from '../../shared/pageUtils'

export function GifSearchPanel({ onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef(null)

  // Derived: if query is empty, results are empty (no effect needed)
  const trimmedQuery = query.trim()
  const displayResults = trimmedQuery ? results : []
  const displayLoading = trimmedQuery ? loading : false

  useEffect(() => {
    if (!trimmedQuery) return undefined

    let cancelled = false
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      if (cancelled) return
      setLoading(true)
      try {
        const resp = await fetch(
          `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(trimmedQuery)}&key=${encodeURIComponent(TENOR_API_KEY)}&client_key=studyhub&limit=12&media_filter=tinygif,gif`
        )
        if (resp.ok && !cancelled) {
          const data = await resp.json()
          const gifs = (data.results || []).map((item) => ({
            id: item.id,
            preview: item.media_formats?.tinygif?.url || item.media_formats?.gif?.url || '',
            full: item.media_formats?.gif?.url || item.media_formats?.tinygif?.url || '',
            title: item.content_description || 'GIF',
          }))
          setResults(gifs)
        }
      } catch { /* silent */ }
      if (!cancelled) setLoading(false)
    }, 400)
    return () => { cancelled = true; if (timerRef.current) clearTimeout(timerRef.current) }
  }, [trimmedQuery])

  return (
    <div style={{
      marginBottom: 8, padding: '10px 12px',
      background: 'var(--sh-soft)', borderRadius: 'var(--radius-control)',
      border: '1px solid var(--sh-border)', maxHeight: 380, display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sh-heading)', fontFamily: PAGE_FONT }}>Search GIFs</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sh-muted)', fontSize: 12, fontFamily: PAGE_FONT }}>Cancel</button>
      </div>
      <input
        type="text"
        placeholder="Search for GIFs..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        style={{
          width: '100%', padding: '6px 10px', marginBottom: 6,
          background: 'var(--sh-input-bg)', color: 'var(--sh-input-text)',
          border: '1px solid var(--sh-input-border)', borderRadius: 'var(--radius-control)',
          fontSize: 12, fontFamily: PAGE_FONT, boxSizing: 'border-box',
        }}
      />
      <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {displayLoading && <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--sh-muted)', fontSize: 12, padding: 8 }}>Searching...</div>}
        {!displayLoading && displayResults.length === 0 && trimmedQuery && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--sh-muted)', fontSize: 12, padding: 8 }}>No GIFs found</div>
        )}
        {displayResults.map((gif) => (
          <button
            key={gif.id}
            onClick={() => onSelect(gif)}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
              borderRadius: 6, overflow: 'hidden',
            }}
          >
            <img src={gif.preview} alt={gif.title} loading="lazy" style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
          </button>
        ))}
      </div>
      <div style={{ textAlign: 'right', fontSize: 9, color: 'var(--sh-muted)', marginTop: 4 }}>Powered by Tenor</div>
    </div>
  )
}
