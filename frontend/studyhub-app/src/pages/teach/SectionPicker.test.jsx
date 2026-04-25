/**
 * SectionPicker.test.jsx — Week 3 §9 unit coverage for the teacher
 * bulk-assign modal.
 *
 * Uses the shared MSW server (`src/test/server.js`) so fetch is exercised
 * the same way it is in production. Each test registers one-shot handlers
 * via `server.use(...)`.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import SectionPicker from './SectionPicker'
import { server } from '../../test/server'

const API_BASE = 'http://localhost:4000'

describe('SectionPicker', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<SectionPicker open={false} sheets={[]} onClose={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('fetches sections on open and renders each row', async () => {
    server.use(
      http.get(`${API_BASE}/api/sections`, () =>
        HttpResponse.json({
          sections: [
            { id: 1, name: 'Block A', studentCount: 18 },
            { id: 2, name: 'Block B', studentCount: 22 },
          ],
        }),
      ),
    )

    render(
      <SectionPicker
        open
        sheets={[{ id: 10, title: 'Chapter 1 sheet' }]}
        onClose={() => {}}
        onAssigned={() => {}}
      />,
    )

    await waitFor(() => expect(screen.getByText(/Block A/)).toBeInTheDocument())
    expect(screen.getByText(/Block B/)).toBeInTheDocument()
  })

  it('shows inline "create your first section" form when teacher has none', async () => {
    server.use(http.get(`${API_BASE}/api/sections`, () => HttpResponse.json({ sections: [] })))

    render(
      <SectionPicker open sheets={[{ id: 10, title: 'Chapter 1 sheet' }]} onClose={() => {}} />,
    )

    await waitFor(() => expect(screen.getByText(/You have no sections yet/i)).toBeInTheDocument())
  })

  it('disables Assign until at least one section is selected', async () => {
    server.use(
      http.get(`${API_BASE}/api/sections`, () =>
        HttpResponse.json({ sections: [{ id: 1, name: 'Block A' }] }),
      ),
    )

    render(<SectionPicker open sheets={[{ id: 10, title: 'Chapter 1' }]} onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText(/Block A/)).toBeInTheDocument())

    const assignBtn = screen.getByRole('button', { name: /^assign/i })
    expect(assignBtn).toBeDisabled()
  })

  it('runs the two-step create+assign flow and invokes onAssigned', async () => {
    const createdSheetIds = []
    let assignBody = null

    server.use(
      http.get(`${API_BASE}/api/sections`, () =>
        HttpResponse.json({ sections: [{ id: 1, name: 'Block A' }] }),
      ),
      http.post(`${API_BASE}/api/materials`, async ({ request }) => {
        const body = await request.json()
        createdSheetIds.push(body.sheetId)
        // Mirror the sheet id back so callers accumulate distinct IDs.
        return HttpResponse.json({ material: { id: 100 + body.sheetId } })
      }),
      http.post(`${API_BASE}/api/materials/assign`, async ({ request }) => {
        assignBody = await request.json()
        return HttpResponse.json({ created: 2, skipped: [] })
      }),
    )

    const onAssigned = vi.fn()

    render(
      <SectionPicker
        open
        sheets={[
          { id: 10, title: 'Chapter 1' },
          { id: 11, title: 'Chapter 2' },
        ]}
        onClose={() => {}}
        onAssigned={onAssigned}
      />,
    )

    await waitFor(() => expect(screen.getByText(/Block A/)).toBeInTheDocument())
    const sectionLabel = screen.getByText(/Block A/).closest('label')
    const sectionCheckbox = within(sectionLabel).getByRole('checkbox')
    await act(async () => {
      fireEvent.click(sectionCheckbox)
    })

    const assignBtn = screen.getByRole('button', { name: /^assign/i })
    await waitFor(() => expect(assignBtn).not.toBeDisabled())

    await act(async () => {
      fireEvent.click(assignBtn)
    })

    await waitFor(() => expect(onAssigned).toHaveBeenCalledTimes(1))
    expect(onAssigned).toHaveBeenCalledWith(expect.objectContaining({ created: 2 }))

    expect(screen.getByText(/Assigned 2 materials?\./)).toBeInTheDocument()

    expect(createdSheetIds.sort()).toEqual([10, 11])
    expect(assignBody).toBeTruthy()
    expect(assignBody.materialIds.sort()).toEqual([110, 111])
    expect(assignBody.sectionIds).toEqual([1])
  })

  it('surfaces a friendly error when the assign call fails', async () => {
    server.use(
      http.get(`${API_BASE}/api/sections`, () =>
        HttpResponse.json({ sections: [{ id: 1, name: 'Block A' }] }),
      ),
      http.post(`${API_BASE}/api/materials`, () => HttpResponse.json({ material: { id: 100 } })),
      http.post(`${API_BASE}/api/materials/assign`, () =>
        HttpResponse.json({ error: 'VALIDATION', code: 'VALIDATION' }, { status: 400 }),
      ),
    )

    render(<SectionPicker open sheets={[{ id: 10, title: 'Chapter 1' }]} onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText(/Block A/)).toBeInTheDocument())
    const sectionLabel = screen.getByText(/Block A/).closest('label')
    fireEvent.click(within(sectionLabel).getByRole('checkbox'))

    const assignBtn = screen.getByRole('button', { name: /^assign/i })
    await waitFor(() => expect(assignBtn).not.toBeDisabled())

    await act(async () => {
      fireEvent.click(assignBtn)
    })

    await waitFor(() =>
      expect(screen.getByText(/VALIDATION|Could not assign/i)).toBeInTheDocument(),
    )
  })
})
