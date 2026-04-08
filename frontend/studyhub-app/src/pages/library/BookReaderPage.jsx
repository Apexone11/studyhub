/* ═══════════════════════════════════════════════════════════════════════════
 * BookReaderPage.jsx -- Google Books embedded viewer with bookmarks
 *
 * Uses the Google Books iframe embed for maximum compatibility. Features
 * a toolbar with bookmark creation, bookmark list panel, and progress bar.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { IconArrowLeft } from '../../components/Icons'
import { Skeleton } from '../../components/Skeleton'
import { usePageTitle } from '../../lib/usePageTitle'
import useBookReader from './useBookReader'
import { hasPreview, getPreviewLink } from './libraryHelpers'
import './BookReaderPage.css'

/**
 * Build the Google Books embed URL for the iframe viewer.
 */
function getEmbedUrl(volumeId) {
  return `https://books.google.com/books?id=${encodeURIComponent(volumeId)}&lpg=PP1&pg=PP1&output=embed`
}

export default function BookReaderPage() {
  usePageTitle('Reading')
  const { volumeId } = useParams()
  const navigate = useNavigate()

  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [iframeError, setIframeError] = useState(false)
  const [showBookmarkPanel, setShowBookmarkPanel] = useState(false)
  const [bookmarkLabel, setBookmarkLabel] = useState('')
  const [bookmarkNote, setBookmarkNote] = useState('')
  const [saving, setSaving] = useState(false)

  const {
    book, bookmarks, progress, loading, error,
    bookmarkError, saveProgress, addBookmark, removeBookmark,
  } = useBookReader(volumeId)

  // Save reading progress when the page is visited
  useEffect(() => {
    if (!book || !volumeId) return
    const startPct = progress?.percentage || 0
    if (startPct < 5) {
      saveProgress('viewer', 5)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, volumeId])

  // Save progress periodically while reading
  useEffect(() => {
    if (!iframeLoaded || !book) return

    const interval = setInterval(() => {
      const currentPct = progress?.percentage || 0
      if (currentPct < 100) {
        saveProgress('viewer', Math.min(currentPct + 2, 100))
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [iframeLoaded, book, progress, saveProgress])

  const handleIframeLoad = useCallback(() => setIframeLoaded(true), [])
  const handleIframeError = useCallback(() => setIframeError(true), [])

  const handleAddBookmark = async () => {
    if (!bookmarkLabel.trim()) return
    setSaving(true)
    const result = await addBookmark(bookmarkLabel.trim(), bookmarkNote.trim())
    setSaving(false)
    if (result) {
      setBookmarkLabel('')
      setBookmarkNote('')
    }
  }

  // Error state
  if (error && !loading) {
    return (
      <main className="book-reader-error">
        <div className="book-reader-error__content">
          <h2>Error loading book</h2>
          <p>{error}</p>
          <button onClick={() => navigate(`/library/${volumeId}`)} className="book-reader-error__button">
            Back to Book
          </button>
        </div>
      </main>
    )
  }

  // No preview available
  if (!loading && book && !hasPreview(book)) {
    return (
      <main className="book-reader-error">
        <div className="book-reader-error__content">
          <h2>Preview not available</h2>
          <p>This book does not have an online preview. You can view it on Google Books instead.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => navigate(`/library/${volumeId}`)} className="book-reader-error__button">
              Back to Book
            </button>
            {getPreviewLink(book) && (
              <a href={getPreviewLink(book)} target="_blank" rel="noopener noreferrer" className="book-reader-error__button" style={{ textDecoration: 'none' }}>
                Open on Google Books
              </a>
            )}
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className="book-reader-container">
      {loading && (
        <div className="book-reader-loading">
          <Skeleton height={40} width="50%" className="mb-4" />
          <div style={{ width: '100%', height: '400px' }}>
            <Skeleton height="100%" width="100%" />
          </div>
        </div>
      )}

      {!loading && book && (
        <>
          {/* Toolbar */}
          <div className="reader-toolbar">
            <button onClick={() => navigate(`/library/${volumeId}`)} className="reader-toolbar__back-btn" aria-label="Back to book details">
              <IconArrowLeft size={20} />
            </button>

            <h2 className="reader-toolbar__title">{book.title || 'Untitled'}</h2>

            <div className="reader-toolbar__actions">
              <button
                className="reader-toolbar__btn"
                onClick={() => setShowBookmarkPanel((p) => !p)}
                aria-label="Bookmarks"
              >
                Bookmarks ({bookmarks.length})
              </button>
              {book.previewLink && (
                <a href={book.previewLink} target="_blank" rel="noopener noreferrer" className="reader-toolbar__btn" aria-label="Open in Google Books">
                  Book Link
                </a>
              )}
            </div>
          </div>

          {/* Bookmark Panel (portal to avoid iframe z-index issues) */}
          {showBookmarkPanel && createPortal(
            <div className="reader-bookmark-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowBookmarkPanel(false) }}>
              <div className="reader-bookmark-panel">
                <div className="reader-bookmark-panel__header">
                  <h3 className="reader-bookmark-panel__title">Bookmarks</h3>
                  <button className="reader-bookmark-panel__close" onClick={() => setShowBookmarkPanel(false)} aria-label="Close">x</button>
                </div>

                {/* Add bookmark form */}
                <div className="reader-bookmark-panel__form">
                  <input
                    type="text"
                    value={bookmarkLabel}
                    onChange={(e) => setBookmarkLabel(e.target.value)}
                    placeholder="Bookmark label (e.g. Chapter 3)"
                    className="reader-bookmark-panel__input"
                    maxLength={100}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddBookmark() }}
                  />
                  <textarea
                    value={bookmarkNote}
                    onChange={(e) => setBookmarkNote(e.target.value)}
                    placeholder="Optional note..."
                    className="reader-bookmark-panel__textarea"
                    rows={2}
                    maxLength={500}
                  />
                  <button
                    className="reader-bookmark-panel__add-btn"
                    onClick={handleAddBookmark}
                    disabled={saving || !bookmarkLabel.trim()}
                  >
                    {saving ? 'Saving...' : 'Add Bookmark'}
                  </button>
                  {bookmarkError && (
                    <div className="reader-bookmark-panel__error">{bookmarkError}</div>
                  )}
                </div>

                {/* Bookmark list */}
                <div className="reader-bookmark-panel__list">
                  {bookmarks.length === 0 ? (
                    <div className="reader-bookmark-panel__empty">
                      No bookmarks yet. Add one to save your reading progress.
                    </div>
                  ) : (
                    bookmarks.map((bm) => (
                      <div key={bm.id} className="reader-bookmark-panel__item">
                        <div className="reader-bookmark-panel__item-content">
                          <strong className="reader-bookmark-panel__item-label">{bm.label}</strong>
                          {bm.pageSnippet && (
                            <span className="reader-bookmark-panel__item-note">{bm.pageSnippet}</span>
                          )}
                        </div>
                        <button
                          className="reader-bookmark-panel__delete-btn"
                          onClick={() => removeBookmark(bm.id)}
                          aria-label={`Delete bookmark: ${bm.label}`}
                        >
                          x
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )}

          {/* Iframe loading indicator */}
          {!iframeLoaded && !iframeError && (
            <div className="book-reader-loading" style={{ position: 'absolute', inset: 0, top: 56, zIndex: 1 }}>
              <div style={{ width: '100%', height: '100%', padding: 24 }}>
                <Skeleton height="100%" width="100%" />
              </div>
            </div>
          )}

          {/* Google Books Iframe */}
          <iframe
            src={getEmbedUrl(volumeId)}
            title={`Read ${book.title || 'book'}`}
            className="reader-content"
            style={{ flex: 1, width: '100%', minHeight: 500, border: 'none', opacity: iframeLoaded ? 1 : 0, transition: 'opacity 0.3s ease' }}
            allow="fullscreen"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />

          {/* Error fallback */}
          {iframeError && (
            <div className="book-reader-error" style={{ flex: 1 }}>
              <div className="book-reader-error__content">
                <h2>Could not load the reader</h2>
                <p>The book viewer failed to load. Try opening it directly on Google Books.</p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => navigate(`/library/${volumeId}`)} className="book-reader-error__button">Back to Book</button>
                  {getPreviewLink(book) && (
                    <a href={getPreviewLink(book)} target="_blank" rel="noopener noreferrer" className="book-reader-error__button" style={{ textDecoration: 'none' }}>
                      Open on Google Books
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Bottom Progress Bar */}
          {progress && progress.percentage > 0 && (
            <div className="reader-bottom-bar">
              <div className="reader-bottom-bar__progress">{Math.round(progress.percentage)}% complete</div>
              <div className="reader-bottom-bar__controls">
                <div className="reader-bottom-bar__progress-bar">
                  <div className="reader-bottom-bar__progress-fill" style={{ width: `${progress.percentage}%` }} />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
