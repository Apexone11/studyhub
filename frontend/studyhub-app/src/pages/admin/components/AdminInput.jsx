import './admin-primitives.css'

export default function AdminInput({ label, textarea, className = '', ...props }) {
  const inputCls = textarea ? 'admin-field__input admin-field__textarea' : 'admin-field__input'
  const El = textarea ? 'textarea' : 'input'
  return (
    <label className={`admin-field ${className}`}>
      {label && <span className="admin-field__label">{label}</span>}
      <El className={inputCls} {...props} />
    </label>
  )
}
