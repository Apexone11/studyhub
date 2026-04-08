/* ═══════════════════════════════════════════════════════════════════════════
 * LibraryPage.jsx -- Book catalog with search, filters, and grid display
 *
 * Features:
 *   - Hero section with gradient background and centered search
 *   - Category filter chips (horizontal scroll)
 *   - Sort dropdown and language filter
 *   - Responsive book grid with BookCard components
 *   - Pagination support
 *   - Empty state handling
 *   - Loading skeleton grid
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { IconSearch, IconBook } from '../../components/Icons'
import { SkeletonCard } from '../../components/Skeleton'
import { usePageTitle } from '../../lib/usePageTitle'
import { useSession } from '../../lib/session-context'
import { API } from '../../config'
import { showToast } from '../../lib/toast'
import { authHeaders } from '../shared/pageUtils'
import BookCard from './components/BookCard'
import useLibraryData from './useLibraryData'
import autoAnimate from '@formkit/auto-animate'
import { CATEGORIES, SORT_OPTIONS, LANGUAGES } from './libraryConstants'
import './LibraryPage.css'

export default function LibraryPage() {
  usePageTitle('Library')
  const {
    books,
    loading,
    error,
    usingCache,
    unavailable,
    page,
    totalCount,
    search,
    category,
    sort,
    language,
    setSearch,
    setCategory,
    setSort,
    setPage,
    setLanguage,
  } = useLibraryData()

  const { user } = useSession()
  const [searchInput, setSearchInput] = useState(search)
  const [shelves, setShelves] = useState([])
  const [shelvesLoading, setShelvesLoading] = useState(false)
  const [showShelves, setShowShelves] = useState(false)
  const [shelfActionId, setShelfActionId] = useState(null)

  // Fetch user's shelves with books
  const loadShelves = useCallback(async () => {
    if (!user) return
    setShelvesLoading(true)
    try {
      const res = await fetch(`${API}/api/library/shelves?includeBooks=true`, {
        credentials: 'include',
        headers: authHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setShelves(data.shelves || [])
      }
    } catch {
      // Silent failure
    } finally {
      setShelvesLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (showShelves && shelves.length === 0 && !shelvesLoading) {
      loadShelves()
    }
  }, [showShelves, shelves.length, shelvesLoading, loadShelves])

  const updateShelfVisibility = useCallback(async (shelfId, visibility) => {
    setShelfActionId(shelfId)
    try {
      const res = await fetch(`${API}/api/library/shelves/${shelfId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({ visibility }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Could not update shelf visibility.')
      }

      setShelves((prev) => prev.map((shelf) => (
        shelf.id === shelfId ? { ...shelf, visibility: data.visibility || visibility } : shelf
      )))
      showToast(visibility === 'profile' ? 'Shelf is now visible on your profile.' : 'Shelf is now private.', 'success')
    } catch (error) {
      showToast(error.message || 'Could not update shelf visibility.', 'error')
    } finally {
      setShelfActionId(null)
    }
  }, [])

  const deleteShelf = useCallback(async (shelfId, shelfName) => {
    if (typeof window !== 'undefined' && !window.confirm(`Delete "${shelfName}"? This removes the shelf and its saved books.`)) {
      return
    }

    setShelfActionId(shelfId)
    try {
      const res = await fetch(`${API}/api/library/shelves/${shelfId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not delete shelf.')
      }

      setShelves((prev) => prev.filter((shelf) => shelf.id !== shelfId))
      showToast('Shelf deleted', 'success')
    } catch (error) {
      showToast(error.message || 'Could not delete shelf.', 'error')
    } finally {
      setShelfActionId(null)
    }
  }, [])

  // Auto-animate the books grid for smooth transitions
  const gridRef = useRef(null)
  useEffect(() => {
    if (gridRef.current) autoAnimate(gridRef.current, { duration: 250 })
  }, [])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setSearch(searchInput)
  }

  const handleCategoryClick = (cat) => {
    if (category === cat) {
      setCategory('')
    } else {
      setCategory(cat)
    }
  }

  const booksPerPage = 20 // Google Books returns up to 20 per page
  const pageNumber = parseInt(page || '1', 10)
  const totalPages = Math.ceil(totalCount / booksPerPage)
  const hasNextPage = pageNumber < totalPages

  return (
    <>
      <Navbar />
      <div className="library-page">
        {/* Hero Section */}
        <section className="library-hero">
          <div className="library-hero__watermark">
            <IconBook size={280} />
          </div>
          <div className="library-hero__content">
            <div className="library-hero__badge">Millions of Books</div>
            <h1 className="library-hero__title">BookHub</h1>
            <p className="library-hero__subtitle">
              Discover and read books powered by Google Books
            </p>

            <form onSubmit={handleSearchSubmit} className="library-hero__search-form">
              <div className="library-hero__search-box">
                <IconSearch size={20} className="library-hero__search-icon" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search books by title, author..."
                  className="library-hero__search-input"
                />
              </div>
            </form>
          </div>
        </section>

        {/* Filter Bar */}
        <section className="library-filters">
          <div className="library-filters__container">
            {/* Category Chips */}
            <div className="library-filters__group">
              <h3 className="library-filters__label">Browse by Category</h3>
              <div className="library-filters__chips">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => handleCategoryClick(cat)}
                    className={`library-filters__chip ${
                      category === cat ? 'library-filters__chip--active' : ''
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort and Language Controls */}
            <div className="library-filters__controls">
              <div className="library-filters__control">
                <label htmlFor="sort-select" className="library-filters__control-label">
                  Sort
                </label>
                <select
                  id="sort-select"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="library-filters__select"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="library-filters__control">
                <label htmlFor="language-select" className="library-filters__control-label">
                  Language
                </label>
                <select
                  id="language-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="library-filters__select"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* My Shelves Section */}
        {user && (
          <section className="library-shelves">
            <div className="library-shelves__container">
              <button
                className="library-shelves__toggle"
                onClick={() => setShowShelves((prev) => !prev)}
              >
                <span className="library-shelves__toggle-label">My Bookshelves</span>
                <span className="library-shelves__toggle-icon">{showShelves ? '\u25B2' : '\u25BC'}</span>
              </button>

              {showShelves && (
                <div className="library-shelves__content">
                  {shelvesLoading ? (
                    <div className="library-shelves__loading">Loading shelves...</div>
                  ) : shelves.length === 0 ? (
                    <div className="library-shelves__empty">
                      <p>No bookshelves yet. Add books to shelves from their detail page.</p>
                    </div>
                  ) : (
                    shelves.map((shelf) => (
                      <div key={shelf.id} className="library-shelf">
                        <div className="library-shelf__header">
                          <div>
                            <h3 className="library-shelf__name">{shelf.name}</h3>
                            <div className="library-shelf__meta">
                              <span className="library-shelf__count">
                                {shelf._count?.books || 0} book{(shelf._count?.books || 0) === 1 ? '' : 's'}
                              </span>
                              <span className={`library-shelf__visibility-badge ${shelf.visibility === 'profile' ? 'library-shelf__visibility-badge--profile' : ''}`}>
                                {shelf.visibility === 'profile' ? 'Shown on profile' : 'Private'}
                              </span>
                            </div>
                          </div>
                          <div className="library-shelf__actions">
                            <label className="library-shelf__visibility-wrap">
                              <span className="library-shelf__control-label">Visibility</span>
                              <select
                                className="library-shelf__visibility-select"
                                value={shelf.visibility || 'private'}
                                disabled={shelfActionId === shelf.id}
                                onChange={(event) => updateShelfVisibility(shelf.id, event.target.value)}
                              >
                                <option value="private">Private</option>
                                <option value="profile">Show on profile</option>
                              </select>
                            </label>
                            <button
                              type="button"
                              className="library-shelf__danger-btn"
                              disabled={shelfActionId === shelf.id}
                              onClick={() => deleteShelf(shelf.id, shelf.name)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        {shelf.description && (
                          <p className="library-shelf__desc">{shelf.description}</p>
                        )}
                        {shelf.books && shelf.books.length > 0 ? (
                          <div className="library-shelf__books">
                            {shelf.books.map((book) => (
                              <Link
                                key={book.volumeId}
                                to={`/library/${book.volumeId}`}
                                className="library-shelf__book"
                              >
                                {book.coverUrl ? (
                                  <img
                                    src={book.coverUrl}
                                    alt={book.title}
                                    className="library-shelf__book-cover"
                                  />
                                ) : (
                                  <div className="library-shelf__book-placeholder">
                                    <IconBook size={24} />
                                  </div>
                                )}
                                <span className="library-shelf__book-title">{book.title}</span>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="library-shelf__empty-books">No books on this shelf yet.</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Main Content */}
        <main className="library-main">
          {/* Cache fallback notice */}
          {usingCache && !error && (
            <div className="library-notice">
              <p className="library-notice__message">
                The book catalog is temporarily showing cached results. Some books may not appear.
              </p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="library-error">
              <p className="library-error__message">Oops! Something went wrong: {error}</p>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="library-grid">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
                  <SkeletonCard
                    style={{
                      aspectRatio: '2 / 3',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Books Grid */}
          {!loading && books.length > 0 && (
            <>
              <div ref={gridRef} className="library-grid">
                {books.map((book) => (
                  <BookCard key={book.volumeId} book={book} />
                ))}
              </div>

              {/* Pagination */}
              <div className="library-pagination">
                <button
                  onClick={() => setPage(pageNumber - 1)}
                  disabled={pageNumber === 1}
                  className="library-pagination__btn library-pagination__btn--prev"
                >
                  Previous
                </button>

                <span className="library-pagination__info">
                  Page {pageNumber} of {totalPages || 1}
                </span>

                <button
                  onClick={() => setPage(pageNumber + 1)}
                  disabled={!hasNextPage}
                  className="library-pagination__btn library-pagination__btn--next"
                >
                  Next
                </button>
              </div>
            </>
          )}

          {/* Empty State */}
          {!loading && books.length === 0 && !error && (
            <div className="library-empty">
              <div className="library-empty__icon">
                <IconBook size={64} />
              </div>
              {unavailable ? (
                <>
                  <h2 className="library-empty__title">Book catalog temporarily unavailable</h2>
                  <p className="library-empty__text">
                    Our book provider is currently unreachable. Please try again in a few minutes.
                  </p>
                  <button
                    onClick={() => window.location.reload()}
                    className="library-empty__reset-btn"
                  >
                    Retry
                  </button>
                </>
              ) : (
                <>
                  <h2 className="library-empty__title">No books found</h2>
                  <p className="library-empty__text">
                    Try adjusting your search terms or filters to discover more books.
                  </p>
                  <button
                    onClick={() => {
                      setSearch('')
                      setCategory('')
                    }}
                    className="library-empty__reset-btn"
                  >
                    Clear Filters
                  </button>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  )
}
