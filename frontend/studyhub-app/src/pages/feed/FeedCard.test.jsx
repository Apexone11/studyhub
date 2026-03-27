import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import FeedCard from './FeedCard'

const baseItem = {
  id: 1,
  feedKey: 'sheet-1',
  type: 'sheet',
  title: 'Test Sheet',
  body: 'Some content',
  createdAt: new Date().toISOString(),
  author: { id: 1, username: 'alice' },
  stars: 5,
  starred: false,
  reactions: { likes: 0, dislikes: 0, userReaction: null },
}

const noop = () => {}

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <FeedCard
        item={baseItem}
        onReact={noop}
        onStar={noop}
        onDeletePost={noop}
        canDeletePost={false}
        isPostMenuOpen={false}
        onTogglePostMenu={noop}
        isDeletingPost={false}
        currentUser={null}
        onReport={noop}
        targetCommentId={null}
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('FeedCard', () => {
  it('renders sheet card with title and stars', () => {
    renderCard()
    expect(screen.getByText('Test Sheet')).toBeInTheDocument()
    expect(screen.getByText('5 stars')).toBeInTheDocument()
  })

  it('is wrapped in React.memo (displayName check)', () => {
    // React.memo components have a $$typeof of Symbol.for('react.memo')
    expect(FeedCard).toHaveProperty('$$typeof', Symbol.for('react.memo'))
  })
})
