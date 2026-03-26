import './admin-primitives.css'

export default function AdminCard({ title, compact, flush, children, className = '', style }) {
  const cls = [
    'admin-card',
    compact && 'admin-card--compact',
    flush && 'admin-card--flush',
    className,
  ].filter(Boolean).join(' ')
  return (
    <div className={cls} style={style}>
      {title && <h3 className="admin-card__title">{title}</h3>}
      {children}
    </div>
  )
}
