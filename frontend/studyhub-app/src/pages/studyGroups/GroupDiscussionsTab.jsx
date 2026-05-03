import { useState } from 'react'
import { createPortal } from 'react-dom'
import MediaComposer from './MediaComposer'
import UserAvatar from '../../components/UserAvatar'
import { formatRelativeTime, getPostTypeLabel } from './studyGroupsHelpers'
import { styles } from './GroupDetailTabs.styles'

function DiscussionPostItem({
  post,
  expanded,
  onToggleExpanded,
  onReplySubmit,
  onResolve,
  onDelete,
  onUpvote,
  onApprove,
  onReject,
  replyFormData,
  setReplyFormData,
  isAdminOrMod,
  userId,
}) {
  const isAuthor = post.userId === userId || post.authorId === userId
  const authorName = post.author?.username || post.authorName || 'Unknown'
  const isResolved = post.resolved || post.isResolved
  const isPendingApproval = post.status === 'pending_approval'
  const isRemoved = post.status === 'removed'
  const badgeStyle =
    post.type === 'question'
      ? styles.badgeOrange
      : post.type === 'announcement'
        ? styles.badgeRed
        : {}

  return (
    <div
      key={post.id}
      style={{
        ...styles.discussionPost,
        marginBottom: 'var(--space-3)',
      }}
      onClick={onToggleExpanded}
    >
      <div style={styles.discussionHeader}>
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              marginBottom: 'var(--space-1)',
            }}
          >
            <div style={styles.discussionTitle}>{post.title}</div>
            {isResolved && post.type === 'question' && (
              <span style={{ ...styles.badge, ...styles.badgeGreen }}>Resolved</span>
            )}
            <span style={{ ...styles.badge, ...badgeStyle }}>{getPostTypeLabel(post.type)}</span>
            {isPendingApproval ? (
              <span
                style={{
                  ...styles.badge,
                  background: 'var(--sh-warning-bg)',
                  color: 'var(--sh-warning-text)',
                }}
              >
                Pending Approval
              </span>
            ) : null}
            {isRemoved ? (
              <span
                style={{
                  ...styles.badge,
                  background: 'var(--sh-danger-bg)',
                  color: 'var(--sh-danger-text)',
                }}
              >
                Removed
              </span>
            ) : null}
          </div>
        </div>

        {onUpvote && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onUpvote(post.id)
            }}
            style={{
              background: 'none',
              border: '1px solid var(--sh-border)',
              borderRadius: 'var(--radius-control)',
              padding: '4px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: post.userHasUpvoted ? 'var(--sh-brand)' : 'var(--sh-muted)',
              fontFamily: 'inherit',
              fontSize: 'var(--type-xs)',
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill={post.userHasUpvoted ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            {post.upvoteCount || 0}
          </button>
        )}
      </div>

      <div
        style={{
          ...styles.discussionMeta,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        <UserAvatar
          username={post.author?.username}
          avatarUrl={post.author?.avatarUrl}
          role={post.author?.role}
          size={16}
        />
        <span>{authorName}</span>
        <span> -- {formatRelativeTime(post.createdAt)}</span>
        <span> -- {post.replyCount || 0} replies</span>
        {(post.upvoteCount || 0) > 0 && (
          <span>
            {' '}
            -- {post.upvoteCount} upvote{post.upvoteCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {expanded && (
        <div style={styles.expandedContent} onClick={(e) => e.stopPropagation()}>
          <p
            style={{
              fontSize: 'var(--type-sm)',
              color: 'var(--sh-text)',
              lineHeight: '1.6',
              marginBottom: 'var(--space-4)',
            }}
          >
            {post.content}
          </p>

          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              marginBottom: 'var(--space-4)',
              flexWrap: 'wrap',
            }}
          >
            {/* Phase 5: Approve/Reject buttons for posts in the approval queue */}
            {isPendingApproval && isAdminOrMod && onApprove && (
              <button
                onClick={() => onApprove(post.id)}
                style={{
                  ...styles.button,
                  ...styles.buttonSmall,
                  backgroundColor: 'var(--sh-success)',
                  color: 'white',
                }}
              >
                Approve
              </button>
            )}
            {isPendingApproval && isAdminOrMod && onReject && (
              <button
                onClick={() => onReject(post.id)}
                style={{
                  ...styles.button,
                  ...styles.buttonSmall,
                  backgroundColor: 'var(--sh-danger)',
                  color: 'white',
                }}
              >
                Reject
              </button>
            )}

            {(isAuthor || isAdminOrMod) && post.type === 'question' && (
              <button
                onClick={() => onResolve(post.id)}
                style={{
                  ...styles.button,
                  ...styles.buttonSmall,
                  backgroundColor: isResolved ? 'var(--sh-success)' : 'var(--sh-brand)',
                  color: 'white',
                }}
              >
                {isResolved ? 'Marked Resolved' : 'Mark Resolved'}
              </button>
            )}

            {(isAuthor || isAdminOrMod) && (
              <button
                onClick={() => onDelete(post.id)}
                style={{
                  ...styles.button,
                  ...styles.buttonSmall,
                  ...styles.buttonDanger,
                }}
              >
                Delete
              </button>
            )}
          </div>

          {post.replies && post.replies.length > 0 && (
            <div style={styles.repliesList}>
              {post.replies.map((reply) => (
                <div key={reply.id} style={styles.reply}>
                  <div style={styles.replyAuthor}>
                    {reply.author?.username || reply.authorName || 'Unknown'}
                  </div>
                  <div style={styles.replyContent}>{reply.content}</div>
                  <div style={styles.replyTime}>{formatRelativeTime(reply.createdAt)}</div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={(e) => onReplySubmit(post.id, e)} style={{ marginTop: 'var(--space-4)' }}>
            <div style={styles.formGroup}>
              <textarea
                style={styles.textarea}
                value={replyFormData[post.id] || ''}
                onChange={(e) => setReplyFormData({ ...replyFormData, [post.id]: e.target.value })}
                maxLength={1000}
                placeholder="Write a reply..."
              />
            </div>
            <button
              type="submit"
              style={{ ...styles.button, ...styles.buttonPrimary, ...styles.buttonSmall }}
            >
              Reply
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

export function GroupDiscussionsTab({
  groupId,
  discussions,
  onCreatePost,
  onDeletePost,
  onAddReply,
  onResolve,
  onUpvote,
  onApprovePost,
  onRejectPost,
  isAdminOrMod,
  isMember,
  userId,
}) {
  const [newPostModalOpen, setNewPostModalOpen] = useState(false)
  const [expandedPostId, setExpandedPostId] = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'discussion',
  })
  const [replyFormData, setReplyFormData] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Phase 4: attachments uploaded via MediaComposer, posted alongside
  // the discussion body on submit.
  const [attachments, setAttachments] = useState([])

  const handleCreateClick = () => {
    setFormData({ title: '', content: '', type: 'discussion' })
    setAttachments([])
    setError('')
    setNewPostModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!formData.title.trim()) {
      setError('Title is required')
      return
    }

    if (!formData.content.trim()) {
      setError('Content is required')
      return
    }

    if (!groupId) {
      setError('Group not loaded yet — refresh and try again.')
      return
    }

    setSubmitting(true)
    try {
      // Hook signature is createPost(groupId, postData) — two positional
      // args. Passing a single bag as the first arg made the fetch URL
      // resolve to `/api/study-groups/[object Object]/discussions`, which
      // the backend's parseId() rejected with 400 "Invalid group ID."
      await onCreatePost(groupId, {
        ...formData,
        attachments: attachments.length > 0 ? attachments : undefined,
      })
      setNewPostModalOpen(false)
      setFormData({ title: '', content: '', type: 'discussion' })
      setAttachments([])
    } catch (err) {
      setError(err.message || 'Failed to create post')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReplySubmit = async (postId, e) => {
    e.preventDefault()
    setError('')

    const content = replyFormData[postId]?.trim()
    if (!content) {
      setError('Reply cannot be empty')
      return
    }

    try {
      await onAddReply(postId, { content })
      setReplyFormData({ ...replyFormData, [postId]: '' })
    } catch (err) {
      setError(err.message || 'Failed to add reply')
    }
  }

  const filteredDiscussions =
    typeFilter === 'all'
      ? discussions || []
      : (discussions || []).filter((d) => d.type === typeFilter)

  const pinnedDiscussions = filteredDiscussions.filter((d) => d.isPinned)
  const regularDiscussions = filteredDiscussions.filter((d) => !d.isPinned)

  if (!discussions || discussions.length === 0) {
    return (
      <div style={styles.tabContainer}>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon} aria-label="Comments icon">
            Discussions
          </div>
          <div style={styles.emptyTitle}>No Discussions Yet</div>
          <p style={styles.emptyText}>
            {isMember ? 'Start the conversation!' : 'Join the group to participate'}
          </p>
          {isMember && (
            <button
              onClick={handleCreateClick}
              style={{ ...styles.button, ...styles.buttonPrimary, marginTop: 'var(--space-4)' }}
            >
              New Post
            </button>
          )}
        </div>
        {createPortal(
          newPostModalOpen && (
            <div style={styles.modalOverlay} onClick={() => setNewPostModalOpen(false)}>
              <div
                style={styles.modalContent}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="new-post-title"
              >
                <h3 style={styles.sectionTitle} id="new-post-title">
                  New Discussion Post
                </h3>
                {error && <div style={styles.error}>{error}</div>}
                <form onSubmit={handleSubmit}>
                  <div style={styles.formGroup}>
                    <label htmlFor="post-title" style={styles.label}>
                      Title
                    </label>
                    <input
                      id="post-title"
                      type="text"
                      style={styles.input}
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      maxLength={150}
                      placeholder="Discussion title"
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label htmlFor="post-type" style={styles.label}>
                      Type
                    </label>
                    <select
                      id="post-type"
                      style={styles.select}
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    >
                      <option value="discussion">Discussion</option>
                      <option value="question">Question</option>
                      <option value="announcement">Announcement</option>
                    </select>
                  </div>

                  <div style={styles.formGroup}>
                    <label htmlFor="post-content" style={styles.label}>
                      Content
                    </label>
                    <textarea
                      id="post-content"
                      style={styles.textarea}
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      maxLength={5000}
                      placeholder="Write your post..."
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <div style={styles.label}>Attachments (optional)</div>
                    <MediaComposer
                      groupId={groupId}
                      maxFiles={4}
                      attachments={attachments}
                      onAttachmentsChange={setAttachments}
                    />
                  </div>

                  <div style={styles.formActions}>
                    <button
                      type="button"
                      onClick={() => setNewPostModalOpen(false)}
                      style={{ ...styles.button, ...styles.buttonSecondary }}
                      aria-label="Close New Post dialog"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      style={{ ...styles.button, ...styles.buttonPrimary }}
                    >
                      {submitting ? 'Posting...' : 'Post'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ),
          document.body,
        )}
      </div>
    )
  }

  return (
    <div style={styles.tabContainer}>
      {isMember && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <button
            onClick={handleCreateClick}
            style={{ ...styles.button, ...styles.buttonPrimary }}
            aria-label="Create new discussion post"
          >
            New Post
          </button>
        </div>
      )}

      <div style={styles.filterTabs}>
        {['all', 'discussion', 'question', 'announcement'].map((type) => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            style={{
              ...styles.filterTab,
              ...(typeFilter === type ? styles.filterTabActive : {}),
            }}
          >
            {type === 'all' ? 'All Posts' : getPostTypeLabel(type)}
          </button>
        ))}
      </div>

      <div style={styles.section}>
        {pinnedDiscussions.length > 0 && (
          <>
            <h3 style={{ ...styles.sectionTitle, marginBottom: 'var(--space-3)' }}>Pinned</h3>
            {pinnedDiscussions.map((post) => (
              <DiscussionPostItem
                key={post.id}
                post={post}
                expanded={expandedPostId === post.id}
                onToggleExpanded={() =>
                  setExpandedPostId(expandedPostId === post.id ? null : post.id)
                }
                onReplySubmit={handleReplySubmit}
                onResolve={onResolve}
                onDelete={onDeletePost}
                onUpvote={onUpvote}
                onApprove={onApprovePost}
                onReject={onRejectPost}
                replyFormData={replyFormData}
                setReplyFormData={setReplyFormData}
                isAdminOrMod={isAdminOrMod}
                userId={userId}
              />
            ))}
          </>
        )}

        {regularDiscussions.length > 0 && (
          <>
            {pinnedDiscussions.length > 0 && (
              <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                <hr style={{ border: 'none', borderTop: `1px solid var(--sh-border)` }} />
              </div>
            )}
            {regularDiscussions.map((post) => (
              <DiscussionPostItem
                key={post.id}
                post={post}
                expanded={expandedPostId === post.id}
                onToggleExpanded={() =>
                  setExpandedPostId(expandedPostId === post.id ? null : post.id)
                }
                onReplySubmit={handleReplySubmit}
                onResolve={onResolve}
                onDelete={onDeletePost}
                onUpvote={onUpvote}
                onApprove={onApprovePost}
                onReject={onRejectPost}
                replyFormData={replyFormData}
                setReplyFormData={setReplyFormData}
                isAdminOrMod={isAdminOrMod}
                userId={userId}
              />
            ))}
          </>
        )}
      </div>

      {createPortal(
        newPostModalOpen && (
          <div style={styles.modalOverlay} onClick={() => setNewPostModalOpen(false)}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <h3 style={styles.sectionTitle}>New Discussion Post</h3>
              {error && <div style={styles.error}>{error}</div>}
              <form onSubmit={handleSubmit}>
                <div style={styles.formGroup}>
                  <label htmlFor="post-title" style={styles.label}>
                    Title
                  </label>
                  <input
                    id="post-title"
                    type="text"
                    style={styles.input}
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    maxLength={150}
                    placeholder="Discussion title"
                  />
                </div>

                <div style={styles.formGroup}>
                  <label htmlFor="post-type" style={styles.label}>
                    Type
                  </label>
                  <select
                    id="post-type"
                    style={styles.select}
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  >
                    <option value="discussion">Discussion</option>
                    <option value="question">Question</option>
                    <option value="announcement">Announcement</option>
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label htmlFor="post-content" style={styles.label}>
                    Content
                  </label>
                  <textarea
                    id="post-content"
                    style={styles.textarea}
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    maxLength={5000}
                    placeholder="Write your post..."
                  />
                </div>

                <div style={styles.formGroup}>
                  <div style={styles.label}>Attachments (optional)</div>
                  <MediaComposer
                    groupId={groupId}
                    maxFiles={4}
                    attachments={attachments}
                    onAttachmentsChange={setAttachments}
                  />
                </div>

                <div style={styles.formActions}>
                  <button
                    type="button"
                    onClick={() => setNewPostModalOpen(false)}
                    style={{ ...styles.button, ...styles.buttonSecondary }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{ ...styles.button, ...styles.buttonPrimary }}
                  >
                    {submitting ? 'Posting...' : 'Post'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ),
        document.body,
      )}
    </div>
  )
}
