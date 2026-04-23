import { useEffect, useState } from 'react'

export const pageWidths = {
  landing: 1560,
  app: 1600,
  editor: 1700,
  reading: 1450,
}

export const layoutBreakpoints = {
  phoneMax: 767,
  tabletMax: 1179,
}

export const pageColumns = {
  appTwoColumn: 'minmax(220px, 250px) minmax(0, 1fr)',
  appThreeColumn: 'minmax(220px, 250px) minmax(0, 1fr) minmax(260px, 300px)',
  readingThreeColumn: 'minmax(210px, 240px) minmax(0, 1fr) minmax(240px, 280px)',
}

export function shellPadding(top = 24, bottom = 60) {
  return `${top}px clamp(16px, 2.5vw, 40px) ${bottom}px`
}

export function pageShell(widthKey, top = 24, bottom = 60) {
  return {
    width: '100%',
    maxWidth: pageWidths[widthKey],
    margin: '0 auto',
    padding: shellPadding(top, bottom),
    position: 'relative',
    zIndex: 1,
  }
}

export function resolveAppLayout(width) {
  const safeWidth = Number.isFinite(width) ? width : 1440
  const isPhone = safeWidth <= layoutBreakpoints.phoneMax
  const isTablet =
    safeWidth > layoutBreakpoints.phoneMax && safeWidth <= layoutBreakpoints.tabletMax
  const isCompact = isPhone || isTablet

  return {
    width: safeWidth,
    isPhone,
    isTablet,
    isCompact,
    sidebarMode: isCompact ? 'drawer' : 'fixed',
    columns: {
      appTwoColumn: isCompact ? 'minmax(0, 1fr)' : pageColumns.appTwoColumn,
      appThreeColumn: isCompact ? 'minmax(0, 1fr)' : pageColumns.appThreeColumn,
      readingThreeColumn: isCompact ? 'minmax(0, 1fr)' : pageColumns.readingThreeColumn,
    },
  }
}

function readViewportWidth() {
  if (typeof window === 'undefined') return 1440
  return window.innerWidth || 1440
}

export function useResponsiveAppLayout() {
  const [width, setWidth] = useState(readViewportWidth)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const onResize = () => setWidth(window.innerWidth || 1440)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return resolveAppLayout(width)
}
