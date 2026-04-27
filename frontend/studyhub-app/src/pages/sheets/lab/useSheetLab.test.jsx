import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import useSheetLab from './useSheetLab'

const mockClearSession = vi.fn()
const mockUser = { id: 1, role: 'student' }

vi.mock('../../../lib/session-context', () => ({
  useSession: () => ({
    user: mockUser,
    clearSession: mockClearSession,
  }),
}))

vi.mock('../../../lib/toast', () => ({
  showToast: vi.fn(),
}))

vi.mock('../../../lib/animations', () => ({
  staggerEntrance: vi.fn(),
}))

function HookProbe() {
  const lab = useSheetLab()
  return (
    <div>
      <div data-testid="expanded-id">{String(lab.expandedCommitId)}</div>
      <div data-testid="expanded-content">{lab.expandedContent || ''}</div>
      <div data-testid="active-tab">{lab.activeTab}</div>
    </div>
  )
}

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }
}

describe('useSheetLab deep-link behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input)
      if (url.includes('/api/sheets/123/lab/commits?page=1&limit=20')) {
        return jsonResponse({
          commits: [
            { id: 101, message: 'older', createdAt: new Date().toISOString() },
            { id: 202, message: 'target', createdAt: new Date().toISOString() },
          ],
          total: 2,
          page: 1,
          totalPages: 1,
        })
      }
      if (url.endsWith('/api/sheets/123/lab/commits/202')) {
        return jsonResponse({
          commit: { id: 202, content: 'target commit body' },
        })
      }
      if (url.endsWith('/api/sheets/123')) {
        return jsonResponse({
          id: 123,
          userId: 1,
          status: 'published',
          allowEditing: true,
        })
      }
      throw new Error(`Unhandled fetch URL in test: ${url}`)
    })
  })

  it('opens commit from URL query on initial load', async () => {
    render(
      <MemoryRouter initialEntries={['/sheets/123/lab?tab=history&commit=202']}>
        <Routes>
          <Route path="/sheets/:id/lab" element={<HookProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('active-tab').textContent).toBe('history')
    })

    await waitFor(() => {
      expect(screen.getByTestId('expanded-id').textContent).toBe('202')
      expect(screen.getByTestId('expanded-content').textContent).toBe('target commit body')
    })
  })
})
