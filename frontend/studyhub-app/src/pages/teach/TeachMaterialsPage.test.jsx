/**
 * TeachMaterialsPage.test.jsx — Week 3 §9 integration coverage for the
 * selection + BulkAssignBar wiring on the Library tab.
 *
 * We mock the heavy chrome (Navbar, AppSidebar, animations, tutorials) and
 * the design-v2 flag hook so the page renders the Week 3 affordance without
 * hitting the real /api/flags endpoint. The MSW server provides the
 * /api/sheets payload that feeds the library.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import TeachMaterialsPage from './TeachMaterialsPage'
import { server } from '../../test/server'

const API_BASE = 'http://localhost:4000'

/* ── Mock the heavy chrome + hooks the page depends on ──────────────────── */
vi.mock('../../components/navbar/Navbar', () => ({
  default: () => <div data-testid="navbar" />,
}))
vi.mock('../../components/sidebar/AppSidebar', () => ({
  default: () => <div data-testid="app-sidebar" />,
}))
vi.mock('../../components/Icons', () => ({
  IconSheets: () => <span>sheet</span>,
  IconUpload: () => <span>upload</span>,
  IconPlus: () => <span>+</span>,
}))
vi.mock('../../lib/ui', () => ({
  pageShell: () => ({}),
  // Must match the real shape returned by lib/ui.js resolveAppLayout():
  // { sidebarMode, columns: { appTwoColumn, appThreeColumn, readingThreeColumn }, ... }.
  // The page references layout.columns.appTwoColumn at render time; if the
  // mock omits `columns` the render crashes with a TypeError that masks the
  // rest of the test intent.
  useResponsiveAppLayout: () => ({
    sidebarMode: 'desktop',
    isPhone: false,
    isTablet: false,
    isCompact: false,
    columns: {
      appTwoColumn: 'minmax(0, 1fr) 280px',
      appThreeColumn: '220px minmax(0, 1fr) 280px',
      readingThreeColumn: '220px minmax(0, 1fr) 280px',
    },
  }),
}))
vi.mock('../../lib/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}))
vi.mock('../../lib/session-context', () => ({
  useSession: () => ({
    user: {
      id: 77,
      username: 'teacher_betty',
      accountType: 'teacher',
      role: 'student',
    },
  }),
}))
// Force the Week 3 flag ON so the Library tab renders the BulkAssignBar.
vi.mock('../../lib/designV2Flags', () => ({
  useDesignV2Flags: () => ({
    teachSections: true,
    teachMaterials: true,
    loading: false,
  }),
}))
// Stub the SectionPicker so this test focuses on page-level selection wiring
// (the picker has its own dedicated unit tests).
vi.mock('./SectionPicker', () => ({
  default: ({ open, sheets }) =>
    open ? (
      <div role="dialog" aria-label="Section picker stub">
        Picker open with {sheets.length} items
      </div>
    ) : null,
}))

function renderPage(initialPath = '/teach/materials') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <TeachMaterialsPage />
    </MemoryRouter>,
  )
}

describe('TeachMaterialsPage — Week 3 bulk-assign wiring', () => {
  it('renders the BulkAssignBar on the Library tab when rows exist', async () => {
    server.use(
      http.get(`${API_BASE}/api/sheets`, () =>
        HttpResponse.json({
          sheets: [
            {
              id: 42,
              title: 'Chapter 1 overview',
              status: 'published',
              updatedAt: '2026-04-18T10:00:00.000Z',
            },
          ],
          total: 1,
        }),
      ),
    )

    renderPage()

    // Wait for the sheet row to appear.
    await waitFor(() => expect(screen.getByText('Chapter 1 overview')).toBeInTheDocument())

    // BulkAssignBar rendered with the "select" prompt + disabled CTA.
    expect(screen.getByText(/Select items to assign to a section/i)).toBeInTheDocument()
    const assignBtn = screen.getByRole('button', { name: /assign to sections/i })
    expect(assignBtn).toBeDisabled()
  })

  it('ticking a row flips the selection count + enables the CTA', async () => {
    server.use(
      http.get(`${API_BASE}/api/sheets`, () =>
        HttpResponse.json({
          sheets: [
            {
              id: 42,
              title: 'Chapter 1 overview',
              status: 'published',
            },
          ],
          total: 1,
        }),
      ),
    )

    renderPage()

    const checkbox = await screen.findByRole('checkbox', {
      name: /Select Chapter 1/i,
    })
    fireEvent.click(checkbox)

    expect(screen.getByText(/1 of 1 selected/i)).toBeInTheDocument()
    const assignBtn = screen.getByRole('button', { name: /assign to sections/i })
    expect(assignBtn).toBeEnabled()
  })

  it('clicking Assign opens the (stubbed) SectionPicker with the selected sheets', async () => {
    server.use(
      http.get(`${API_BASE}/api/sheets`, () =>
        HttpResponse.json({
          sheets: [
            { id: 42, title: 'Chapter 1 overview', status: 'published' },
            { id: 43, title: 'Chapter 2 overview', status: 'published' },
          ],
          total: 2,
        }),
      ),
    )

    renderPage()

    const rowOne = await screen.findByRole('checkbox', {
      name: /Select Chapter 1/i,
    })
    const rowTwo = await screen.findByRole('checkbox', {
      name: /Select Chapter 2/i,
    })
    fireEvent.click(rowOne)
    fireEvent.click(rowTwo)

    const assignBtn = screen.getByRole('button', { name: /assign to sections/i })
    fireEvent.click(assignBtn)

    const dialog = await screen.findByRole('dialog', {
      name: /section picker stub/i,
    })
    expect(within(dialog).getByText(/Picker open with 2 items/i)).toBeInTheDocument()
  })

  it('hides the BulkAssignBar on the Drafts tab', async () => {
    server.use(
      http.get(`${API_BASE}/api/sheets`, ({ request }) => {
        const url = new URL(request.url)
        const status = url.searchParams.get('status')
        if (status === 'draft') {
          return HttpResponse.json({
            sheets: [{ id: 99, title: 'WIP draft', status: 'draft' }],
            total: 1,
          })
        }
        return HttpResponse.json({ sheets: [], total: 0 })
      }),
    )

    renderPage('/teach/materials?tab=drafts')

    await waitFor(() => expect(screen.getByText('WIP draft')).toBeInTheDocument())

    // No BulkAssignBar on the Drafts tab — the CTA is absent.
    expect(screen.queryByRole('button', { name: /assign to sections/i })).not.toBeInTheDocument()
  })
})
