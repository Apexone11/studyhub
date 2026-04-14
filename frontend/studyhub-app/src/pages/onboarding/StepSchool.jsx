/* ═══════════════════════════════════════════════════════════════════════════
 * StepSchool -- Onboarding step 2: Select your school
 * ═══════════════════════════════════════════════════════════════════════════ */
import { forwardRef, useState, useEffect, useRef } from 'react'
import { API } from '../../config'

const StepSchool = forwardRef(function StepSchool({ onNext, onSkip, submitting }, ref) {
  const [schools, setSchools] = useState([])
  const [loadingSchools, setLoadingSchools] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [showNotListed, setShowNotListed] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function fetchSchools() {
      try {
        const res = await fetch(`${API}/api/courses/schools`, { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) setSchools(data)
        }
      } catch {
        // Non-blocking: will show empty list
      } finally {
        if (!cancelled) setLoadingSchools(false)
      }
    }
    fetchSchools()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered =
    query.trim().length > 0
      ? schools
          .filter(
            (s) =>
              s.name.toLowerCase().includes(query.toLowerCase()) ||
              (s.short && s.short.toLowerCase().includes(query.toLowerCase())),
          )
          .slice(0, 10)
      : schools.slice(0, 10)

  function handleSelect(school) {
    setSelected(school)
    setQuery(school.name)
    setDropdownOpen(false)
  }

  function handleSubmit() {
    if (selected) {
      onNext({ schoolId: selected.id })
    }
  }

  return (
    <div style={styles.wrapper}>
      <h2 ref={ref} tabIndex={-1} style={styles.heading}>
        What school do you attend?
      </h2>

      <div style={styles.searchWrap}>
        <label htmlFor="school-search" className="sr-only">
          Search for your school
        </label>
        <input
          id="school-search"
          ref={inputRef}
          type="text"
          placeholder={loadingSchools ? 'Loading schools...' : 'Search for your school...'}
          value={query}
          disabled={loadingSchools}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected(null)
            setDropdownOpen(true)
          }}
          onFocus={() => setDropdownOpen(true)}
          style={styles.input}
          autoComplete="off"
        />

        {dropdownOpen && !selected && filtered.length > 0 && (
          <ul style={styles.dropdown} role="listbox" aria-label="School results">
            {filtered.map((school) => (
              <li key={school.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => handleSelect(school)}
                  style={styles.dropdownItem}
                >
                  <span style={styles.schoolName}>{school.name}</span>
                  {school.short && <span style={styles.schoolShort}>{school.short}</span>}
                  {school.city && school.state && (
                    <span style={styles.schoolLoc}>
                      {school.city}, {school.state}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div style={styles.selectedCard}>
          <div style={styles.selectedName}>{selected.name}</div>
          {selected.city && selected.state && (
            <div style={styles.selectedLoc}>
              {selected.city}, {selected.state}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setSelected(null)
              setQuery('')
              inputRef.current?.focus()
            }}
            style={styles.changeBtn}
          >
            Change
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowNotListed(!showNotListed)}
        style={styles.notListedLink}
      >
        My school isn&apos;t listed
      </button>

      {showNotListed && (
        <p style={styles.notListedMsg}>
          Our team will add your school shortly. For now, you can skip this step and we will reach
          out once your school is available.
        </p>
      )}

      <div style={styles.actions}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!selected || submitting}
          style={{
            ...styles.primaryBtn,
            opacity: !selected || submitting ? 0.5 : 1,
          }}
        >
          {submitting ? 'Saving...' : 'Next'}
        </button>
        <button type="button" onClick={onSkip} disabled={submitting} style={styles.skipLink}>
          Skip for now
        </button>
      </div>
    </div>
  )
})

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },
  heading: {
    fontSize: 'var(--type-lg)',
    fontWeight: 700,
    color: 'var(--sh-heading)',
    outline: 'none',
    margin: 0,
  },
  searchWrap: {
    position: 'relative',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    fontSize: 'var(--type-base)',
    color: 'var(--sh-input-text)',
    background: 'var(--sh-input-bg)',
    border: '1px solid var(--sh-input-border)',
    borderRadius: 'var(--radius-control)',
    outline: 'none',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 10,
    listStyle: 'none',
    margin: '4px 0 0',
    padding: '4px 0',
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-md)',
    maxHeight: 260,
    overflowY: 'auto',
  },
  dropdownItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    width: '100%',
    padding: '10px 14px',
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-text)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },
  schoolName: {
    fontWeight: 600,
    color: 'var(--sh-heading)',
  },
  schoolShort: {
    fontSize: 'var(--type-xs)',
    color: 'var(--sh-muted)',
  },
  schoolLoc: {
    fontSize: 'var(--type-xs)',
    color: 'var(--sh-subtext)',
  },
  selectedCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: '12px 16px',
    background: 'var(--sh-brand-soft-bg)',
    border: '1px solid var(--sh-brand-border)',
    borderRadius: 'var(--radius)',
  },
  selectedName: {
    fontWeight: 600,
    fontSize: 'var(--type-base)',
    color: 'var(--sh-heading)',
    flex: 1,
  },
  selectedLoc: {
    fontSize: 'var(--type-xs)',
    color: 'var(--sh-subtext)',
  },
  changeBtn: {
    padding: '4px 10px',
    fontSize: 'var(--type-xs)',
    color: 'var(--sh-brand)',
    background: 'none',
    border: '1px solid var(--sh-brand-border)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
  },
  notListedLink: {
    alignSelf: 'flex-start',
    padding: 0,
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-brand)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  notListedMsg: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-subtext)',
    background: 'var(--sh-soft)',
    padding: '10px 14px',
    borderRadius: 'var(--radius-sm)',
    lineHeight: 1.5,
    margin: 0,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginTop: 'var(--space-4)',
  },
  primaryBtn: {
    padding: '10px 32px',
    fontSize: 'var(--type-base)',
    fontWeight: 600,
    color: 'var(--sh-btn-primary-text)',
    background: 'var(--sh-btn-primary-bg)',
    border: 'none',
    borderRadius: 'var(--radius-control)',
    cursor: 'pointer',
    boxShadow: 'var(--sh-btn-primary-shadow)',
    transition: 'opacity 0.15s',
  },
  skipLink: {
    padding: '6px 12px',
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
}

export default StepSchool
