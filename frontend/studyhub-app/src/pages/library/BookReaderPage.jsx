/* ═══════════════════════════════════════════════════════════════════════════
 * BookReaderPage.jsx -- Google Books embedded viewer for reading books
 *
 * Uses the Google Books iframe embed for maximum compatibility. The embed
 * URL format renders Google's own book viewer directly inside an iframe,
 * which is the most reliable way to display book content.
 *
 * Features:
 *   - Full-height iframe Google Books viewer
 *   - Toolbar with back button and book title
 *   - "Open in Google Books" link for full reading experience
 *   - Fallback for books without preview
 *   - Responsive layout
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { IconArrowLeft } from '../../components/Icons'
import { Skeleton } from '../../components/Skeleton'
import { usePageTitle } from '../../lib/usePageTitle'
import useBookReader from './useBookReader'
import { hasPreview, getPreviewLink } from './libraryHelpers'
import './BookReaderPage.css'

/**
 * Build the Google Books embed URL for the iframe viewer.
 * Format: https://books.google.com/books?id=VOLUME_ID&lpg=PP1&pg=PP1&output=embed
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

  const { book, loading, error, progress, saveProgress } = useBookReader(volumeId)

  // Save reading progress when the page is visited
  useEffect(() => {
    if (!book || !volumeId) return
    // Mark that the user opened the reader
    const startPct = progress?.percentage || 0
    if (startPct < 5) {
      saveProgress('viewer', 5)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount with book data
  }, [book, volumeId])

  // Save progress periodically while reading
  useEffect(() => {
    if (!iframeLoaded || !book) return

    const interval = setInterval(() => {
      const currentPct = progress?.percentage || 0
      if (currentPct < 100) {
        saveProgress('viewer', Math.min(currentPct + 2, 100))
      }
    }, 60000) // Every 60 seconds, increment by 2%

    return () => clearInterval(interval)
  }, [iframeLoaded, book, progress, saveProgress])

  const handleIframeLoad = useCallback(() => {
    setIframeLoaded(true)
  }, [])

  const handleIframeError = useCallback(() => {
    setIframeError(true)
  }, [])

  // Error state from data fetch
  if (error && !loading) {
    return (
      <main className="book-reader-error">
        <div className="book-reader-error__content">
          <h2>Error loading book</h2>
          <p>{error}</p>
          <button
            onClick={() => navigate(`/library/${volumeId}`)}
            className="book-reader-error__button"
          >
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
          <p>
            This book does not have an online preview available. You can view it on Google Books
            instead.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate(`/library/${volumeId}`)}
              className="book-reader-error__button"
            >
              Back to Book
            </button>
            {getPreviewLink(book) && (
              <a
                href={getPreviewLink(book)}
                target="_blank"
                rel="noopener noreferrer"
                className="book-reader-error__button"
                style={{ textDecoration: 'none' }}
              >
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
      {/* Loading State */}
      {loading && (
        <div className="book-reader-loading">
          <Skeleton height={40} width="50%" className="mb-4" />
          <div style={{ width: '100%', height: '400px' }}>
            <Skeleton height="100%" width="100%" />
          </div>
        </div>
      )}

      {/* Reader Area */}
      {!loading && book && (
        <>
          {/* Toolbar */}
          <div className="reader-toolbar">
            <button
              onClick={() => navigate(`/library/${volumeId}`)}
              className="reader-toolbar__back-btn"
              aria-label="Back to book details"
            >
              <IconArrowLeft size={20} />
            </button>

            <h2 className="reader-toolbar__title">{book.title || 'Untitled'}</h2>

            <div className="reader-toolbar__actions">
              {book.previewLink && (
                <a
                  href={book.previewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="reader-toolbar__btn"
                  aria-label="Open in Google Books"
                >
                  Full View
                </a>
              )}
            </div>
          </div>

          {/* Iframe loading indicator */}
          {!iframeLoaded && !iframeError && (
            <div
              className="book-reader-loading"
              style={{ position: 'absolute', inset: 0, top: 56, zIndex: 1 }}
            >
              <div style={{ width: '100%', height: '100%', padding: 24 }}>
                <Skeleton height="100%" width="100%" />
              </div>
            </div>
          )}

          {/* Google Books Iframe Embed */}
          <iframe
            src={getEmbedUrl(volumeId)}
            title={`Read ${book.title || 'book'}`}
            className="reader-content"
            style={{
              flex: 1,
              width: '100%',
              minHeight: '500px',
              border: 'none',
              opacity: iframeLoaded ? 1 : 0,
              transition: 'opacity 0.3s ease',
            }}
            allow="fullscreen"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />

          {/* Error fallback if iframe fails */}
          {iframeError && (
            <div className="book-reader-error" style={{ flex: 1 }}>
              <div className="book-reader-error__content">
                <h2>Could not load the reader</h2>
                <p>The book viewer failed to load. Try opening it directly on Google Books.</p>
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    onClick={() => navigate(`/library/${volumeId}`)}
                    className="book-reader-error__button"
                  >
                    Back to Book
                  </button>
                  {getPreviewLink(book) && (
                    <a
                      href={getPreviewLink(book)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="book-reader-error__button"
                      style={{ textDecoration: 'none' }}
                    >
                      Open on Google Books
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Bottom Bar with Progress */}
          {progress && progress.percentage > 0 && (
            <div className="reader-bottom-bar">
              <div className="reader-bottom-bar__progress">
                {Math.round(progress.percentage)}% complete
              </div>
              <div className="reader-bottom-bar__controls">
                <div className="reader-bottom-bar__progress-bar">
                  <div
                    className="reader-bottom-bar__progress-fill"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
