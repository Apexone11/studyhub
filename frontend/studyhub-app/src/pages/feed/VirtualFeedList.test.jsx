import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// Mock @tanstack/react-virtual since jsdom has no layout engine
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: `vitem-${i}`,
        start: i * 200,
        size: 200,
      })),
    getTotalSize: () => count * 200,
    measureElement: () => {},
  }),
}))

// Must import AFTER mock is set up
const { default: VirtualFeedList } = await import('./VirtualFeedList')

afterEach(() => { cleanup() })

const makeItems = (n) => Array.from({ length: n }, (_, i) => ({
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
  it('renders the correct number of virtualized items', () => {
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
