/* ═══════════════════════════════════════════════════════════════════════════
 * LibraryPage.jsx — Book catalog with search, filters, and grid display
 *
 * Features:
 *   - Hero section with gradient background and centered search
 *   - Topic/subject filter chips (horizontal scroll)
 *   - Sort dropdown and language filter
 *   - Responsive book grid with BookCard components
 *   - Pagination support
 *   - Empty state handling
 *   - Loading skeleton grid
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { IconSearch, IconBook } from '../../components/Icons'
import { SkeletonCard } from '../../components/Skeleton'
import { usePageTitle } from '../../lib/usePageTitle'
import BookCard from './components/BookCard'
import useLibraryData from './useLibraryData'
import autoAnimate from '@formkit/auto-animate'
import { SUBJECTS, SORT_OPTIONS, LANGUAGES } from './libraryConstants'
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
    topic,
    sort,
    languages,
    setSearch,
    setTopic,
    setSort,
    setPage,
    setLanguages,
  } = useLibraryData()

  const [searchInput, setSearchInput] = useState(search)

  // Auto-animate the books grid for smooth transitions
  const gridRef = useRef(null)
  useEffect(() => {
    if (gridRef.current) autoAnimate(gridRef.current, { duration: 250 })
  }, [])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setSearch(searchInput)
  }

  const handleTopicClick = (subject) => {
    if (topic === subject) {
      setTopic('')
    } else {
      setTopic(subject)
    }
  }

  const booksPerPage = 32
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
            <div className="library-hero__badge">70,000+ Books</div>
            <h1 className="library-hero__title">BookHub</h1>
            <p className="library-hero__subtitle">
              Free classic books at your fingertips
            </p>

            <form
              onSubmit={handleSearchSubmit}
              className="library-hero__search-form"
            >
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
            {/* Topic/Subject Chips */}
            <div className="library-filters__group">
              <h3 className="library-filters__label">Browse by Subject</h3>
              <div className="library-filters__chips">
                {SUBJECTS.map((subject) => (
                  <button
                    key={subject}
                    onClick={() => handleTopicClick(subject)}
                    className={`library-filters__chip ${
                      topic === subject ? 'library-filters__chip--active' : ''
                    }`}
                  >
                    {subject}
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
                  value={languages}
                  onChange={(e) => setLanguages(e.target.value)}
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
              <p className="library-error__message">
                Oops! Something went wrong: {error}
              </p>
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
                  <BookCard
                    key={book.id}
                    book={book}
                  />
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
                      setTopic('')
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
