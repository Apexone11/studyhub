export const pageWidths = {
  landing: 1560,
  app: 1600,
  editor: 1700,
  reading: 1450,
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
  }
}
