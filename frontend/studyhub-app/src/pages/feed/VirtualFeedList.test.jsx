import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import VirtualFeedList from './VirtualFeedList'

afterEach(() => {
  cleanup()
})

const makeItems = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    feedKey: `sheet-${i + 1}`,
    type: 'sheet',
    title: `Sheet ${i + 1}`,
    body: 'content',
    createdAt: new Date().toISOString(),
    author: { id: 1, username: 'alice' },
    stars: 0,
    starred: false,
    reactions: { likes: 0, dislikes: 0, userReaction: null },
  }))

const noop = () => {}

describe('VirtualFeedList', () => {
  it('renders the correct number of items', () => {
    const items = makeItems(5)
    render(
      <MemoryRouter>
        <VirtualFeedList
          items={items}
          hasMore={false}
          loadingMore={false}
          onLoadMore={noop}
          onReact={noop}
          onStar={noop}
          onDeletePost={noop}
          canDeletePost={() => false}
          openPostMenuId={null}
          onTogglePostMenu={noop}
          deletingPostIds={{}}
          currentUser={null}
          onReport={noop}
          targetCommentId={null}
        />
      </MemoryRouter>,
    )

    expect(screen.getAllByRole('article')).toHaveLength(5)
  })

  it('shows Load More button when hasMore is true', () => {
    const items = makeItems(2)
    render(
      <MemoryRouter>
        <VirtualFeedList
          items={items}
          hasMore={true}
          loadingMore={false}
          onLoadMore={noop}
          onReact={noop}
          onStar={noop}
          onDeletePost={noop}
          canDeletePost={() => false}
          openPostMenuId={null}
          onTogglePostMenu={noop}
          deletingPostIds={{}}
          currentUser={null}
          onReport={noop}
          targetCommentId={null}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument()
  })
})
