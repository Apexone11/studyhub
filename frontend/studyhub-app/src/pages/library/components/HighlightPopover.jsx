import '../BookReaderPage.css'

const HIGHLIGHT_COLORS = [
  { id: 'yellow', color: '#ffff00', label: 'Yellow' },
  { id: 'green', color: '#00ff00', label: 'Green' },
  { id: 'blue', color: '#0066ff', label: 'Blue' },
  { id: 'pink', color: '#ff1493', label: 'Pink' },
  { id: 'orange', color: '#ff9900', label: 'Orange' },
]

export default function HighlightPopover({ position, onHighlight, onClose }) {
  if (!position) return null

  const { top, left } = position

  return (
    <div
      className="highlight-popover"
      style={{
        top: `${top}px`,
        left: `${left}px`,
      }}
    >
      <div className="highlight-popover__pointer" />
      <div className="highlight-popover__colors">
        {HIGHLIGHT_COLORS.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              onHighlight(item.color)
              onClose()
            }}
            className="highlight-popover__color-btn"
            style={{ backgroundColor: item.color }}
            title={item.label}
            aria-label={`Highlight in ${item.label}`}
          />
        ))}
      </div>
    </div>
  )
}
