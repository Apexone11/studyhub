/**
 * RecentlyViewedPapers — horizontal chip strip of the viewer's most
 * recent Scholar papers, backed by the localStorage-based
 * `useScholarRecentlyViewed` hook.
 *
 * Behavior:
 *   - `items.length === 0` → render null.
 *   - Each chip is a Link to `/scholar/paper/:id`, plus a small × button
 *     to remove that entry.
 *   - "Clear all" button at the end of the strip.
 *
 * a11y:
 *   - Chip is a real <Link>, remove button is a separate <button> so a
 *     screen reader user can target it directly.
 *   - 44×44 tap targets via padding on both the chip and the × button.
 *   - `aria-label` on the × button names the paper being removed.
 */
import { Link } from 'react-router-dom'
import useScholarRecentlyViewed from './useScholarRecentlyViewed'

const STRIP_STYLE = {
  display: 'flex',
  gap: '8px',
  overflowX: 'auto',
  paddingBottom: '6px',
  scrollbarWidth: 'thin',
  WebkitOverflowScrolling: 'touch',
}

const CHIP_WRAP_STYLE = {
  display: 'inline-flex',
  alignItems: 'stretch',
  flex: '0 0 auto',
  background: 'var(--sh-surface)',
  border: '1px solid var(--sh-border)',
  borderRadius: '12px',
  overflow: 'hidden',
  maxWidth: '260px',
}

const CHIP_LINK_STYLE = {
  display: 'inline-flex',
  flexDirection: 'column',
  justifyContent: 'center',
  padding: '8px 12px',
  color: 'var(--sh-text)',
  textDecoration: 'none',
  fontFamily: 'inherit',
  fontSize: 'var(--type-sm)',
  lineHeight: 1.2,
  minHeight: '44px',
  minWidth: '0',
}

const CHIP_REMOVE_BTN_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  minHeight: '44px',
  background: 'transparent',
  border: 'none',
  borderLeft: '1px solid var(--sh-border)',
  color: 'var(--sh-subtext)',
  cursor: 'pointer',
  fontSize: '14px',
}

const CLEAR_ALL_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  flex: '0 0 auto',
  padding: '8px 14px',
  background: 'transparent',
  border: '1px dashed var(--sh-border)',
  borderRadius: '12px',
  color: 'var(--sh-subtext)',
  fontFamily: 'inherit',
  fontSize: 'var(--type-xs)',
  cursor: 'pointer',
  minHeight: '44px',
}

const TITLE_STYLE = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  wordBreak: 'break-word',
}

const META_STYLE = {
  marginTop: '2px',
  color: 'var(--sh-subtext)',
  fontSize: 'var(--type-xs)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

export default function RecentlyViewedPapers({ heading = 'Recently viewed' }) {
  const { items, remove, clear } = useScholarRecentlyViewed()

  if (!items || items.length === 0) return null

  return (
    <section
      aria-label={heading}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        margin: '8px 0 16px',
      }}
    >
      {heading ? (
        <h3
          style={{
            margin: 0,
            fontFamily: 'inherit',
            fontSize: 'var(--type-sm)',
            fontWeight: 600,
            color: 'var(--sh-heading, var(--sh-text))',
          }}
        >
          {heading}
        </h3>
      ) : null}

      <div style={STRIP_STYLE}>
        {items.map((item) => {
          const meta = [item.firstAuthor, item.year, item.venue].filter(Boolean).join(' · ')
          return (
            <div key={item.id} style={CHIP_WRAP_STYLE}>
              <Link
                to={`/scholar/paper/${encodeURIComponent(item.id)}`}
                style={CHIP_LINK_STYLE}
                aria-label={`${item.title || 'Untitled paper'}${meta ? ', ' + meta : ''}`}
              >
                <span style={TITLE_STYLE}>{item.title || 'Untitled paper'}</span>
                {meta ? <span style={META_STYLE}>{meta}</span> : null}
              </Link>
              <button
                type="button"
                onClick={() => remove(item.id)}
                style={CHIP_REMOVE_BTN_STYLE}
                aria-label={`Remove ${item.title || 'paper'} from recently viewed`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )
        })}

        <button
          type="button"
          onClick={clear}
          style={CLEAR_ALL_STYLE}
          aria-label="Clear all recently viewed papers"
        >
          Clear all
        </button>
      </div>
    </section>
  )
}
