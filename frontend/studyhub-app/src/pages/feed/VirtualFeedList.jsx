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
  studyStatusMap,
}) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {items.map((item) => (
        <div key={item.feedKey} data-post-id={item.type === 'post' ? item.id : undefined}>
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
            studyStatus={item.type === 'sheet' ? studyStatusMap?.[item.id] || null : null}
          />
        </div>
      ))}

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
