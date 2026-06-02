import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FollowModal, ProfileAvatar } from './ProfileWidgets'

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

describe('FollowModal accessibility', () => {
  function renderFollowModal(props = {}) {
    return render(
      <MemoryRouter>
        <FollowModal
          followModal="followers"
          followList={[{ id: 1, username: 'alice', role: 'student' }]}
          followListLoading={false}
          onClose={vi.fn()}
          {...props}
        />
      </MemoryRouter>,
    )
  }

  it('exposes an accessible dialog with aria-modal while open', () => {
    renderFollowModal()
    const dialog = screen.getByRole('dialog', { name: 'Followers' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('labels the dialog "Following" when viewing the following list', () => {
    renderFollowModal({ followModal: 'following' })
    expect(screen.getByRole('dialog', { name: 'Following' })).toBeInTheDocument()
  })

  it('renders nothing when followModal is falsy', () => {
    renderFollowModal({ followModal: null })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
