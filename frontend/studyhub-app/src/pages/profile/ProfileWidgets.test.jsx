import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileAvatar } from './ProfileWidgets'

describe('ProfileAvatar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('retries the same profile avatar URL after a transient load failure', () => {
    render(
      <ProfileAvatar
        profile={{ username: 'student', avatarUrl: 'https://cdn.example.com/avatar.png' }}
        initials="ST"
        isOwnProfile={false}
      />,
    )

    fireEvent.error(screen.getByRole('img', { name: 'student' }))
    expect(screen.queryByRole('img', { name: 'student' })).toBeNull()
    expect(screen.getByText('ST')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(30000)
    })

    expect(screen.getByRole('img', { name: 'student' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/avatar.png',
    )
  })

  it('clears failed state immediately when the profile avatar URL changes', () => {
    const { rerender } = render(
      <ProfileAvatar
        profile={{ username: 'student', avatarUrl: 'https://cdn.example.com/old.png' }}
        initials="ST"
        isOwnProfile={false}
      />,
    )

    fireEvent.error(screen.getByRole('img', { name: 'student' }))
    expect(screen.queryByRole('img', { name: 'student' })).toBeNull()

    rerender(
      <ProfileAvatar
        profile={{ username: 'student', avatarUrl: 'https://cdn.example.com/new.png' }}
        initials="ST"
        isOwnProfile={false}
      />,
    )

    expect(screen.getByRole('img', { name: 'student' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/new.png',
    )
  })
})
