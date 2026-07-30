/**
 * sheetReaderPrefs.js — reader display preferences for sheet content.
 *
 * Viewer-side only: the author picks the typeface (StudySheet.fontFamily),
 * the reader picks size, measure, and leading. These live in localStorage
 * rather than the database because they describe the person reading, not
 * the sheet — so they carry across every sheet the user opens.
 *
 * Non-component exports live here (and the component in
 * SheetReaderControls.jsx) to satisfy react-refresh/only-export-components.
 */

const STORAGE_KEY = 'studyhub.sheets.readerPrefs'

export const READER_SIZES = {
  s: { label: 'S', fontSize: '0.94rem' },
  m: { label: 'M', fontSize: '1rem' },
  l: { label: 'L', fontSize: '1.12rem' },
}

export const READER_WIDTHS = {
  narrow: { label: 'Narrow', maxWidth: '58ch' },
  normal: { label: 'Normal', maxWidth: '76ch' },
  wide: { label: 'Wide', maxWidth: '100%' },
}

export const READER_LEADING = {
  normal: { label: 'Normal', lineHeight: '1.6' },
  relaxed: { label: 'Relaxed', lineHeight: '1.85' },
}

export const DEFAULT_READER_PREFS = { size: 'm', width: 'normal', leading: 'normal' }

/** Author's fontFamily enum → the reader wrapper's modifier class. */
export const SHEET_FONT_CLASS = { sans: 'sans', serif: 'serif', mono: 'mono' }

/** Coerce anything unrecognized back to the defaults. */
export function normalizeReaderPrefs(raw) {
  const next = { ...DEFAULT_READER_PREFS }
  if (raw && typeof raw === 'object') {
    if (READER_SIZES[raw.size]) next.size = raw.size
    if (READER_WIDTHS[raw.width]) next.width = raw.width
    if (READER_LEADING[raw.leading]) next.leading = raw.leading
  }
  return next
}

export function readReaderPrefs() {
  // Safari private mode throws on localStorage access.
  try {
    return normalizeReaderPrefs(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'))
  } catch {
    return { ...DEFAULT_READER_PREFS }
  }
}

export function writeReaderPrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Quota / private mode — the session still honors the in-memory value.
  }
}

/** CSS custom properties for a given preference set. */
export function readerPrefsToStyle(prefs) {
  const safe = normalizeReaderPrefs(prefs)
  return {
    '--sheet-reader-size': READER_SIZES[safe.size].fontSize,
    '--sheet-reader-width': READER_WIDTHS[safe.width].maxWidth,
    '--sheet-reader-lh': READER_LEADING[safe.leading].lineHeight,
  }
}

/** Wrapper class combining the reader surface and the author's typeface. */
export function readerClassNameFor(fontFamily) {
  return `sh-sheet-reader sh-sheet-reader--${SHEET_FONT_CLASS[fontFamily] || 'sans'}`
}
