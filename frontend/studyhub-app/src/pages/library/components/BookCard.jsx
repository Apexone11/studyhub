import { Link } from 'react-router-dom'
import { getBookCover, getAuthorNames, formatDownloads, truncateText } from '../libraryHelpers'
import './BookCard.css'

/**
 * BookCard — Reusable card component for displaying book in grid
 *
 * @param {object} props
 * @param {object} props.book - Gutendex book object
 * @param {number} props.progress - Optional reading progress percentage (0-100)
 */
export default function BookCard({ book, progress }) {
  if (!book) return null

  const coverUrl = getBookCover(book)
  const author = getAuthorNames(book)
  const downloads = formatDownloads(book.download_count || 0)
  const title = truncateText(book.title, 50)

  const fallbackGradient = 'linear-gradient(135deg, var(--sh-brand), #7c3aed)'

  return (
    <Link
      to={`/library/${book.id}`}
      className="book-card"
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <div className="book-card__image-container">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={book.title}
            className="book-card__image"
          />
        ) : (
          <div
            className="book-card__image-fallback"
            style={{ background: fallbackGradient }}
          >
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
      </div>

      <div className="book-card__content">
        <h3 className="book-card__title" title={book.title}>
          {title}
        </h3>
        <p className="book-card__author" title={author}>
          {author}
        </p>
        <p className="book-card__downloads">{downloads}</p>
      </div>
    </Link>
  )
}
