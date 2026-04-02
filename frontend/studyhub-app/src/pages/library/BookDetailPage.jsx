/* ═══════════════════════════════════════════════════════════════════════════
 * BookDetailPage.jsx — Book detail view with metadata, preview, and actions
 *
 * Features:
 *   - Large cover image with fallback
 *   - Book metadata (title, author, subjects)
 *   - Description from Gutendex API
 *   - Download button options (EPUB, PDF, Plain Text)
 *   - Save to bookshelf functionality
 *   - Related books by author (via search link)
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useParams, useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import Navbar from '../../components/navbar/Navbar'
import { IconArrowLeft, IconDownload } from '../../components/Icons'
import { Skeleton, SkeletonCard } from '../../components/Skeleton'
import { usePageTitle } from '../../lib/usePageTitle'
import useBookDetail from './useBookDetail'
import {
  getBookCover,
  getAuthorNames,
  formatDownloads,
  getEpubUrl,
  getPlainTextUrl,
} from './libraryHelpers'
import './BookDetailPage.css'

export default function BookDetailPage() {
  usePageTitle('Book Details')
  const { gutenbergId } = useParams()
  const navigate = useNavigate()
  const [shelfDropdownOpen, setShelfDropdownOpen] = useState(false)
  const [newShelfName, setNewShelfName] = useState('')
  const [showNewShelfInput, setShowNewShelfInput] = useState(false)
  const shelfDropdownRef = useRef(null)

  const { book, loading, error, shelves, progress, addToShelf, createShelf } =
    useBookDetail(gutenbergId)

  const handleAddToShelf = async (shelfId) => {
    const success = await addToShelf(shelfId)
    if (success) {
      setShelfDropdownOpen(false)
    }
  }

  const handleCreateShelf = async () => {
    if (!newShelfName.trim()) return
    const shelf = await createShelf(newShelfName)
    if (shelf) {
      setNewShelfName('')
      setShowNewShelfInput(false)
      await handleAddToShelf(shelf.id)
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        shelfDropdownRef.current &&
        !shelfDropdownRef.current.contains(event.target)
      ) {
        setShelfDropdownOpen(false)
        setShowNewShelfInput(false)
        setNewShelfName('')
      }
    }

    if (shelfDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [shelfDropdownOpen])

  // Close "Create New Shelf" input on Escape
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && showNewShelfInput) {
        setShowNewShelfInput(false)
        setNewShelfName('')
      }
    }

    if (showNewShelfInput) {
      document.addEventListener('keydown', handleKeyDown)
      return () => {
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [showNewShelfInput])

  if (error && !loading) {
    return (
      <>
        <Navbar />
        <main className="book-detail-page">
          <div className="book-detail__error">
            <button
              onClick={() => navigate('/library')}
              className="book-detail__back-btn"
            >
              <IconArrowLeft size={18} />
              Back
            </button>
            <div className="book-detail__error-content">
              <h2>Error loading book</h2>
              <p>{error}</p>
            </div>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <Navbar />
      <main className="book-detail-page">
        {/* Back Button */}
        <button
          onClick={() => navigate('/library')}
          className="book-detail__back-btn"
        >
          <IconArrowLeft size={18} />
          Back
        </button>

        <div className="book-detail__container">
          {/* Loading State */}
          {loading && (
            <div className="book-detail__loading">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          )}

          {/* Book Content */}
          {!loading && book && (
            <>
              {/* Cover and Metadata Column */}
              <div className="book-detail__left">
                <div className="book-detail__cover-wrapper">
                  {getBookCover(book) ? (
                    <img
                      src={getBookCover(book)}
                      alt={book.title}
                      className="book-detail__cover"
                    />
                  ) : (
                    <div
                      className="book-detail__cover-fallback"
                      style={{
                        background: 'linear-gradient(135deg, var(--sh-brand), #7c3aed)',
                      }}
                    >
                      <div className="book-detail__cover-fallback-text">{book.title}</div>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="book-detail__stats">
                  <div className="book-detail__stat">
                    <span className="book-detail__stat-label">Downloads</span>
                    <span className="book-detail__stat-value">
                      {formatDownloads(book.download_count || 0)}
                    </span>
                  </div>
                  {progress && progress.percentage > 0 && (
                    <div className="book-detail__stat">
                      <span className="book-detail__stat-label">Your Progress</span>
                      <span className="book-detail__stat-value">
                        {Math.round(progress.percentage)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Details Column */}
              <div className="book-detail__right">
                {/* Title and Author */}
                <div className="book-detail__header">
                  <h1 className="book-detail__title">{book.title}</h1>
                  <p className="book-detail__author">
                    by {getAuthorNames(book)}
                  </p>
                </div>

                {/* Subjects/Topics */}
                {book.subjects && book.subjects.length > 0 && (
                  <div className="book-detail__section">
                    <h3 className="book-detail__section-title">Subjects</h3>
                    <div className="book-detail__subjects">
                      {book.subjects.slice(0, 6).map((subject, idx) => (
                        <span key={idx} className="book-detail__subject-chip">
                          {subject}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description */}
                <div className="book-detail__section">
                  <h3 className="book-detail__section-title">About</h3>
                  <p className="book-detail__description">
                    {book.description || 'No description available for this book.'}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="book-detail__actions">
                  {/* Read Online Button */}
                  <a
                    href={`/library/${gutenbergId}/read`}
                    className="book-detail__action-btn book-detail__action-btn--primary"
                  >
                    Read Online
                  </a>

                  {/* Save to Bookshelf Dropdown */}
                  <div
                    className="book-detail__shelf-dropdown"
                    ref={shelfDropdownRef}
                  >
                    <button
                      onClick={() => setShelfDropdownOpen(!shelfDropdownOpen)}
                      className="book-detail__action-btn book-detail__action-btn--secondary"
                    >
                      Add to Bookshelf
                    </button>
                    {shelfDropdownOpen && (
                      <div className="book-detail__shelf-menu">
                        {shelves.map((shelf) => (
                          <button
                            key={shelf.id}
                            onClick={() => handleAddToShelf(shelf.id)}
                            className="book-detail__shelf-item"
                          >
                            {shelf.name}
                          </button>
                        ))}
                        <div className="book-detail__shelf-divider" />
                        {!showNewShelfInput ? (
                          <button
                            onClick={() => setShowNewShelfInput(true)}
                            className="book-detail__shelf-item book-detail__shelf-item--new"
                          >
                            Create New Shelf
                          </button>
                        ) : (
                          <div className="book-detail__shelf-input-group">
                            <input
                              type="text"
                              value={newShelfName}
                              onChange={(e) => setNewShelfName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreateShelf()
                                if (e.key === 'Escape') {
                                  setShowNewShelfInput(false)
                                  setNewShelfName('')
                                }
                              }}
                              placeholder="Shelf name..."
                              className="book-detail__shelf-input"
                              autoFocus
                            />
                            <button
                              onClick={handleCreateShelf}
                              className="book-detail__shelf-input-btn"
                            >
                              Create
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Download Formats */}
                <div className="book-detail__downloads">
                  <h3 className="book-detail__section-title">Download Formats</h3>
                  <div className="book-detail__format-list">
                    {getEpubUrl(book) && (
                      <a
                        href={getEpubUrl(book)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="book-detail__format-btn"
                      >
                        <IconDownload size={16} />
                        EPUB
                      </a>
                    )}
                    {getPlainTextUrl(book) && (
                      <a
                        href={getPlainTextUrl(book)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="book-detail__format-btn"
                      >
                        <IconDownload size={16} />
                        Plain Text
                      </a>
                    )}
                    {!getEpubUrl(book) && !getPlainTextUrl(book) && (
                      <p className="book-detail__format-none">No downloads available</p>
                    )}
                  </div>
                </div>

                {/* Related Books by Author */}
                <div className="book-detail__related">
                  <h3 className="book-detail__section-title">More by this Author</h3>
                  <a
                    href={`/library?search=${encodeURIComponent(getAuthorNames(book))}`}
                    className="book-detail__related-link"
                  >
                    View all books by {getAuthorNames(book)}
                  </a>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  )
}
