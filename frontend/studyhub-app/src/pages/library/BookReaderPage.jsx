/* ═══════════════════════════════════════════════════════════════════════════
 * BookReaderPage.jsx -- Google Books embedded viewer for reading books
 *
 * Features:
 *   - Google Books Embedded Viewer API integration
 *   - Toolbar with back button and book title
 *   - Reading progress tracking (percentage based on viewer page)
 *   - Fallback for books without preview
 *   - Responsive full-height layout
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { IconArrowLeft } from '../../components/Icons'
import { Skeleton } from '../../components/Skeleton'
import { usePageTitle } from '../../lib/usePageTitle'
import useBookReader from './useBookReader'
import { hasPreview, getPreviewLink } from './libraryHelpers'
import './BookReaderPage.css'

// Google Books Embedded Viewer API script URL
const GOOGLE_BOOKS_VIEWER_SCRIPT = 'https://www.google.com/books/jsapi.js'

export default function BookReaderPage() {
  usePageTitle('Reading')
  const { volumeId } = useParams()
  const navigate = useNavigate()

  const [viewerReady, setViewerReady] = useState(false)
  const [viewerError, setViewerError] = useState(false)
  const [scriptLoaded, setScriptLoaded] = useState(false)

  const viewerContainerRef = useRef(null)
  const viewerInstanceRef = useRef(null)

  const { book, loading, error, progress, saveProgress } = useBookReader(volumeId)

  // Load the Google Books Viewer API script
  useEffect(() => {
    // Check if already loaded
    if (window.google && window.google.books) {
      // Use microtask to avoid synchronous setState in effect body
      queueMicrotask(() => setScriptLoaded(true))
      return
    }

    const existingScript = document.querySelector(`script[src="${GOOGLE_BOOKS_VIEWER_SCRIPT}"]`)
    if (existingScript) {
      existingScript.addEventListener('load', () => setScriptLoaded(true))
      existingScript.addEventListener('error', () => setViewerError(true))
      return
    }

    const script = document.createElement('script')
    script.src = GOOGLE_BOOKS_VIEWER_SCRIPT
    script.async = true
    script.onload = () => {
      if (window.google && window.google.books) {
        window.google.books.load()
        window.google.books.setOnLoadCallback(() => {
          setScriptLoaded(true)
        })
      }
    }
    script.onerror = () => {
      setViewerError(true)
    }
    document.head.appendChild(script)
  }, [])

  // Initialize the embedded viewer once script is loaded and book data is available
  useEffect(() => {
    if (!scriptLoaded || !book || !viewerContainerRef.current) return
    if (!hasPreview(book)) {
      queueMicrotask(() => setViewerError(true))
      return
    }

    try {
      viewerContainerRef.current.innerHTML = ''

      const viewer = new window.google.books.DefaultViewer(viewerContainerRef.current)
      viewerInstanceRef.current = viewer

      viewer.load(
        `ISBN:${volumeId}`,
        function onError() {
          viewer.load(
            volumeId,
            function onSecondError() {
              setViewerError(true)
            },
            function onSecondSuccess() {
              setViewerReady(true)
              saveProgress('viewer', progress?.percentage || 0)
            },
          )
        },
        function onSuccess() {
          setViewerReady(true)
          saveProgress('viewer', progress?.percentage || 0)
        },
      )
    } catch (err) {
      console.error('Error initializing Google Books viewer:', err)
      setViewerError(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- progress ref used only for initial value
  }, [scriptLoaded, book, volumeId, saveProgress])

  // Save progress periodically while reading
  useEffect(() => {
    if (!viewerReady || !book) return

    // Since the Google Books embedded viewer does not expose page change events,
    // we save progress periodically as a heartbeat while the user is reading.
    const interval = setInterval(() => {
      // We use a rough estimate based on time spent reading
      // The viewer handles its own pagination internally
      if (progress) {
        const newPct = Math.min((progress.percentage || 0) + 1, 100)
        saveProgress('viewer', newPct)
      }
    }, 60000) // Every 60 seconds

    return () => clearInterval(interval)
  }, [viewerReady, book, progress, saveProgress])

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
  if (!loading && book && (viewerError || !hasPreview(book))) {
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
      {(loading || (!viewerReady && !viewerError)) && (
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

          {/* Google Books Viewer Container */}
          <div
            className="reader-content"
            ref={viewerContainerRef}
            style={{ flex: 1, minHeight: '500px' }}
          />

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
