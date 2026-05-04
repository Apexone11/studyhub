/**
 * AnnotationToolbar.jsx — Selection-floating mini-toolbar for highlight
 * + comment + visibility quick-set.
 *
 * Founder call (§24.8 #4): mouse/touch-only entry point. Keyboard users
 * have an equivalent path via the Annotations sidecar tab on the paper
 * reader. The selection-positioned toolbar is decorative chrome that
 * appears on user text-selection over the paper viewer.
 *
 * Position is set by the caller via `position={{ top, left }}`. The
 * caller is responsible for un-mounting on selection-clear.
 */

const COLORS = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange']

const COLOR_HEX = {
  yellow: '#facc15',
  green: '#34d399',
  blue: '#60a5fa',
  pink: '#f472b6',
  purple: '#a78bfa',
  orange: '#fb923c',
}

export default function AnnotationToolbar({
  position,
  activeColor = 'yellow',
  onColorChange,
  onSave,
  onClose,
}) {
  if (!position) return null
  return (
    <div
      className="annotation-toolbar"
      style={{ top: position.top, left: position.left }}
      role="toolbar"
      aria-label="Annotation toolbar"
    >
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className="annotation-toolbar__color"
          style={{ background: COLOR_HEX[c] }}
          aria-pressed={activeColor === c}
          aria-label={`Highlight ${c}`}
          onClick={() => onColorChange?.(c)}
        />
      ))}
      <button
        type="button"
        className="scholar-action-btn"
        onClick={onSave}
        aria-label="Save highlight"
      >
        Save
      </button>
      <button
        type="button"
        className="scholar-action-btn"
        onClick={onClose}
        aria-label="Close toolbar"
      >
        Close
      </button>
    </div>
  )
}
