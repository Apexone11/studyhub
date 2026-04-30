import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProfileTab from './ProfileTab'

function renderProfileTab(overrides = {}) {
  return render(
    <ProfileTab
      user={{ username: 'student', ...overrides }}
      sessionUser={null}
      onAvatarChange={vi.fn()}
      onCoverChange={vi.fn()}
      onUserChange={vi.fn()}
    />,
  )
}

describe('ProfileTab cover controls', () => {
  it('keeps cover actions available when an existing raw cover URL is blocked as unsafe', () => {
    renderProfileTab({ coverImageUrl: 'javascript:alert(1)' })

    expect(screen.getByText('No cover image')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Profile cover' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Change cover' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove cover' })).toBeInTheDocument()
  })

  it('does not show remove cover when no raw cover URL exists', () => {
    renderProfileTab()

    expect(screen.getByRole('button', { name: 'Upload cover' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove cover' })).toBeNull()
  })
})
