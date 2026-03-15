import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogoMark } from '../components/Icons'
import { API } from '../config'
import { clearStoredSession, hasStoredSession, logoutSession, setStoredUser } from '../lib/session'

const NAV_TABS = [
  { id: 'profile',  label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'account',  label: 'Account' },
]

const DELETION_REASONS = [
  { value: 'better_platform',   label: 'Found a better platform' },
  { value: 'no_longer_student', label: 'No longer a student' },
  { value: 'too_many_emails',   label: 'Too many emails' },
  { value: 'privacy_concerns',  label: 'Privacy concerns' },
  { value: 'other',             label: 'Other' },
]

function SettingsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('profile')
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Form states
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [unForm, setUnForm] = useState({ newUsername: '', password: '' })
  const [emForm, setEmForm] = useState({ email: '', password: '' })

  // 2FA states
  const [twoFaPassword, setTwoFaPassword] = useState('')
  const [twoFaMsg, setTwoFaMsg] = useState(null)
  const [twoFaSaving, setTwoFaSaving] = useState(false)

  // Account deletion states
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteForm, setDeleteForm] = useState({ password: '', reason: '', details: '' })
  const [deleteMsg, setDeleteMsg] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Feedback states
  const [pwMsg,  setPwMsg]   = useState(null)
  const [unMsg,  setUnMsg]   = useState(null)
  const [emMsg,  setEmMsg]   = useState(null)
  const [saving, setSaving]  = useState(false)

  useEffect(() => {
    if (!hasStoredSession()) { navigate('/login'); return }
    fetch(`${API}/api/settings/me`)
      .then(r => r.json())
      .then(data => { setUser(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [navigate])

  async function handlePatch(endpoint, body, setMsg, onSuccess) {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(`${API}/api/settings/${endpoint}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setMsg({ type: 'error', text: data.error }); return }
      setMsg({ type: 'success', text: data.message })
      if (onSuccess) onSuccess(data)
    } catch {
      setMsg({ type: 'error', text: 'Could not connect to server.' })
    } finally {
      setSaving(false)
    }
  }

  function handlePasswordSubmit(e) {
    e.preventDefault()
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' }); return
    }
    handlePatch('password', { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }, setPwMsg, () => {
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    })
  }

  function handleUsernameSubmit(e) {
    e.preventDefault()
    handlePatch('username', unForm, setUnMsg, (data) => {
      setStoredUser(data.user)
      setUser(u => ({ ...u, username: data.user.username }))
      setUnForm({ newUsername: '', password: '' })
    })
  }

  function handleEmailSubmit(e) {
    e.preventDefault()
    handlePatch('email', emForm, setEmMsg, (data) => {
      if (data.user) setStoredUser(data.user)
      setUser(u => ({ ...u, email: data.user?.email || emForm.email, emailVerified: data.user?.emailVerified ?? false }))
      setEmForm({ email: '', password: '' })
    })
  }

  async function handleTwoFaToggle(enable) {
    setTwoFaSaving(true)
    setTwoFaMsg(null)
    try {
      const endpoint = enable ? '2fa/enable' : '2fa/disable'
      const res = await fetch(`${API}/api/settings/${endpoint}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: twoFaPassword }),
      })
      const data = await res.json()
      if (!res.ok) { setTwoFaMsg({ type: 'error', text: data.error }); return }
      setUser(u => ({ ...u, twoFaEnabled: data.twoFaEnabled }))
      setTwoFaPassword('')
      setTwoFaMsg({ type: 'success', text: data.message })
    } catch {
      setTwoFaMsg({ type: 'error', text: 'Could not connect to server.' })
    } finally {
      setTwoFaSaving(false)
    }
  }

  async function handleDeleteAccount(e) {
    e.preventDefault()
    if (!deleteForm.reason) { setDeleteMsg({ type: 'error', text: 'Please select a reason.' }); return }
    if (!deleteForm.password) { setDeleteMsg({ type: 'error', text: 'Password is required.' }); return }
    setDeleting(true)
    setDeleteMsg(null)
    try {
      const res = await fetch(`${API}/api/settings/account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deleteForm),
      })
      const data = await res.json()
      if (!res.ok) { setDeleteMsg({ type: 'error', text: data.error }); return }
      clearStoredSession()
      navigate('/')
    } catch {
      setDeleteMsg({ type: 'error', text: 'Could not connect to server.' })
    } finally {
      setDeleting(false)
    }
  }

  async function handleSignOut() {
    await logoutSession()
    navigate('/login')
  }

  if (loading) return <div style={styles.loading}>Loading…</div>

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <Link to="/feed" style={styles.logoLink}>
            <LogoMark size={28} />
            <span style={styles.logoText}>StudyHub</span>
          </Link>
          <h1 style={styles.headerTitle}>Settings</h1>
          <button onClick={handleSignOut} style={styles.signOutBtn}>Sign Out</button>
        </div>
      </header>

      <div style={styles.body}>
        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <nav>
            {NAV_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{ ...styles.navBtn, ...(tab === t.id ? styles.navBtnActive : {}) }}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Panel */}
        <main style={styles.panel}>

          {/* ── PROFILE TAB ─────────────────────────── */}
          {tab === 'profile' && (
            <section>
              <h2 style={styles.sectionTitle}>Profile</h2>
              <div style={styles.profileCard}>
                <div style={styles.avatarCircle}>
                  {user?.username?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <div style={styles.profileName}>{user?.username}</div>
                  <div style={styles.profileBadge}>
                    {user?.role === 'admin'
                      ? <><i className="fas fa-crown" style={{ color: '#f59e0b', marginRight: 5 }} />Admin</>
                      : <><i className="fas fa-graduation-cap" style={{ color: '#3b82f6', marginRight: 5 }} />Student</>
                    }
                  </div>
                </div>
              </div>
              <div style={styles.infoGrid}>
                <InfoRow label="Username"     value={user?.username} />
                <InfoRow label="Email"        value={user?.email || 'Not set'} />
                <InfoRow label="Role"         value={user?.role} />
                <InfoRow label="Study Sheets" value={user?._count?.studySheets ?? 0} />
                <InfoRow label="Courses"      value={user?._count?.enrollments ?? 0} />
                <InfoRow label="Joined"       value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'} />
              </div>
            </section>
          )}

          {/* ── SECURITY TAB ────────────────────────── */}
          {tab === 'security' && (
            <section>
              <h2 style={styles.sectionTitle}>Security</h2>

              {/* Change Password */}
              <div style={styles.formCard}>
                <h3 style={styles.formCardTitle}>Change Password</h3>
                <form onSubmit={handlePasswordSubmit}>
                  <FormField label="Current Password" type="password" value={pwForm.currentPassword}
                    onChange={v => setPwForm(f => ({ ...f, currentPassword: v }))} />
                  <FormField label="New Password" type="password" value={pwForm.newPassword}
                    onChange={v => setPwForm(f => ({ ...f, newPassword: v }))} />
                  <FormField label="Confirm New Password" type="password" value={pwForm.confirmPassword}
                    onChange={v => setPwForm(f => ({ ...f, confirmPassword: v }))} />
                  {pwMsg && <Msg msg={pwMsg} />}
                  <button type="submit" disabled={saving} style={styles.submitBtn}>
                    {saving ? 'Saving…' : 'Update Password'}
                  </button>
                </form>
              </div>

              {/* Change Username */}
              <div style={styles.formCard}>
                <h3 style={styles.formCardTitle}>Change Username</h3>
                <p style={styles.formCardNote}>Current username: <strong>{user?.username}</strong></p>
                <form onSubmit={handleUsernameSubmit}>
                  <FormField label="New Username" type="text" value={unForm.newUsername}
                    onChange={v => setUnForm(f => ({ ...f, newUsername: v }))} placeholder="3-20 characters, letters/numbers/underscore" />
                  <FormField label="Confirm with Password" type="password" value={unForm.password}
                    onChange={v => setUnForm(f => ({ ...f, password: v }))} />
                  {unMsg && <Msg msg={unMsg} />}
                  <button type="submit" disabled={saving} style={styles.submitBtn}>
                    {saving ? 'Saving…' : 'Update Username'}
                  </button>
                </form>
              </div>

              {/* 2-Step Verification */}
              <div style={styles.formCard}>
                <h3 style={styles.formCardTitle}>
                  <i className="fas fa-shield-halved" style={{ color: '#2563eb', marginRight: 8 }} />
                  2-Step Verification
                </h3>
                {!user?.email ? (
                  <div style={{ ...styles.infoBanner }}>
                    <i className="fas fa-circle-info" style={{ marginRight: 8, color: '#2563eb' }} />
                    Add an email address first to enable 2-step verification.
                  </div>
                ) : user?.twoFaEnabled ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                      <span style={{ background: '#dcfce7', color: '#16a34a', padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 'bold' }}>
                        <i className="fas fa-check" style={{ marginRight: 6 }} />Enabled
                      </span>
                      <span style={{ fontSize: 13, color: '#6b7280' }}>A sign-in code will be sent to {user.email} on each login.</span>
                    </div>
                    <FormField label="Confirm with Password" type="password" value={twoFaPassword}
                      onChange={v => setTwoFaPassword(v)} />
                    {twoFaMsg && <Msg msg={twoFaMsg} />}
                    <button onClick={() => handleTwoFaToggle(false)} disabled={twoFaSaving || !twoFaPassword}
                      style={{ ...styles.submitBtn, background: '#6b7280' }}>
                      {twoFaSaving ? 'Disabling…' : 'Disable 2-Step Verification'}
                    </button>
                  </div>
                ) : (
                  <div>
                    <p style={styles.formCardNote}>Sign-in codes will be sent to <strong>{user.email}</strong> each time you log in.</p>
                    <FormField label="Confirm with Password" type="password" value={twoFaPassword}
                      onChange={v => setTwoFaPassword(v)} />
                    {twoFaMsg && <Msg msg={twoFaMsg} />}
                    <button onClick={() => handleTwoFaToggle(true)} disabled={twoFaSaving || !twoFaPassword}
                      style={styles.submitBtn}>
                      {twoFaSaving ? 'Enabling…' : 'Enable 2-Step Verification'}
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── ACCOUNT TAB ─────────────────────────── */}
          {tab === 'account' && (
            <section>
              <h2 style={styles.sectionTitle}>Account</h2>

              {/* Change Email */}
              <div style={styles.formCard}>
                <h3 style={styles.formCardTitle}>Email Address</h3>
                <p style={styles.formCardNote}>
                  {user?.email ? <>Current: <strong>{user.email}</strong></> : 'No email set. Add one to enable password reset and 2FA.'}
                </p>
                <form onSubmit={handleEmailSubmit}>
                  <FormField label="New Email" type="email" value={emForm.email}
                    onChange={v => setEmForm(f => ({ ...f, email: v }))} placeholder="you@example.com" />
                  <FormField label="Confirm with Password" type="password" value={emForm.password}
                    onChange={v => setEmForm(f => ({ ...f, password: v }))} />
                  {emMsg && <Msg msg={emMsg} />}
                  <button type="submit" disabled={saving} style={styles.submitBtn}>
                    {saving ? 'Saving…' : 'Update Email'}
                  </button>
                </form>
              </div>

              {/* Danger Zone */}
              <div style={styles.dangerCard}>
                <h3 style={styles.dangerTitle}>
                  <i className="fas fa-triangle-exclamation" style={{ marginRight: 8 }} />
                  Danger Zone
                </h3>
                {!deleteOpen ? (
                  <div>
                    <p style={{ ...styles.formCardNote, marginBottom: 16 }}>
                      Deleting your account is permanent. All your sheets, notes, and comments will be removed.
                    </p>
                    <button onClick={() => setDeleteOpen(true)}
                      style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 18px', fontSize: 14, cursor: 'pointer', fontFamily: 'Arial, sans-serif', fontWeight: '600' }}>
                      Delete My Account
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleDeleteAccount}>
                    <p style={{ fontSize: 14, color: '#374151', marginBottom: 16 }}>
                      We are sorry to see you go. Please tell us why you are leaving:
                    </p>
                    <div style={styles.fieldGroup}>
                      <label style={styles.fieldLabel}>Reason for leaving</label>
                      <select
                        value={deleteForm.reason}
                        onChange={e => setDeleteForm(f => ({ ...f, reason: e.target.value }))}
                        style={{ ...styles.input }}
                      >
                        <option value="">Select a reason…</option>
                        {DELETION_REASONS.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                    <div style={styles.fieldGroup}>
                      <label style={styles.fieldLabel}>Additional details (optional)</label>
                      <textarea
                        value={deleteForm.details}
                        onChange={e => setDeleteForm(f => ({ ...f, details: e.target.value.slice(0, 300) }))}
                        placeholder="Tell us more (optional, max 300 chars)…"
                        rows={3}
                        style={{ ...styles.input, resize: 'vertical', minHeight: 70 }}
                      />
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, textAlign: 'right' }}>{deleteForm.details.length}/300</div>
                    </div>
                    <FormField label="Confirm with your password" type="password" value={deleteForm.password}
                      onChange={v => setDeleteForm(f => ({ ...f, password: v }))} />
                    {deleteMsg && <Msg msg={deleteMsg} />}
                    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                      <button type="submit" disabled={deleting}
                        style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Arial, sans-serif' }}>
                        {deleting ? 'Deleting…' : 'Permanently Delete My Account'}
                      </button>
                      <button type="button" onClick={() => { setDeleteOpen(false); setDeleteMsg(null); setDeleteForm({ password: '', reason: '', details: '' }) }}
                        style={{ background: 'transparent', border: '1px solid #d1d5db', color: '#6b7280', borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer', fontFamily: 'Arial, sans-serif' }}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </section>
          )}

        </main>
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoLabel}>{label}</span>
      <span style={styles.infoValue}>{value}</span>
    </div>
  )
}

function FormField({ label, type, value, onChange, placeholder }) {
  return (
    <div style={styles.fieldGroup}>
      <label style={styles.fieldLabel}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || ''}
        style={styles.input}
        onFocus={e => (e.target.style.borderColor = '#2563eb')}
        onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
      />
    </div>
  )
}

function Msg({ msg }) {
  const isError = msg.type === 'error'
  return (
    <div style={{ ...styles.msg, background: isError ? '#fef2f2' : '#f0fdf4', border: `1px solid ${isError ? '#fecaca' : '#bbf7d0'}`, color: isError ? '#dc2626' : '#16a34a' }}>
      {msg.text}
    </div>
  )
}

const HEADER_H = 'clamp(60px, 5vw, 64px)'

const styles = {
  page: { minHeight: '100vh', background: '#f0f4f8', fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column' },
  loading: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontFamily: 'Arial, sans-serif' },
  header: { position: 'fixed', top: 0, left: 0, right: 0, height: HEADER_H, background: '#0f172a', zIndex: 100, boxShadow: '0 1px 0 rgba(255,255,255,0.06)' },
  headerInner: { maxWidth: 1200, margin: '0 auto', height: '100%', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16 },
  logoLink: { display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' },
  logoText: { color: '#f8fafc', fontWeight: 'bold', fontSize: 18 },
  headerTitle: { flex: 1, color: '#94a3b8', fontSize: 16, margin: 0 },
  signOutBtn: { background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer' },
  body: { display: 'flex', maxWidth: 1000, margin: '0 auto', width: '100%', padding: `calc(${HEADER_H} + 32px) 24px 60px`, gap: 28, boxSizing: 'border-box' },
  sidebar: { width: 200, flexShrink: 0 },
  navBtn: { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '10px 14px', fontSize: 14, color: '#6b7280', cursor: 'pointer', borderRadius: 8, marginBottom: 4, fontFamily: 'Arial, sans-serif' },
  navBtnActive: { background: '#fff', color: '#1e3a5f', fontWeight: 'bold', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  panel: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', color: '#1e3a5f', margin: '0 0 24px' },
  profileCard: { display: 'flex', alignItems: 'center', gap: 20, background: '#fff', borderRadius: 14, padding: '24px 28px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', marginBottom: 20 },
  avatarCircle: { width: 56, height: 56, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 'bold', flexShrink: 0 },
  profileName: { fontSize: 20, fontWeight: 'bold', color: '#1e3a5f', marginBottom: 4 },
  profileBadge: { fontSize: 13, color: '#6b7280' },
  infoGrid: { background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' },
  infoRow: { display: 'flex', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid #f3f4f6' },
  infoLabel: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  infoValue: { fontSize: 14, color: '#1e3a5f', fontWeight: '500' },
  formCard: { background: '#fff', borderRadius: 14, padding: '24px 28px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', marginBottom: 20 },
  formCardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e3a5f', margin: '0 0 6px' },
  formCardNote: { fontSize: 13, color: '#6b7280', margin: '0 0 18px' },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { display: 'block', fontSize: 13, fontWeight: 'bold', color: '#374151', marginBottom: 6 },
  input: { width: '100%', padding: '10px 14px', border: '2px solid #e5e7eb', borderRadius: 8, fontSize: 14, color: '#111827', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s', fontFamily: 'Arial, sans-serif' },
  msg: { padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14 },
  submitBtn: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Arial, sans-serif' },
  dangerCard: { background: '#fff', borderRadius: 14, padding: '24px 28px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #fecaca' },
  dangerTitle: { fontSize: 16, fontWeight: 'bold', color: '#dc2626', margin: '0 0 12px' },
  infoBanner: { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 8, padding: '10px 14px', fontSize: 13 },
}

export default SettingsPage
