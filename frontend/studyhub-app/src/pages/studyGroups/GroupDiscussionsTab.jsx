import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import MediaComposer from './MediaComposer'
import UserAvatar from '../../components/UserAvatar'
import AttachmentPreview from '../../components/AttachmentPreview'
import MentionText from '../../components/MentionText'
import { formatRelativeTime, getPostTypeLabel } from './studyGroupsHelpers'
import { styles } from './GroupDetailTabs.styles'

function DiscussionPostItem({
  post,
  expanded,
  onToggleExpanded,
  onReplySubmit,
  onResolve,
  onDelete,
  onTogglePin,
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
          {/* Backend rejects empty body with 400 in createDiscussion +
              updateDiscussion, so post.content is always non-empty for
              persisted posts. No fallback needed. */}
          <p
            style={{
              fontSize: 'var(--type-sm)',
              color: 'var(--sh-text)',
              lineHeight: '1.6',
              marginBottom: 'var(--space-4)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            <MentionText text={post.content || ''} />
          </p>

          {/* Phase 4 attachments: render thumbnails / preview triggers
              for each attachment that came back from the backend. The
              backend persists `{ url, mime, bytes, kind }` on
              feedPost.attachments and serializes them on every read.
              Without this block the attachment was uploaded + saved but
              never visible to other group members on the post card. */}
          {Array.isArray(post.attachments) && post.attachments.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 8,
                marginBottom: 'var(--space-4)',
              }}
            >
              {post.attachments.map((att, idx) => {
                const name =
                  att.name || (att.url ? att.url.split('/').pop() : `attachment-${idx + 1}`)
                if (att.kind === 'image' && att.url) {
                  return (
                    <AttachmentPreview
                      key={`${att.url}-${idx}`}
                      attachment={{ url: att.url, name, type: att.mime, kind: 'image' }}
                      triggerStyle={{
                        padding: 0,
                        border: '1px solid var(--sh-border)',
                        borderRadius: 8,
                        background: 'var(--sh-soft)',
                        cursor: 'zoom-in',
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={att.url}
                        alt={name}
                        loading="lazy"
                        style={{ display: 'block', width: '100%', height: 110, objectFit: 'cover' }}
                      />
                    </AttachmentPreview>
                  )
                }
                return (
                  <AttachmentPreview
                    key={`${att.url}-${idx}`}
                    attachment={{ url: att.url, name, type: att.mime, kind: att.kind }}
                  />
                )
              })}
            </div>
          )}

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

            {/* New 2026-05-03 feature: pin / unpin a thread.
                Mod-only, surfaces a pinned section above the regular
                feed (the pinned filter already runs against post.pinned
                — same field the backend serializes). */}
            {isAdminOrMod && onTogglePin && (
              <button
                onClick={() => onTogglePin(post.id, !post.pinned)}
                style={{
                  ...styles.button,
                  ...styles.buttonSmall,
                  backgroundColor: post.pinned ? 'var(--sh-warning)' : 'var(--sh-soft)',
                  color: post.pinned ? '#fff' : 'var(--sh-text)',
                  border: '1px solid var(--sh-border)',
                }}
                aria-pressed={Boolean(post.pinned)}
              >
                {post.pinned ? 'Unpin' : 'Pin to top'}
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
                  <div style={styles.replyContent}>
                    <MentionText text={reply.content || ''} />
                  </div>
                  {Array.isArray(reply.attachments) && reply.attachments.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        marginTop: 6,
                      }}
                    >
                      {reply.attachments.map((att, idx) => {
                        const name =
                          att.name || (att.url ? att.url.split('/').pop() : `attachment-${idx + 1}`)
                        return (
                          <AttachmentPreview
                            key={`${att.url}-${idx}`}
                            attachment={{
                              url: att.url,
                              name,
                              type: att.mime,
                              kind: att.kind,
                            }}
                          />
                        )
                      })}
                    </div>
                  )}
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
  loading,
  onCreatePost,
  onDeletePost,
  onAddReply,
  onResolve,
  onTogglePin,
  onUpvote,
  onApprovePost,
  onRejectPost,
  isAdminOrMod,
  isMember,
  userId,
  initialFocusedPostId = null,
}) {
  const [newPostModalOpen, setNewPostModalOpen] = useState(false)
  // Lazy-init expandedPostId from the URL deep-link so a notification
  // click (`?tab=discussions&post=42`) lands the user with that thread
  // already expanded on first render. Subsequent toggles work normally.
  const [expandedPostId, setExpandedPostId] = useState(() => initialFocusedPostId)
  // Re-apply the focus when the prop changes (parent updates it on
  // same-route notification clicks per Copilot review #1, 2026-05-03).
  // Without this the thread the second notification refers to never
  // auto-expands because lazy-init only fires once.
  useEffect(() => {
    if (initialFocusedPostId && initialFocusedPostId !== expandedPostId) {
      setExpandedPostId(initialFocusedPostId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFocusedPostId])
  const [typeFilter, setTypeFilter] = useState('all')
  // New 2026-05-03 features: client-side search across title/body/author,
  // and pinned-thread sort. Search is debounced via the input itself
  // (only re-renders the list when the user types) and is purely
  // client-side over the already-loaded discussions list.
  const [searchQuery, setSearchQuery] = useState('')
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
      // Parent (GroupDetailView) wraps onCreatePost so it already
      // knows the groupId. Pass only the post payload here.
      await onCreatePost({
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

  const baseFiltered =
    typeFilter === 'all'
      ? discussions || []
      : (discussions || []).filter((d) => d.type === typeFilter)

  // Client-side search across title, body, and author username so the
  // user can find an old thread without scrolling. Empty query short-
  // circuits to the unfiltered list. Trimmed + lowercased once per
  // render rather than per-post.
  const q = searchQuery.trim().toLowerCase()
  const filteredDiscussions = q
    ? baseFiltered.filter((d) => {
        const title = (d.title || '').toLowerCase()
        const body = (d.content || '').toLowerCase()
        const author = (d.author?.username || d.authorName || '').toLowerCase()
        return title.includes(q) || body.includes(q) || author.includes(q)
      })
    : baseFiltered

  // Backend serializes the field as `pinned` (not `isPinned`). The
  // older `d.isPinned` lookup always returned undefined, so the
  // pinned-section never rendered even when a mod had pinned a post.
  const pinnedDiscussions = filteredDiscussions.filter((d) => d.pinned)
  const regularDiscussions = filteredDiscussions.filter((d) => !d.pinned)

  // Don't flash "No Discussions Yet" while the initial fetch is in
  // flight — wait for `loading=false` before deciding the list is empty.
  // (Copilot 2026-05-03 finding.)
  if (loading) {
    return (
      <div style={styles.tabContainer}>
        <div style={{ ...styles.emptyState, color: 'var(--sh-muted)' }}>Loading discussions…</div>
      </div>
    )
  }

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

      <div style={{ marginBottom: 'var(--space-4)', position: 'relative' }}>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search discussions by title, body, or author…"
          aria-label="Search group discussions"
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid var(--sh-input-border)',
            background: 'var(--sh-input-bg, var(--sh-surface))',
            color: 'var(--sh-text)',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        />
        {q && filteredDiscussions.length === 0 ? (
          <p
            style={{
              fontSize: 12,
              color: 'var(--sh-muted)',
              marginTop: 6,
            }}
          >
            No posts match &ldquo;{searchQuery}&rdquo;.
          </p>
        ) : null}
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
                onTogglePin={onTogglePin}
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
                onTogglePin={onTogglePin}
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
