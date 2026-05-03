// TopicPickerModal.test — covers catalog fetch, search filter, follow /
// unfollow click behavior, and the custom-topic regex validation.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import TopicPickerModal from './TopicPickerModal'

const CATALOG = {
  topics: [
    {
      id: 1,
      name: 'machine_learning',
      displayName: 'Machine Learning',
      category: 'Computer Science',
    },
    { id: 2, name: 'calculus', displayName: 'Calculus', category: 'Math' },
    { id: 3, name: 'biochemistry', displayName: 'Biochemistry', category: 'Biology' },
  ],
  categories: ['Biology', 'Computer Science', 'Math'],
}

function mockCatalog() {
  server.use(
    http.get('http://localhost:4000/api/hashtags/catalog', () => HttpResponse.json(CATALOG)),
  )
}

describe('TopicPickerModal', () => {
  it('renders nothing while closed', () => {
    render(
      <TopicPickerModal
        open={false}
        onClose={() => {}}
        followedNames={[]}
        onFollow={() => {}}
        onUnfollow={() => {}}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('loads + renders the catalog when opened', async () => {
    mockCatalog()
    render(
      <TopicPickerModal
        open
        onClose={() => {}}
        followedNames={[]}
        onFollow={() => {}}
        onUnfollow={() => {}}
      />,
    )
    expect(await screen.findByText('Machine Learning')).toBeInTheDocument()
    expect(screen.getByText('Calculus')).toBeInTheDocument()
    expect(screen.getByText('Biochemistry')).toBeInTheDocument()
  })

  it('filters by search query (matches displayName and name)', async () => {
    mockCatalog()
    const user = userEvent.setup()
    render(
      <TopicPickerModal
        open
        onClose={() => {}}
        followedNames={[]}
        onFollow={() => {}}
        onUnfollow={() => {}}
      />,
    )
    await screen.findByText('Machine Learning')
    await user.type(screen.getByPlaceholderText('Search topics…'), 'calc')
    await waitFor(() => {
      expect(screen.queryByText('Machine Learning')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Calculus')).toBeInTheDocument()
  })

  it('calls onFollow when an unfollowed topic is clicked', async () => {
    mockCatalog()
    const onFollow = vi.fn().mockResolvedValue()
    const user = userEvent.setup()
    render(
      <TopicPickerModal
        open
        onClose={() => {}}
        followedNames={[]}
        onFollow={onFollow}
        onUnfollow={() => {}}
      />,
    )
    const button = await screen.findByText('Machine Learning')
    await user.click(button)
    expect(onFollow).toHaveBeenCalledWith('machine_learning')
  })

  it('calls onUnfollow when a followed topic is clicked', async () => {
    mockCatalog()
    const onUnfollow = vi.fn().mockResolvedValue()
    const user = userEvent.setup()
    render(
      <TopicPickerModal
        open
        onClose={() => {}}
        followedNames={['calculus']}
        onFollow={() => {}}
        onUnfollow={onUnfollow}
      />,
    )
    const button = await screen.findByText('Calculus')
    await user.click(button)
    expect(onUnfollow).toHaveBeenCalledWith('calculus')
  })

  it('rejects an invalid custom topic without calling onFollow', async () => {
    mockCatalog()
    const onFollow = vi.fn().mockResolvedValue()
    const user = userEvent.setup()
    render(
      <TopicPickerModal
        open
        onClose={() => {}}
        followedNames={[]}
        onFollow={onFollow}
        onUnfollow={() => {}}
      />,
    )
    await screen.findByText('Machine Learning')
    // The placeholder copy is rendered in the modal; we target the
    // custom field via its placeholder so the test survives copy tweaks
    // on the search field above it.
    await user.type(screen.getByPlaceholderText('machine_learning'), 'bad name!!')
    await user.click(screen.getByRole('button', { name: 'Follow' }))
    expect(onFollow).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/letters\/numbers\/underscores/)
  })

  it('calls onClose when Escape is pressed', async () => {
    mockCatalog()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <TopicPickerModal
        open
        onClose={onClose}
        followedNames={[]}
        onFollow={() => {}}
        onUnfollow={() => {}}
      />,
    )
    await screen.findByText('Machine Learning')
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
