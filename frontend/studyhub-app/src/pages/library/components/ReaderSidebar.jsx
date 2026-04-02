import { useState } from 'react'
import { IconX } from '../../../components/Icons'
import '../BookReaderPage.css'

export default function ReaderSidebar({
  toc,
  bookmarks,
  highlights,
  onNavigate,
  onRemoveBookmark,
  onRemoveHighlight,
  onClose,
}) {
  const [activeTab, setActiveTab] = useState('toc') // 'toc', 'bookmarks', 'highlights'

  const renderToc = () => {
    if (!toc || toc.length === 0) {
      return <div className="reader-sidebar__empty">No table of contents</div>
    }

    return (
      <ul className="reader-sidebar__toc-list">
        {toc.map((item, idx) => (
          <li key={idx} className="reader-sidebar__toc-item">
            <button
              onClick={() => {
                if (item.href) {
                  onNavigate(item.href)
                  onClose()
                }
              }}
              className="reader-sidebar__toc-link"
              title={item.label}
            >
              {item.label}
            </button>
            {item.subitems && item.subitems.length > 0 && (
              <ul className="reader-sidebar__toc-sublist">
                {item.subitems.map((subitem, subIdx) => (
                  <li
                    key={subIdx}
                    className="reader-sidebar__toc-subitem"
                  >
                    <button
                      onClick={() => {
                        if (subitem.href) {
                          onNavigate(subitem.href)
                          onClose()
                        }
                      }}
                      className="reader-sidebar__toc-link"
                      title={subitem.label}
                    >
                      {subitem.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    )
  }

  const renderBookmarks = () => {
    if (!bookmarks || bookmarks.length === 0) {
      return <div className="reader-sidebar__empty">No bookmarks yet</div>
    }

    return (
      <div className="reader-sidebar__bookmarks-list">
        {bookmarks.map((bookmark) => (
          <div key={bookmark.id} className="reader-sidebar__bookmark-item">
            <button
              onClick={() => {
                if (bookmark.cfi) {
                  onNavigate(bookmark.cfi)
                  onClose()
                }
              }}
              className="reader-sidebar__bookmark-link"
            >
              <div className="reader-sidebar__bookmark-label">
                {bookmark.label}
              </div>
              {bookmark.pageSnippet && (
                <div className="reader-sidebar__bookmark-snippet">
                  {bookmark.pageSnippet}
                </div>
              )}
            </button>
            <button
              onClick={() => onRemoveBookmark(bookmark.id)}
              className="reader-sidebar__bookmark-delete"
              aria-label="Delete bookmark"
            >
              <IconX size={16} />
            </button>
          </div>
        ))}
      </div>
    )
  }

  const renderHighlights = () => {
    if (!highlights || highlights.length === 0) {
      return <div className="reader-sidebar__empty">No highlights yet</div>
    }

    return (
      <div className="reader-sidebar__highlights-list">
        {highlights.map((highlight) => (
          <div
            key={highlight.id}
            className="reader-sidebar__highlight-item"
          >
            <div className="reader-sidebar__highlight-color">
              <div
                className="reader-sidebar__highlight-swatch"
                style={{ backgroundColor: highlight.color || '#ffff00' }}
              />
            </div>
            <div className="reader-sidebar__highlight-content">
              <div className="reader-sidebar__highlight-text">
                "{highlight.text}"
              </div>
              {highlight.note && (
                <div className="reader-sidebar__highlight-note">
                  {highlight.note}
                </div>
              )}
            </div>
            <button
              onClick={() => onRemoveHighlight(highlight.id)}
              className="reader-sidebar__highlight-delete"
              aria-label="Delete highlight"
            >
              <IconX size={16} />
            </button>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="reader-sidebar">
      {/* Header */}
      <div className="reader-sidebar__header">
        <h3>
          {activeTab === 'toc' && 'Contents'}
          {activeTab === 'bookmarks' && 'Bookmarks'}
          {activeTab === 'highlights' && 'Highlights'}
        </h3>
        <button
          onClick={onClose}
          className="reader-sidebar__close-btn"
          aria-label="Close sidebar"
        >
          <IconX size={20} />
        </button>
      </div>

      {/* Tab Bar */}
      <div className="reader-sidebar__tabs">
        <button
          onClick={() => setActiveTab('toc')}
          className={`reader-sidebar__tab ${
            activeTab === 'toc' ? 'active' : ''
          }`}
        >
          Contents
        </button>
        <button
          onClick={() => setActiveTab('bookmarks')}
          className={`reader-sidebar__tab ${
            activeTab === 'bookmarks' ? 'active' : ''
          }`}
        >
          Bookmarks
        </button>
        <button
          onClick={() => setActiveTab('highlights')}
          className={`reader-sidebar__tab ${
            activeTab === 'highlights' ? 'active' : ''
          }`}
        >
          Highlights
        </button>
      </div>

      {/* Content */}
      <div className="reader-sidebar__content">
        {activeTab === 'toc' && renderToc()}
        {activeTab === 'bookmarks' && renderBookmarks()}
        {activeTab === 'highlights' && renderHighlights()}
      </div>
    </div>
  )
}
