import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UserAvatar from './UserAvatar'

describe('UserAvatar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('retries the same avatar URL after a transient load failure', () => {
    render(<UserAvatar username="jane" avatarUrl="https://cdn.example.com/avatar.png" />)

    fireEvent.error(screen.getByRole('img', { name: 'jane' }))
    expect(screen.queryByRole('img', { name: 'jane' })).toBeNull()
    expect(screen.getByText('JA')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(30000)
    })

    expect(screen.getByRole('img', { name: 'jane' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/avatar.png',
    )
  })

  it('clears failed state immediately when the avatar URL changes', () => {
    const { rerender } = render(
      <UserAvatar username="jane" avatarUrl="https://cdn.example.com/old.png" />,
    )

    fireEvent.error(screen.getByRole('img', { name: 'jane' }))
    expect(screen.queryByRole('img', { name: 'jane' })).toBeNull()

    rerender(<UserAvatar username="jane" avatarUrl="https://cdn.example.com/new.png" />)

    expect(screen.getByRole('img', { name: 'jane' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/new.png',
    )
  })
})
