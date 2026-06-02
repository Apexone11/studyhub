import { Link } from 'react-router-dom'
import {
  getBookCover,
  getAuthorNames,
  formatPageCount,
  truncateText,
  hasPdf,
  hasEpub,
  isPublicDomainFull,
} from '../libraryHelpers'
import './BookCard.css'

/**
 * BookCard -- Reusable card component for displaying a book in a grid.
 * Uses Google Books normalized data format (volumeId, authors as string[], etc.)
 *
 * @param {object} props
 * @param {object} props.book - Normalized Google Books book object
 * @param {number} props.progress - Optional reading progress percentage (0-100)
 */
export default function BookCard({ book, progress }) {
  if (!book) return null

  const coverUrl = getBookCover(book)
  const author = getAuthorNames(book)
  const pages = formatPageCount(book.pageCount || 0)
  const title = truncateText(book.title, 50)

  const fallbackGradient = 'linear-gradient(135deg, var(--sh-brand), var(--sh-brand-accent))'

  return (
    <Link
      to={`/library/${book.volumeId}`}
      className="book-card"
      aria-label={`${book.title}${author ? ` by ${author}` : ''}`}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <div className="book-card__image-container">
        {coverUrl ? (
          <img src={coverUrl} alt={book.title} className="book-card__image" loading="lazy" />
        ) : (
          <div className="book-card__image-fallback" style={{ background: fallbackGradient }}>
            <div className="book-card__fallback-text">{title}</div>
          </div>
        )}

        {progress !== undefined && progress > 0 && (
          <div className="book-card__progress-bar">
            <div
              className="book-card__progress-fill"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        )}

        {/* Format-availability badges.
            Up to 3 stacked badges at the bottom-right of the cover so
            users can see at a glance which books are PDF / EPUB / fully
            public-domain. No emoji per CLAUDE.md UI-chrome rule. */}
        {(hasPdf(book) || hasEpub(book) || isPublicDomainFull(book)) && (
          <div className="book-card__badges" aria-hidden="false">
            {isPublicDomainFull(book) && (
              <span
                className="book-card__badge book-card__badge--free"
                aria-label="Free full-text public domain book"
              >
                Free
              </span>
            )}
            {hasPdf(book) && (
              <span className="book-card__badge book-card__badge--pdf" aria-label="PDF available">
                PDF
              </span>
            )}
            {hasEpub(book) && (
              <span className="book-card__badge book-card__badge--epub" aria-label="EPUB available">
                EPUB
              </span>
            )}
          </div>
        )}
      </div>

      <div className="book-card__content">
        <h3 className="book-card__title" title={book.title}>
          {title}
        </h3>
        <p className="book-card__author" title={author}>
          {author}
        </p>
        <p className="book-card__downloads">{pages}</p>
      </div>
    </Link>
  )
}
