/* ═══════════════════════════════════════════════════════════════════════════
 * BookReaderPage.jsx — Full-screen EPUB reader with annotations
 *
 * Features:
 *   - Full-screen epub.js integration
 *   - Auto-hiding toolbar and bottom bar
 *   - Theme system (Light, Dark, Sepia)
 *   - Font size and family customization
 *   - Bookmarks with page snippets
 *   - Highlights with colors
 *   - Table of contents navigation
 *   - Reading progress tracking
 *   - Keyboard navigation (arrow keys)
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import ePub from 'epubjs'
import { IconArrowLeft, IconSettings, IconMoreHorizontal } from '../../components/Icons'
import { Skeleton } from '../../components/Skeleton'
import { usePageTitle } from '../../lib/usePageTitle'
import useBookReader from './useBookReader'
import { getEpubUrl } from './libraryHelpers'
import ReaderSettingsPanel from './components/ReaderSettingsPanel'
import ReaderSidebar from './components/ReaderSidebar'
import HighlightPopover from './components/HighlightPopover'
import './BookReaderPage.css'

const TOOLBAR_HIDE_DELAY = 3000 // milliseconds
const PREFS_STORAGE_KEY = 'studyhub-reader-prefs'

const DEFAULT_PREFS = {
  theme: 'light',
  fontSize: 100,
  fontFamily: 'default',
}

export default function BookReaderPage() {
  usePageTitle('Reading')
  const { gutenbergId } = useParams()
  const navigate = useNavigate()

  // State management
  const [theme, setTheme] = useState(DEFAULT_PREFS.theme)
  const [fontSize, setFontSize] = useState(DEFAULT_PREFS.fontSize)
  const [fontFamily, setFontFamily] = useState(DEFAULT_PREFS.fontFamily)

  const [toolbarVisible, setToolbarVisible] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [showHighlightPopover, setShowHighlightPopover] = useState(false)
  const [highlightPosition, setHighlightPosition] = useState(null)
  const [selectedText, setSelectedText] = useState(null)

  const [toc, setToc] = useState([])
  const [currentPage, setCurrentPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  // Refs
  const readerContainerRef = useRef(null)
  const epubInstanceRef = useRef(null)
  const renditionRef = useRef(null)
  const toolbarTimeoutRef = useRef(null)

  // Data hooks
  const {
    book,
    bookmarks,
    highlights,
    progress,
    loading,
    error,
    saveProgress,
    addBookmark,
    removeBookmark,
    addHighlight,
    removeHighlight,
  } = useBookReader(gutenbergId)

  // Load preferences from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(PREFS_STORAGE_KEY)
    if (stored) {
      try {
        const prefs = JSON.parse(stored)
        setTheme(prefs.theme || DEFAULT_PREFS.theme)
        setFontSize(prefs.fontSize || DEFAULT_PREFS.fontSize)
        setFontFamily(prefs.fontFamily || DEFAULT_PREFS.fontFamily)
      } catch (err) {
        console.error('Error loading preferences:', err)
      }
    }
  }, [])

  // Save preferences to localStorage
  useEffect(() => {
    const prefs = { theme, fontSize, fontFamily }
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs))
  }, [theme, fontSize, fontFamily])

  // Track whether locations have been generated (async, can take seconds for large books)
  const locationsReadyRef = useRef(false)

  // Initialize EPUB reader
  useEffect(() => {
    if (!book || !readerContainerRef.current) return

    // Reset locations ready flag for new book
    locationsReadyRef.current = false

    async function initializeReader() {
      try {
        const epubUrl = getEpubUrl(book)
        if (!epubUrl) {
          console.error('No EPUB URL found')
          return
        }

        // Create EPUB instance
        const epubBook = ePub(epubUrl)
        epubInstanceRef.current = epubBook

        // Render to container
        const rendition = epubBook.renderTo(readerContainerRef.current, {
          width: '100%',
          height: '100%',
          spread: 'auto',
        })
        renditionRef.current = rendition

        // Wait for the book spine and metadata to be ready
        await epubBook.ready

        // Register themes
        rendition.themes.register('light', {
          body: {
            'background-color': '#ffffff !important',
            color: '#1a1a2e !important',
          },
          p: { color: '#1a1a2e !important' },
          'h1,h2,h3,h4,h5,h6': { color: '#1a1a2e !important' },
          a: { color: '#2563eb !important' },
        })

        rendition.themes.register('dark', {
          body: {
            'background-color': '#1a1a2e !important',
            color: '#e0e0e0 !important',
          },
          p: { color: '#e0e0e0 !important' },
          'h1,h2,h3,h4,h5,h6': { color: '#ffffff !important' },
          a: { color: '#60a5fa !important' },
        })

        rendition.themes.register('sepia', {
          body: {
            'background-color': '#f4ecd8 !important',
            color: '#5c4033 !important',
          },
          p: { color: '#5c4033 !important' },
          'h1,h2,h3,h4,h5,h6': { color: '#3d2817 !important' },
          a: { color: '#c85a1f !important' },
        })

        // Apply current preferences
        rendition.themes.select(theme)
        rendition.themes.fontSize(`${fontSize}%`)

        // Set up font families
        if (fontFamily === 'serif') {
          rendition.themes.register('serif-override', {
            'body,p,div,span': {
              'font-family': '"Georgia", "Times New Roman", serif !important',
            },
          })
          rendition.themes.select('serif-override')
        } else if (fontFamily === 'sans-serif') {
          rendition.themes.register('sans-override', {
            'body,p,div,span': {
              'font-family':
                '"Trebuchet MS", "Arial", sans-serif !important',
            },
          })
          rendition.themes.select('sans-override')
        }

        // Get table of contents
        if (epubBook.navigation) {
          setToc(epubBook.navigation.toc || [])
        }

        // Display saved progress or start from beginning BEFORE generating locations.
        // This lets the user start reading immediately while locations are computed
        // in the background (can take several seconds for large books).
        if (progress && progress.cfi) {
          await rendition.display(progress.cfi)
        } else {
          await rendition.display()
        }

        // Listen for location changes to save progress.
        // Before locations are ready, we show a percentage estimate based on
        // the spine position. Once locations finish generating, subsequent
        // relocated events will use the precise location data.
        rendition.on('relocated', (location) => {
          if (!location || !location.start) return
          const cfi = location.start.cfi

          if (locationsReadyRef.current) {
            // Locations are ready -- use precise page numbers
            const percentage = epubBook.locations.percentageFromCfi(cfi)
            const pageNum = epubBook.locations.locationFromCfi(cfi)
            setCurrentPage(pageNum || 1)
            setTotalPages(epubBook.locations.total() || 1)
            saveProgress(cfi, Math.round(percentage * 100))
          } else {
            // Locations still generating -- show spine-based estimate
            const spineItem = location.start.index
            const spineTotal = epubBook.spine?.length || epubBook.spine?.items?.length || 1
            const estPage = Math.max(1, spineItem + 1)
            const estTotal = Math.max(1, spineTotal)
            setCurrentPage(estPage)
            setTotalPages(estTotal)
            const roughPct = Math.round((estPage / estTotal) * 100)
            saveProgress(cfi, roughPct)
          }
        })

        // Text selection for highlights
        rendition.on('selected', (cfiRange, contents) => {
          const selection = contents.window.getSelection()
          if (selection && selection.toString().length > 0) {
            const text = selection.toString().trim()
            setSelectedText(text)

            // Get position from selection
            const range = selection.getRangeAt(0)
            const rect = range.getBoundingClientRect()
            const containerRect =
              readerContainerRef.current.getBoundingClientRect()

            setHighlightPosition({
              top: rect.bottom - containerRect.top + 10,
              left:
                rect.left - containerRect.left + rect.width / 2 - 60, // Center popover
            })
            setShowHighlightPopover(true)
          }
        })

        // Generate locations in the background AFTER the book is displayed.
        // This is an expensive operation (can take 3-10+ seconds for large books).
        // We do it post-display so the user sees content immediately.
        try {
          await epubBook.locations.generate(1024) // 1024 chars per "page"
          locationsReadyRef.current = true
          const totalLocs = epubBook.locations.total()
          setTotalPages(totalLocs || 1)

          // Update current page with precise location now that generation is done
          const currentLoc = rendition.currentLocation()
          if (currentLoc && currentLoc.start) {
            const pageNum = epubBook.locations.locationFromCfi(currentLoc.start.cfi)
            setCurrentPage(pageNum || 1)
          }
        } catch (locErr) {
          console.warn('Location generation failed (using spine estimate):', locErr)
          // Keep using spine-based estimate -- not a critical failure
        }
      } catch (err) {
        console.error('Error initializing reader:', err)
      }
    }

    initializeReader()

    return () => {
      // Cleanup
      if (epubInstanceRef.current) {
        try { epubInstanceRef.current.destroy() } catch { /* already destroyed */ }
        epubInstanceRef.current = null
      }
    }
  }, [book, progress, saveProgress])

  // Update theme
  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.select(theme)
    }
  }, [theme])

  // Update font size
  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.fontSize(`${fontSize}%`)
    }
  }, [fontSize])

  // Update font family
  useEffect(() => {
    if (renditionRef.current) {
      if (fontFamily === 'serif') {
        renditionRef.current.themes.register('serif-override', {
          'body,p,div,span': {
            'font-family': '"Georgia", "Times New Roman", serif !important',
          },
        })
        renditionRef.current.themes.select('serif-override')
      } else if (fontFamily === 'sans-serif') {
        renditionRef.current.themes.register('sans-override', {
          'body,p,div,span': {
            'font-family': '"Trebuchet MS", "Arial", sans-serif !important',
          },
        })
        renditionRef.current.themes.select('sans-override')
      } else {
        // Default font
        renditionRef.current.themes.register('default-override', {})
        renditionRef.current.themes.select(theme)
      }
    }
  }, [fontFamily, theme])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!renditionRef.current) return

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        renditionRef.current.prev()
        e.preventDefault()
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        renditionRef.current.next()
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Toolbar auto-hide
  useEffect(() => {
    const handleMouseMove = () => {
      setToolbarVisible(true)

      if (toolbarTimeoutRef.current) {
        clearTimeout(toolbarTimeoutRef.current)
      }

      toolbarTimeoutRef.current = setTimeout(() => {
        setToolbarVisible(false)
      }, TOOLBAR_HIDE_DELAY)
    }

    window.addEventListener('mousemove', handleMouseMove)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (toolbarTimeoutRef.current) {
        clearTimeout(toolbarTimeoutRef.current)
      }
    }
  }, [])

  // Handle highlight creation
  const handleHighlight = async (color) => {
    if (!selectedText || !epubInstanceRef.current) return

    const currentLocation = renditionRef.current.currentLocation()
    if (currentLocation && currentLocation.start) {
      const cfi = currentLocation.start.cfi
      const success = await addHighlight(cfi, selectedText, color)

      if (success) {
        // Apply highlight in reader
        renditionRef.current.annotations.highlight(
          cfi,
          {},
          null,
          'highlight',
          { fill: color }
        )
      }
    }

    setSelectedText(null)
    setShowHighlightPopover(false)
  }

  // Handle bookmark toggle
  const handleBookmarkToggle = async () => {
    if (!renditionRef.current) return

    const currentLocation = renditionRef.current.currentLocation()
    if (currentLocation && currentLocation.start) {
      const cfi = currentLocation.start.cfi

      // Check if already bookmarked
      const existing = bookmarks.find((b) => b.cfi === cfi)
      if (existing) {
        await removeBookmark(existing.id)
      } else {
        await addBookmark(cfi, 'Bookmark', 'Page ' + currentPage)
      }
    }
  }

  // Check if current page is bookmarked
  const isCurrentPageBookmarked = useCallback(() => {
    if (!renditionRef.current) return false
    const currentLocation = renditionRef.current.currentLocation()
    if (!currentLocation || !currentLocation.start) return false

    return bookmarks.some((b) => b.cfi === currentLocation.start.cfi)
  }, [bookmarks, renditionRef])

  // Navigate to chapter/bookmark
  const handleNavigateTo = (target) => {
    if (renditionRef.current) {
      renditionRef.current.display(target)
    }
  }

  // Error state
  if (error && !loading) {
    return (
      <main className="book-reader-error">
        <div className="book-reader-error__content">
          <h2>Error loading book</h2>
          <p>{error}</p>
          <button
            onClick={() => navigate(`/library/${gutenbergId}`)}
            className="book-reader-error__button"
          >
            Back to Book
          </button>
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
          <div
            className={`reader-toolbar ${
              !toolbarVisible ? 'hidden' : ''
            }`}
          >
            <button
              onClick={() => navigate(`/library/${gutenbergId}`)}
              className="reader-toolbar__back-btn"
              aria-label="Back to book details"
            >
              <IconArrowLeft size={20} />
            </button>

            <h2 className="reader-toolbar__title">
              {book.title || 'Untitled'}
            </h2>

            <div className="reader-toolbar__actions">
              <button
                onClick={handleBookmarkToggle}
                className={`reader-toolbar__btn ${
                  isCurrentPageBookmarked() ? 'active' : ''
                }`}
                aria-label="Add bookmark"
              >
                Bookmark
              </button>

              <button
                onClick={() => setShowSidebar(true)}
                className="reader-toolbar__btn"
                aria-label="Open sidebar"
              >
                <IconMoreHorizontal size={20} />
              </button>

              <button
                onClick={() => setShowSettings(true)}
                className="reader-toolbar__btn"
                aria-label="Open settings"
              >
                <IconSettings size={20} />
              </button>
            </div>
          </div>

          {/* Reader Content */}
          <div className="reader-content" ref={readerContainerRef} />

          {/* Bottom Bar */}
          <div
            className={`reader-bottom-bar ${
              !toolbarVisible ? 'hidden' : ''
            }`}
          >
            <div className="reader-bottom-bar__progress">
              Page {currentPage} of {totalPages}
            </div>

            <div className="reader-bottom-bar__controls">
              <button
                onClick={() => renditionRef.current?.prev()}
                className="reader-bottom-bar__nav-btn"
                aria-label="Previous page"
              >
                Previous
              </button>

              <div className="reader-bottom-bar__progress-bar">
                <div
                  className="reader-bottom-bar__progress-fill"
                  style={{
                    width: `${
                      totalPages > 0 ? (currentPage / totalPages) * 100 : 0
                    }%`,
                  }}
                />
              </div>

              <button
                onClick={() => renditionRef.current?.next()}
                className="reader-bottom-bar__nav-btn"
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>

          {/* Settings Panel Portal */}
          {showSettings &&
            createPortal(
              <div className="reader-panel-overlay" onClick={() => setShowSettings(false)}>
                <div
                  className="reader-panel-overlay__panel"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ReaderSettingsPanel
                    theme={theme}
                    setTheme={setTheme}
                    fontSize={fontSize}
                    setFontSize={setFontSize}
                    fontFamily={fontFamily}
                    setFontFamily={setFontFamily}
                    onClose={() => setShowSettings(false)}
                  />
                </div>
              </div>,
              document.body
            )}

          {/* Sidebar Portal */}
          {showSidebar &&
            createPortal(
              <div className="reader-panel-overlay" onClick={() => setShowSidebar(false)}>
                <div
                  className="reader-panel-overlay__sidebar"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ReaderSidebar
                    toc={toc}
                    bookmarks={bookmarks}
                    highlights={highlights}
                    onNavigate={handleNavigateTo}
                    onRemoveBookmark={removeBookmark}
                    onRemoveHighlight={removeHighlight}
                    onClose={() => setShowSidebar(false)}
                  />
                </div>
              </div>,
              document.body
            )}

          {/* Highlight Popover Portal */}
          {showHighlightPopover &&
            createPortal(
              <HighlightPopover
                position={highlightPosition}
                onHighlight={handleHighlight}
                onClose={() => setShowHighlightPopover(false)}
              />,
              document.body
            )}
        </>
      )}
    </div>
  )
}
