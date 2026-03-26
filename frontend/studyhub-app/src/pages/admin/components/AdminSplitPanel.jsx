import './admin-primitives.css'

export default function AdminSplitPanel({ left, right }) {
  return (
    <div className="admin-split">
      <div className="admin-split__left">{left}</div>
      <div className="admin-split__right">{right}</div>
    </div>
  )
}
