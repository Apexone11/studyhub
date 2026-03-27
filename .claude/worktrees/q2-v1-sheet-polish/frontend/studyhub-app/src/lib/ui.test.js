import { describe, expect, it } from 'vitest'
import { resolveAppLayout } from './ui'

describe('resolveAppLayout', () => {
  it('returns drawer mode and single-column layout on phone widths', () => {
    const layout = resolveAppLayout(640)
    expect(layout.sidebarMode).toBe('drawer')
    expect(layout.isPhone).toBe(true)
    expect(layout.columns.appThreeColumn).toBe('minmax(0, 1fr)')
  })

  it('returns drawer mode on tablet widths', () => {
    const layout = resolveAppLayout(1024)
    expect(layout.sidebarMode).toBe('drawer')
    expect(layout.isTablet).toBe(true)
    expect(layout.columns.appTwoColumn).toBe('minmax(0, 1fr)')
  })

  it('returns fixed mode and desktop columns on wide screens', () => {
    const layout = resolveAppLayout(1440)
    expect(layout.sidebarMode).toBe('fixed')
    expect(layout.isCompact).toBe(false)
    expect(layout.columns.appTwoColumn).toContain('minmax(220px, 250px)')
  })
})
