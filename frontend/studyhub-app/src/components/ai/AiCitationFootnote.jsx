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
      <span id={describedBy} style={{ display: 'none' }}>
        {citation?.sourceTitle ? `Source: ${citation.sourceTitle}` : 'View source'}
        {citation?.page ? `, page ${citation.page}` : ''}
      </span>
    </>
  )
}
