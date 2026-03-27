import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import FeedCard from './FeedCard'

export default function VirtualFeedList({
  items,
  hasMore,
  loadingMore,
  onLoadMore,
  onReact,
  onStar,
  onDeletePost,
  canDeletePost,
  openPostMenuId,
  onTogglePostMenu,
  deletingPostIds,
  currentUser,
  onReport,
  targetCommentId,
}) {
  const scrollRef = useRef(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    overscan: 3,
    gap: 14,
  })

  return (
    <div
      ref={scrollRef}
      style={{
        height: '100%',
        maxHeight: 'calc(100vh - 120px)',
        overflow: 'auto',
        contain: 'strict',
      }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index]
          return (
            <div
              key={item.feedKey}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <FeedCard
                item={item}
                onReact={onReact}
                onStar={onStar}
                onDeletePost={onDeletePost}
                canDeletePost={canDeletePost(item)}
                isPostMenuOpen={openPostMenuId === item.id}
                onTogglePostMenu={onTogglePostMenu}
                isDeletingPost={Boolean(deletingPostIds[item.id])}
                currentUser={currentUser}
                onReport={onReport}
                targetCommentId={targetCommentId}
              />
            </div>
          )
        })}
      </div>

      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="sh-load-more-btn"
          style={{ marginTop: 14 }}
        >
          {loadingMore ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  )
}
