import { useEffect, useRef, useState } from 'react'
import { API } from '../../config'
import { Pager } from './AdminWidgets'
import { FONT, tableHeadStyle, tableCell, tableCellStrong, pillButton } from './adminConstants'

function UserActionMenuItem({ color, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '8px 12px',
        borderRadius: 6,
        border: 'none',
        background: 'transparent',
        color,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: FONT,
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'var(--sh-soft)'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}

export default function UsersTab({
  usersState,
  currentUserId,
  patchRole,
  deleteUser,
  loadPagedData,
}) {
  // Manual badge-grant modal state. Lazy-loads the badge catalog the
  // first time an admin opens the picker so the initial users-tab
  // render isn't slowed by a 54-row catalog fetch nobody asked for.
  const [grantTarget, setGrantTarget] = useState(null)
  const [badgeCatalog, setBadgeCatalog] = useState(null)
  const [grantSlug, setGrantSlug] = useState('')
  const [grantBusy, setGrantBusy] = useState(false)
  const [grantError, setGrantError] = useState('')
  // Compact actions dropdown — only one menu open at a time. Holds the
  // user id whose menu is open, or null when none. Collapsing the three
  // stacked action pills into a "•••" menu keeps each table row a
  // single line tall so the table doesn't waste 3× vertical space on
  // controls the admin only needs occasionally.
  const [actionsMenuFor, setActionsMenuFor] = useState(null)
  const actionsMenuRef = useRef(null)

  useEffect(() => {
    if (actionsMenuFor === null) return
    function handleDocMouseDown(event) {
      if (!actionsMenuRef.current) return
      if (!actionsMenuRef.current.contains(event.target)) {
        setActionsMenuFor(null)
      }
    }
    function handleEscape(event) {
      if (event.key === 'Escape') setActionsMenuFor(null)
    }
    document.addEventListener('mousedown', handleDocMouseDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleDocMouseDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [actionsMenuFor])

  useEffect(() => {
    if (!grantTarget || badgeCatalog) return
    let cancelled = false
    fetch(`${API}/api/admin/badges`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.badges) setBadgeCatalog(data.badges)
      })
      .catch(() => {
        /* silent — admin sees an empty picker */
      })
    return () => {
      cancelled = true
    }
  }, [grantTarget, badgeCatalog])

  async function handleTrustLevelChange(userId, trustLevel) {
    try {
      await fetch(`${API}/api/admin/users/${userId}/trust-level`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ trustLevel }),
      })
      void loadPagedData('users', usersState.page)
    } catch {
      /* silent */
    }
  }

  async function handleMfaToggle(userId, nextValue) {
    try {
      const r = await fetch(`${API}/api/admin/users/${userId}/mfa`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mfaRequired: nextValue }),
      })
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        // Admin will already see a non-checked checkbox so reload the
        // page anyway to reset the visual state from the server.
        if (data?.error) window.alert(data.error)
      }
      void loadPagedData('users', usersState.page)
    } catch {
      /* silent */
    }
  }

  async function handleGrantBadge(event) {
    event.preventDefault()
    if (!grantSlug || !grantTarget) return
    setGrantBusy(true)
    setGrantError('')
    try {
      const r = await fetch(`${API}/api/admin/users/${grantTarget.id}/badges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slug: grantSlug }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        setGrantError(data?.error || 'Could not grant badge.')
        return
      }
      setGrantTarget(null)
      setGrantSlug('')
    } catch {
      setGrantError('Network error.')
    } finally {
      setGrantBusy(false)
    }
  }

  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--sh-muted)', marginBottom: 14 }}>
        {usersState.total} total users
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--sh-soft)' }}>
              {[
                'Username',
                'Email',
                'Role',
                'Trust',
                '2FA',
                'MFA Required',
                'Recovery Codes',
                'Sheets',
                'Joined',
                'Verified',
                'Actions',
              ].map((header) => (
                <th key={header} style={tableHeadStyle}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usersState.items.length === 0 && (
              <tr>
                <td colSpan={11} className="admin-empty">
                  No users found.
                </td>
              </tr>
            )}
            {usersState.items.map((record) => (
              <tr key={record.id} style={{ borderBottom: '1px solid var(--sh-border)' }}>
                <td style={tableCellStrong}>{record.username}</td>
                <td style={tableCell}>{record.email || '—'}</td>
                <td style={tableCell}>{record.role}</td>
                <td style={tableCell}>
                  <select
                    value={record.trustLevel || 'new'}
                    onChange={(e) => void handleTrustLevelChange(record.id, e.target.value)}
                    style={{
                      fontSize: 12,
                      padding: '2px 4px',
                      borderRadius: 4,
                      border: '1px solid var(--sh-border)',
                    }}
                  >
                    <option value="new">New</option>
                    <option value="trusted">Trusted</option>
                    <option value="restricted">Restricted</option>
                  </select>
                </td>
                <td style={{ ...tableCell, textAlign: 'center' }}>
                  {record.twoFaEnabled ? (
                    <span title="2FA active" style={{ color: 'var(--sh-success)' }}>
                      ✓
                    </span>
                  ) : (
                    <span title="2FA not set up" style={{ color: 'var(--sh-muted)' }}>
                      —
                    </span>
                  )}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(record.mfaRequired)}
                    onChange={() => void handleMfaToggle(record.id, !record.mfaRequired)}
                    title={
                      record.mfaRequired
                        ? `MFA required since ${
                            record.mfaEnforcedAt
                              ? new Date(record.mfaEnforcedAt).toLocaleDateString()
                              : 'unknown'
                          }`
                        : 'Force this user to set up 2FA on next login'
                    }
                    style={{
                      cursor: 'pointer',
                      width: 16,
                      height: 16,
                      accentColor: 'var(--sh-brand)',
                    }}
                  />
                </td>
                <td style={tableCell}>
                  {record.twoFaRecoveryGeneratedAt ? (
                    <span title={`Used ${record.twoFaRecoveryUsedCount || 0}`}>
                      {new Date(record.twoFaRecoveryGeneratedAt).toLocaleDateString()}
                      {record.twoFaRecoveryUsedCount ? (
                        <span style={{ color: 'var(--sh-warning)', marginLeft: 4 }}>
                          ({record.twoFaRecoveryUsedCount})
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--sh-muted)' }}>—</span>
                  )}
                </td>
                <td style={tableCell}>{record._count?.studySheets ?? 0}</td>
                <td style={tableCell}>{new Date(record.createdAt).toLocaleDateString()}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(record.isStaffVerified)}
                    onChange={async () => {
                      try {
                        await fetch(`${API}/api/admin/users/${record.id}/staff-verified`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ isStaffVerified: !record.isStaffVerified }),
                        })
                        loadPagedData('users', usersState.page)
                      } catch {
                        /* swallow */
                      }
                    }}
                    style={{
                      cursor: 'pointer',
                      width: 16,
                      height: 16,
                      accentColor: 'var(--sh-brand)',
                    }}
                  />
                </td>
                <td style={{ ...tableCell, position: 'relative', whiteSpace: 'nowrap' }}>
                  {/* Ref wraps BOTH trigger and menu panel so the click-
                      outside handler treats the ⋯ button as inside the
                      menu — otherwise mousedown closes the menu before
                      the trigger's onClick toggles it back open, and
                      the button can't reliably dismiss its own menu. */}
                  <div
                    ref={actionsMenuFor === record.id ? actionsMenuRef : null}
                    style={{ display: 'inline-block', position: 'relative' }}
                  >
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={actionsMenuFor === record.id}
                      aria-label={`Actions for ${record.username}`}
                      onClick={() =>
                        setActionsMenuFor((current) => (current === record.id ? null : record.id))
                      }
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        border: '1px solid var(--sh-border)',
                        background: 'var(--sh-surface)',
                        color: 'var(--sh-muted)',
                        cursor: 'pointer',
                        fontSize: 18,
                        lineHeight: '14px',
                        fontWeight: 700,
                        fontFamily: FONT,
                        padding: 0,
                      }}
                    >
                      ⋯
                    </button>
                    {actionsMenuFor === record.id && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 38,
                          right: 12,
                          minWidth: 160,
                          borderRadius: 10,
                          border: '1px solid var(--sh-border)',
                          background: 'var(--sh-surface)',
                          boxShadow: 'var(--elevation-3, 0 8px 24px rgba(0,0,0,0.12))',
                          padding: 4,
                          zIndex: 5,
                        }}
                      >
                        {record.role === 'student' ? (
                          <UserActionMenuItem
                            color="var(--sh-info-text)"
                            onClick={() => {
                              setActionsMenuFor(null)
                              void patchRole(record.id, 'admin')
                            }}
                          >
                            Make admin
                          </UserActionMenuItem>
                        ) : (
                          <UserActionMenuItem
                            color="var(--sh-danger)"
                            onClick={() => {
                              setActionsMenuFor(null)
                              void patchRole(record.id, 'student')
                            }}
                          >
                            Revoke admin
                          </UserActionMenuItem>
                        )}
                        <UserActionMenuItem
                          color="var(--sh-success-text)"
                          onClick={() => {
                            setActionsMenuFor(null)
                            setGrantTarget(record)
                            setGrantSlug('')
                            setGrantError('')
                          }}
                        >
                          Grant badge
                        </UserActionMenuItem>
                        {record.id !== currentUserId ? (
                          <UserActionMenuItem
                            color="var(--sh-danger)"
                            onClick={() => {
                              setActionsMenuFor(null)
                              void deleteUser(record.id)
                            }}
                          >
                            Delete
                          </UserActionMenuItem>
                        ) : null}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        page={usersState.page}
        total={usersState.total}
        onChange={(page) => void loadPagedData('users', page)}
      />

      {grantTarget && (
        <div
          role="presentation"
          onClick={() => setGrantTarget(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Grant badge"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleGrantBadge}
            style={{
              background: 'var(--sh-surface)',
              border: '1px solid var(--sh-border)',
              borderRadius: 14,
              padding: 22,
              width: 'min(420px, 90vw)',
              color: 'var(--sh-text)',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 17, color: 'var(--sh-heading)' }}>
              Grant badge to {grantTarget.username}
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--sh-muted)' }}>
              Manual grants bypass criteria evaluation. Use for secret badges and admin-grant-only
              awards. Idempotent — granting a badge the user already holds is a no-op.
            </p>
            <select
              value={grantSlug}
              onChange={(e) => setGrantSlug(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 13,
                borderRadius: 8,
                border: '1px solid var(--sh-border)',
                background: 'var(--sh-surface)',
                color: 'var(--sh-text)',
                marginBottom: 12,
              }}
            >
              <option value="">{badgeCatalog ? 'Select a badge…' : 'Loading badges…'}</option>
              {badgeCatalog?.map((badge) => (
                <option key={badge.slug} value={badge.slug}>
                  {badge.name} ({badge.tier}, {badge.xp} XP){badge.isSecret ? ' · secret' : ''}
                </option>
              ))}
            </select>
            {grantError ? (
              <div style={{ color: 'var(--sh-danger)', fontSize: 12, marginBottom: 10 }}>
                {grantError}
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setGrantTarget(null)}
                style={pillButton('var(--sh-soft)', 'var(--sh-text)', 'var(--sh-border)')}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!grantSlug || grantBusy}
                style={pillButton('#f0fdf4', '#15803d', '#bbf7d0')}
              >
                {grantBusy ? 'Granting…' : 'Grant badge'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
