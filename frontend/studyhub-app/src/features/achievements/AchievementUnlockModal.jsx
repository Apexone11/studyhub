/**
 * AchievementUnlockModal.jsx — celebration modal fired on a fresh unlock.
 *
 * The modal is driven directly by the ?celebrate=:slug query param. There is
 * no derived "active slug" state, which keeps us inside the React rule that
 * setState should not be called inside an effect. When the user dismisses,
 * we strip the param from the URL.
 *
 * localStorage key `studyhub.achievements.celebrated` records every slug
 * that has been celebrated so a refresh / share-link / second URL hit for
 * the same slug becomes a no-op render without firing the modal.
 */

import { useEffect, useState } from 'react'
import FocusTrappedDialog from '../../components/Modal/FocusTrappedDialog'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AchievementHexagon from './AchievementHexagon'
import { TIER_LABEL } from './tierStyles'
import { useAchievementDetail } from './useAchievements'

const STORAGE_KEY = 'studyhub.achievements.celebrated'

function readCelebrated() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch {
    return new Set()
  }
}

function markCelebrated(slug) {
  try {
    const set = readCelebrated()
    set.add(slug)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)))
  } catch {
    /* private mode -- ignore */
  }
}

export default function AchievementUnlockModal() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const slug = searchParams.get('celebrate')

  // localStorage suppression check is computed during render so the very
  // first render with a duplicate slug returns null without ever flashing
  // the modal. The persisted-mark side effect lives in useEffect below.
  const isSuppressed =
    slug !== null && typeof window !== 'undefined' ? readCelebrated().has(slug) : false

  useEffect(() => {
    if (slug && !isSuppressed) {
      markCelebrated(slug)
    }
    if (slug && isSuppressed) {
      const next = new URLSearchParams(searchParams)
      next.delete('celebrate')
      setSearchParams(next, { replace: true })
    }
  }, [slug, isSuppressed, searchParams, setSearchParams])

  if (!slug || isSuppressed) return null

  function dismiss() {
    const next = new URLSearchParams(searchParams)
    next.delete('celebrate')
    setSearchParams(next, { replace: true })
  }

  return (
    <UnlockModalInner
      slug={slug}
      onClose={dismiss}
      onView={() => {
        dismiss()
        navigate('/achievements/' + encodeURIComponent(slug))
      }}
    />
  )
}

function UnlockModalInner({ slug, onClose, onView }) {
  const { data, loading, error } = useAchievementDetail(slug)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 20)
    return () => clearTimeout(t)
  }, [])

  // Defensive auto-dismiss. Two failure modes the modal must not lock
  // the page on:
  //   1. detail resolved with error AND no data → silently dismiss, no
  //      user-visible flash. The "first-star-received" badge URL hopped
  //      via socket should never spawn an error popup if the API hiccups.
  //   2. detail still loading after 6s → dismiss so a stuck request
  //      can't hold a focus-trapped dialog over the page indefinitely.
  // CLAUDE.md A20 — verify or fail-soft. We pick fail-soft here.
  useEffect(() => {
    if (!loading && error && !data) {
      onClose()
      return undefined
    }
    if (loading) {
      const timeout = setTimeout(() => {
        if (!data) onClose()
      }, 6000)
      return () => clearTimeout(timeout)
    }
    return undefined
  }, [loading, error, data, onClose])

  // While the detail is still loading, render NOTHING — no backdrop,
  // no panel, no "Loading..." text. The unlock celebration is a
  // best-effort enhancement; it must never block the underlying page.
  // The original implementation paint an opaque overlay during the
  // loading window, which presented as a white screen on the
  // /sheets/:id/lab page if the detail fetch took longer than the
  // animation duration. The data-ready branch below keeps the original
  // motion design (scale-in panel) intact for the happy path.
  if (loading || !data) return null

  // Escape close + Tab focus-trap provided by FocusTrappedDialog.
  return (
    <FocusTrappedDialog
      open
      onClose={onClose}
      ariaLabelledBy="sh-ach-unlock-title"
      overlayStyle={{
        background: 'var(--sh-modal-overlay)',
        zIndex: 1100,
      }}
      panelStyle={{
        background: 'var(--sh-panel-bg)',
        color: 'var(--sh-text)',
        borderRadius: 22,
        padding: '32px 28px',
        maxWidth: 420,
        width: '100%',
        boxShadow: '0 30px 60px rgba(0,0,0,0.25)',
        textAlign: 'center',
        display: 'block',
        transform: mounted ? 'scale(1)' : 'scale(0.7)',
        opacity: mounted ? 1 : 0,
        transition: 'transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease',
      }}
    >
      <div style={{ display: 'contents' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--sh-brand)',
            marginBottom: 8,
          }}
        >
          Achievement Unlocked
        </div>
        <UnlockModalBody data={data} onView={onView} onClose={onClose} />
      </div>
    </FocusTrappedDialog>
  )
}

function UnlockModalBody({ data, onView, onClose }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <AchievementHexagon
          tier={data.tier}
          iconSlug={data.iconSlug}
          state="recent"
          size={140}
          ariaLabel={data.name + ', ' + (TIER_LABEL[data.tier] || 'Bronze') + ' tier unlocked'}
        />
      </div>
      <h2
        id="sh-ach-unlock-title"
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: 'var(--sh-heading)',
          margin: '0 0 6px',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        {data.name}
      </h2>
      <div style={{ fontSize: 13, color: 'var(--sh-muted)', marginBottom: 14 }}>
        {TIER_LABEL[data.tier] || 'Bronze'} - +{data.xp || 0} XP
      </div>
      <p style={{ fontSize: 14, color: 'var(--sh-text)', margin: '0 0 22px' }}>
        {data.description}
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onView}
          style={{
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 10,
            background: 'var(--sh-brand)',
            color: 'var(--sh-on-dark)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          View achievements
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 10,
            background: 'transparent',
            color: 'var(--sh-text)',
            border: '1px solid var(--sh-panel-border)',
            cursor: 'pointer',
          }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
