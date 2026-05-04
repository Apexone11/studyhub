/* ═══════════════════════════════════════════════════════════════════════════
 * AiCitationFootnote.jsx — Inline superscript citation marker.
 *
 * Renders <sup>[N]</sup> with aria-describedby pointing at the citation
 * description. Clicking opens the AiCitationSidePanel for that citation.
 * ═══════════════════════════════════════════════════════════════════════════ */
export default function AiCitationFootnote({ index, citation, onOpen }) {
  const describedBy = `citation-desc-${index}`
  return (
    <>
      <button
        type="button"
        onClick={() => onOpen?.(citation, index)}
        aria-describedby={describedBy}
        aria-label={`Citation ${index + 1}: ${citation?.sourceTitle || 'source'}`}
        style={{
          display: 'inline',
          verticalAlign: 'super',
          fontSize: 10,
          padding: '0 3px',
          background: 'transparent',
          border: 'none',
          color: 'var(--sh-pill-text)',
          fontWeight: 700,
          cursor: 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: 2,
        }}
      >
        [{index + 1}]
      </button>
      <span
        id={describedBy}
        // Copilot fix: visually hidden but kept in the accessibility tree
        // so aria-describedby actually announces. `display: none` would
        // remove the element from the AT entirely.
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {citation?.sourceTitle ? `Source: ${citation.sourceTitle}` : 'View source'}
        {citation?.page ? `, page ${citation.page}` : ''}
      </span>
    </>
  )
}
