import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Button, FormField, MsgList, SectionCard, Select, ToggleRow } from './settingsShared'
import { usePreferences, FONT } from './settingsState'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'
import { showToast } from '../../lib/toast'
import UserAvatar from '../../components/UserAvatar'

function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

/* ── Download My Activity Log ─────────────────────────────────── */
function ActivityLogDownload() {
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    try {
      const res = await fetch(`${API}/api/settings/my-audit-log`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showToast(data.error || 'Could not download activity log.', 'error')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      a.download = match
        ? match[1]
        : `my-activity-log-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      showToast('Activity log downloaded.', 'success')
    } catch {
      showToast('Check your connection and try again.', 'error')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <SectionCard
      title="Activity Log"
      subtitle="Download a copy of your activity on StudyHub. This includes actions like logins, sheet creation, comments, and settings changes. No IP addresses or internal data are included."
    >
      <Button onClick={handleDownload} disabled={downloading} secondary>
        {downloading ? 'Downloading...' : 'Download My Activity Log'}
      </Button>
    </SectionCard>
  )
}

/* ── Private Account toggle sub-component ────────────────────────────── */
function PrivateAccountToggle() {
  const { user, setSessionUser } = useSession()
  const [isPrivate, setIsPrivate] = useState(user?.isPrivate || false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setIsPrivate(user?.isPrivate || false)
  }, [user?.isPrivate])

  async function handleToggle() {
    const newValue = !isPrivate
    setIsPrivate(newValue)
    setSaving(true)
    try {
      const res = await fetch(`${API}/api/users/me/privacy`, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ isPrivate: newValue }),
      })
      const data = await res.json()
      if (res.ok) {
        setSessionUser((u) => (u ? { ...u, isPrivate: newValue } : u))
        showToast(
          newValue ? 'Your account is now private.' : 'Your account is now public.',
          'success',
        )
      } else {
        setIsPrivate(!newValue) // revert
        showToast(data.error || 'Could not update privacy setting.', 'error')
      }
    } catch {
      setIsPrivate(!newValue) // revert
      showToast('Check your connection and try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard
      title="Private Account"
      subtitle="Control who can follow you and see your content."
    >
      <ToggleRow
        label="Private Account"
        description="When your account is private, only people you approve can see your posts, sheets, and activity."
        checked={isPrivate}
        onChange={handleToggle}
        disabled={saving}
      />
      {isPrivate && (
        <div
          style={{
            marginTop: 8,
            padding: '10px 14px',
            borderRadius: 8,
            background: 'var(--sh-info-bg)',
            border: '1px solid var(--sh-info-border)',
            fontSize: 12,
            color: 'var(--sh-info-text)',
            lineHeight: 1.5,
          }}
        >
          New followers will need your approval. Your existing followers will not be affected.
        </div>
      )}
    </SectionCard>
  )
}

/* ── Blocked / Muted user list sub-component ──────────────────────────── */
function UserListSection({ title, subtitle, endpoint, emptyText, actionLabel, actionDoneLabel }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`${API}/api/users/me/${endpoint}`, { headers: authHeaders(), credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }, [endpoint])

  useEffect(() => {
    load()
  }, [load])

  async function handleRemove(user) {
    setBusyId(user.id)
    try {
      const res = await fetch(
        `${API}/api/users/${user.username}/${endpoint === 'blocked' ? 'block' : 'mute'}`,
        {
          method: 'DELETE',
          headers: authHeaders(),
          credentials: 'include',
        },
      )
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== user.id))
        showToast(`${actionDoneLabel} ${user.username}`, 'success')
      } else {
        const data = await res.json().catch(() => ({}))
        showToast(data.error || 'Could not complete action.', 'error')
      }
    } catch {
      showToast('Check your connection and try again.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <SectionCard title={title} subtitle={subtitle}>
      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--sh-muted)', padding: '8px 0' }}>Loading...</div>
      ) : users.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--sh-muted)', padding: '8px 0' }}>{emptyText}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {users.map((user) => (
            <div
              key={user.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: '1px solid var(--sh-soft)',
              }}
            >
              <Link
                to={`/users/${user.username}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
              >
                <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={32} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sh-heading)' }}>
                    {user.username}
                  </div>
                  {user.createdAt && (
                    <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
                      Since {new Date(user.createdAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </Link>
              <button
                onClick={() => handleRemove(user)}
                disabled={busyId === user.id}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: FONT,
                  cursor: busyId === user.id ? 'wait' : 'pointer',
                  border: '1px solid var(--sh-border)',
                  background: 'var(--sh-soft)',
                  color: 'var(--sh-text)',
                }}
              >
                {busyId === user.id ? '...' : actionLabel}
              </button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

export default function PrivacyTab() {
  const { prefs, setPrefs, loading, saving, msg, loadError, toggle, save, retry } = usePreferences()

  if (loading) {
    return (
      <SectionCard title="Privacy">
        <div style={{ color: '#64748b', fontSize: 13 }}>Loading preferences...</div>
      </SectionCard>
    )
  }

  if (!prefs) {
    return (
      <SectionCard
        title="Privacy"
        subtitle="StudyHub could not load your privacy preferences right now."
      >
        <MsgList msg={{ type: 'error', text: loadError || 'Could not load preferences.' }} />
        <Button secondary onClick={retry}>
          Retry
        </Button>
      </SectionCard>
    )
  }

  return (
    <>
      <PrivateAccountToggle />

      <SectionCard
        title="Profile Visibility"
        subtitle="Control who can see your profile page and activity."
      >
        <FormField label="Who can view your profile">
          <Select
            value={prefs.profileVisibility}
            onChange={(e) => setPrefs((c) => ({ ...c, profileVisibility: e.target.value }))}
          >
            <option value="public">Public (anyone)</option>
            <option value="enrolled">Enrolled only (classmates in your courses)</option>
            <option value="private">Private (only you)</option>
          </Select>
        </FormField>
      </SectionCard>

      <SectionCard
        title="Default Permissions"
        subtitle="Defaults for new sheets you upload. You can override per sheet."
      >
        <ToggleRow
          label="Allow downloads"
          description="Let others download your sheets by default"
          checked={prefs.defaultDownloads}
          onChange={() => toggle('defaultDownloads')}
        />
        <ToggleRow
          label="Allow contributions"
          description="Let others propose changes to your sheets by default"
          checked={prefs.defaultContributions}
          onChange={() => toggle('defaultContributions')}
        />
      </SectionCard>

      <MsgList msg={msg} />
      {/* S1: right-aligned single action so the button doesn't read as
          a full-width banner element below the toggle list. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
        <Button
          disabled={saving}
          onClick={() =>
            save(
              ['profileVisibility', 'defaultDownloads', 'defaultContributions'],
              'Privacy preferences saved.',
            )
          }
        >
          {saving ? 'Saving...' : 'Save Privacy Preferences'}
        </Button>
      </div>

      <ActivityLogDownload />

      <UserListSection
        title="Blocked Users"
        subtitle="Blocked users cannot see your profile, sheets, or notes. You won't see their content either."
        endpoint="blocked"
        emptyText="You haven't blocked anyone."
        actionLabel="Unblock"
        actionDoneLabel="Unblocked"
      />

      <UserListSection
        title="Muted Users"
        subtitle="Muted users' content is hidden from your feed. They won't know they're muted."
        endpoint="muted"
        emptyText="You haven't muted anyone."
        actionLabel="Unmute"
        actionDoneLabel="Unmuted"
      />
    </>
  )
}
