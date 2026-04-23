import './admin-primitives.css'

export default function AdminSelect({ label, options, className = '', ...props }) {
  return (
    <label className={`admin-field ${className}`}>
      {label && <span className="admin-field__label">{label}</span>}
      <select className="admin-field__select" {...props}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}
