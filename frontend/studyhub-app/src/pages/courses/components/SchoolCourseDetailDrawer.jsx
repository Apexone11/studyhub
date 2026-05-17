/* ═══════════════════════════════════════════════════════════════════════════
 * SchoolCourseDetailDrawer.jsx — slide-in detail panel for /my-courses.
 *
 * Opens when the user clicks a course chip; shows the school's curated
 * description, stats (founded year, enrollment, location), website link,
 * mascot, plus the clicked course's own code/name/department. Switches
 * content when the user clicks a different course (founder rule:
 * "if the user clicks on a new course after the first course it will
 * show that course information").
 *
 * Portaled to document.body so the position:fixed overlay isn't trapped
 * by an animated ancestor's transform. Focus-trapped + Esc-closable.
 *
 * Props:
 *   open        — boolean
 *   course      — the clicked course { id, code, name, department }
 *   schoolId    — id of the school whose detail to fetch
 *   onClose     — fired on backdrop click, Esc, or close button
 *
 * The school detail is fetched lazily from GET /api/courses/schools/:id
 * with SWR caching so switching courses within the same school doesn't
 * re-fetch. Per founder direction: no sensitive data (no tuition, no
 * rankings, no admissions stats) — only the curated catalog fields.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../../lib/useFocusTrap'
import useFetch from '../../../lib/useFetch'
import { Skeleton } from '../../../components/Skeleton'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

function formatEnrollment(n) {
  if (!Number.isFinite(n) || n <= 0) return null
  if (n >= 10000) return `${Math.round(n / 1000)},000+ students`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K students`
  return `${n} students`
}

function SchoolDescription({ school, loading }) {
  if (loading || !school) {
    return (
      <div style={{ display: 'grid', gap: 8 }} aria-busy="true">
        <Skeleton width="80%" height={14} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="92%" height={14} />
      </div>
    )
  }
  return (
    <p
      style={{
        margin: 0,
        fontSize: 14,
        color: 'var(--sh-text)',
        lineHeight: 1.6,
      }}
    >
      {school.description || 'No description available for this school.'}
    </p>
  )
}

function StatTile({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        background: 'var(--sh-soft)',
        border: '1px solid var(--sh-border)',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: 'var(--sh-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--sh-heading)',
          lineHeight: 1.3,
        }}
      >
        {value}
      </div>
    </div>
  )
}

export default function SchoolCourseDetailDrawer({ open, course, schoolId, onClose }) {
  const panelRef = useFocusTrap({ active: open, onClose })
  const triggerReturnFocusRef = useRef(null)

  // Capture the element that opened the drawer so we can restore focus
  // when it closes — improves keyboard navigation, especially when the
  // drawer is dismissed via Esc.
  useEffect(() => {
    if (open && typeof document !== 'undefined') {
      triggerReturnFocusRef.current = document.activeElement
    }
  }, [open])

  useEffect(() => {
    if (!open && triggerReturnFocusRef.current?.focus) {
      try {
        triggerReturnFocusRef.current.focus()
      } catch {
        /* element may have unmounted */
      }
      triggerReturnFocusRef.current = null
    }
  }, [open])

  const detailPath = schoolId ? `/api/courses/schools/${schoolId}` : null
  const {
    data: school,
    loading,
    error,
  } = useFetch(detailPath, {
    skip: !open || !schoolId,
    swr: 5 * 60 * 1000,
  })

  // Lock body scroll while the drawer is open so the page underneath
  // doesn't jiggle when the user scrolls inside the drawer. Restored
  // on unmount or close.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      onClick={onClose}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--sh-overlay, rgba(15, 23, 42, 0.5))',
        backdropFilter: 'blur(3px)',
        zIndex: 700,
        display: 'flex',
        justifyContent: 'flex-end',
        fontFamily: FONT,
      }}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="school-drawer-title"
        style={{
          width: 'min(440px, 100%)',
          height: '100%',
          background: 'var(--sh-surface)',
          borderTopLeftRadius: 24,
          borderBottomLeftRadius: 24,
          boxShadow: '-12px 0 32px rgba(15, 23, 42, 0.18)',
          overflowY: 'auto',
          padding: '24px 28px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {/* Close button (top-right). 44px hit area per WCAG 2.5.5. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close school details"
          style={{
            position: 'absolute',
            top: 16,
            right: 20,
            width: 44,
            height: 44,
            borderRadius: 12,
            border: 'none',
            background: 'transparent',
            color: 'var(--sh-muted)',
            fontSize: 22,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'inherit',
          }}
        >
          ×
        </button>

        {/* Course header — what the user clicked */}
        {course ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: 'var(--sh-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {course.department || 'Course'}
            </span>
            <h2
              id="school-drawer-title"
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                color: 'var(--sh-heading)',
                lineHeight: 1.2,
              }}
            >
              {course.code}
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: 'var(--sh-subtext)',
                lineHeight: 1.5,
              }}
            >
              {course.name}
            </p>
          </div>
        ) : null}

        <hr style={{ border: 0, borderTop: '1px solid var(--sh-border)', margin: 0 }} />

        {/* School identity card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: 'var(--sh-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Offered at
          </span>
          <h3
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 800,
              color: 'var(--sh-heading)',
            }}
          >
            {loading && !school ? <Skeleton width="60%" height={20} /> : school?.name || 'School'}
          </h3>
          {school?.city || school?.state ? (
            <div style={{ fontSize: 13, color: 'var(--sh-muted)' }}>
              {school.city}
              {school.city && school.state ? ', ' : ''}
              {school.state}
            </div>
          ) : null}

          <SchoolDescription school={school} loading={loading && !school} />

          {/* Stats grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              marginTop: 4,
            }}
          >
            <StatTile
              label="Type"
              value={
                school?.schoolType
                  ? school.schoolType.charAt(0).toUpperCase() + school.schoolType.slice(1)
                  : null
              }
            />
            <StatTile label="Founded" value={school?.foundedYear || null} />
            <StatTile label="Students" value={formatEnrollment(school?.enrollmentSize)} />
            <StatTile label="Mascot" value={school?.mascot || null} />
          </div>

          {/* Course/member counts on StudyHub */}
          {school && (school.courseCount > 0 || school.memberCount > 0) ? (
            <div
              style={{
                display: 'flex',
                gap: 18,
                fontSize: 12,
                color: 'var(--sh-muted)',
                marginTop: 4,
                fontWeight: 600,
              }}
            >
              {school.courseCount > 0 ? (
                <span>
                  {school.courseCount.toLocaleString()} course
                  {school.courseCount === 1 ? '' : 's'} on StudyHub
                </span>
              ) : null}
              {school.memberCount > 0 ? (
                <span>
                  {school.memberCount.toLocaleString()} member
                  {school.memberCount === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Website link */}
          {school?.websiteUrl ? (
            <a
              href={school.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 8,
                padding: '10px 16px',
                borderRadius: 10,
                background: 'var(--sh-info-bg)',
                border: '1px solid var(--sh-info-border)',
                color: 'var(--sh-brand)',
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
                width: 'fit-content',
              }}
            >
              Visit official website
              <span aria-hidden="true">↗</span>
            </a>
          ) : null}

          {error ? (
            <div
              role="alert"
              style={{
                marginTop: 8,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'var(--sh-danger-bg)',
                border: '1px solid var(--sh-danger-border)',
                color: 'var(--sh-danger-text)',
                fontSize: 12,
              }}
            >
              Could not load school details. Try again in a moment.
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
