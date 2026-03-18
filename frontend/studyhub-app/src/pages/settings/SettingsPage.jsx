import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LogoMark } from '../../components/Icons'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'

const NAV_TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'courses', label: 'Courses' },
  { id: 'account', label: 'Account' },
]

const DELETION_REASONS = [
  { value: 'better_platform', label: 'Found a better platform' },
  { value: 'no_longer_student', label: 'No longer a student' },
  { value: 'too_many_emails', label: 'Too many emails' },
  { value: 'privacy_concerns', label: 'Privacy concerns' },
  { value: 'other', label: 'Other' },
]

function Input(props) {
  return (
    <input
      {...props}
      style={{
        width: '100%',
        padding: '10px 14px',
        border: '1px solid #cbd5e1',
        borderRadius: 10,
        fontSize: 14,
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        color: '#0f172a',
        outline: 'none',
        boxSizing: 'border-box',
        ...(props.style || {}),
      }}
    />
  )
}

function Button({ children, secondary = false, danger = false, ...props }) {
  let background = '#3b82f6'
  let color = '#fff'
  let border = 'none'

  if (secondary) {
    background = '#fff'
    color = '#475569'
    border = '1px solid #cbd5e1'
  }

  if (danger) {
    background = '#fff1f2'
    color = '#be123c'
    border = '1px solid #fecdd3'
  }

  return (
    <button
      {...props}
      style={{
        padding: '10px 16px',
        borderRadius: 10,
        border,
        background,
        color,
        fontSize: 14,
        fontWeight: 700,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        opacity: props.disabled ? 0.7 : 1,
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        ...(props.style || {}),
      }}
    >
      {children}
    </button>
  )
}

function Message({ tone = 'error', children }) {
  const palette =
    tone === 'success'
      ? { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' }
      : tone === 'info'
        ? { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' }
        : { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' }

  return (
    <div
      style={{
        marginBottom: 14,
        padding: '12px 14px',
        borderRadius: 10,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.text,
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  )
}

function FormField({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>
        {label}
      </label>
      {children}
      {hint && (
        <div style={{ marginTop: 5, fontSize: 12, color: '#94a3b8' }}>
          {hint}
        </div>
      )}
    </div>
  )
}

function SectionCard({ title, subtitle, children, danger = false }) {
  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 16,
        border: `1px solid ${danger ? '#fecaca' : '#e2e8f0'}`,
        padding: '24px',
        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.05)',
        marginBottom: 18,
      }}
    >
      <h3 style={{ margin: '0 0 6px', fontSize: 17, color: danger ? '#be123c' : '#0f172a' }}>{title}</h3>
      {subtitle && <p style={{ margin: '0 0 18px', fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>{subtitle}</p>}
      {children}
    </section>
  )
}

function MsgList({ msg }) {
  if (!msg) return null
  return <Message tone={msg.type === 'success' ? 'success' : 'error'}>{msg.text}</Message>
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user: sessionUser, setSessionUser, signOut, clearSession } = useSession()

  const initialTab = NAV_TABS.find((tab) => tab.id === searchParams.get('tab'))?.id || 'profile'
  const [tab, setTab] = useState(initialTab)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [catalog, setCatalog] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(false)

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [usernameForm, setUsernameForm] = useState({ newUsername: '', password: '' })
  const [emailForm, setEmailForm] = useState({ email: '', password: '' })
  const [verificationCode, setVerificationCode] = useState('')
  const [courseSchoolId, setCourseSchoolId] = useState('')
  const [selectedCourseIds, setSelectedCourseIds] = useState([])
  const [deleteForm, setDeleteForm] = useState({ password: '', reason: '', details: '' })
  const [twoFaPassword, setTwoFaPassword] = useState('')

  const [passwordMsg, setPasswordMsg] = useState(null)
  const [usernameMsg, setUsernameMsg] = useState(null)
  const [emailMsg, setEmailMsg] = useState(null)
  const [coursesMsg, setCoursesMsg] = useState(null)
  const [deleteMsg, setDeleteMsg] = useState(null)
  const [twoFaMsg, setTwoFaMsg] = useState(null)
  const [busyKey, setBusyKey] = useState('')

  useEffect(() => {
    let active = true

    fetch(`${API}/api/settings/me`, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Could not load your settings.')
        }
        return response.json()
      })
      .then((data) => {
        if (!active) return
        setUser(data)
        setCourseSchoolId(String(data.enrollments?.[0]?.course?.schoolId || ''))
        setSelectedCourseIds((data.enrollments || []).map((enrollment) => enrollment.courseId))
      })
      .catch(() => {
        if (!active) return
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (tab !== 'courses' || catalog.length > 0 || catalogLoading) return

    let active = true
    setCatalogLoading(true)

    fetch(`${API}/api/courses/schools`, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Could not load the course catalog.')
        }
        return response.json()
      })
      .then((data) => {
        if (!active) return
        setCatalog(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!active) return
      })
      .finally(() => {
        if (active) setCatalogLoading(false)
      })

    return () => {
      active = false
    }
  }, [catalog.length, catalogLoading, tab])

  const selectedSchool = useMemo(
    () => catalog.find((school) => String(school.id) === String(courseSchoolId)) || null,
    [catalog, courseSchoolId],
  )

  function syncUser(nextUser) {
    if (!nextUser) return
    setUser(nextUser)
    setSessionUser(nextUser)
  }

  async function handlePatch(endpoint, body, setter, successHandler) {
    setBusyKey(endpoint)
    setter(null)

    try {
      const response = await fetch(`${API}/api/settings/${endpoint}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()

      if (!response.ok) {
        setter({ type: 'error', text: data.error || 'Request failed.' })
        return
      }

      if (data.user) {
        syncUser(data.user)
      }
      setter({ type: 'success', text: data.message || 'Saved.' })
      successHandler?.(data)
    } catch {
      setter({ type: 'error', text: 'Could not connect to the server.' })
    } finally {
      setBusyKey('')
    }
  }

  async function handleVerifyEmail() {
    if (!verificationCode.trim()) {
      setEmailMsg({ type: 'error', text: 'Enter the 6-digit verification code.' })
      return
    }

    setBusyKey('verify-email')
    setEmailMsg(null)

    try {
      const response = await fetch(`${API}/api/settings/email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verificationCode.trim() }),
      })
      const data = await response.json()

      if (!response.ok) {
        setEmailMsg({ type: 'error', text: data.error || 'Could not verify your email.' })
        return
      }

      syncUser(data.user)
      setVerificationCode('')
      setEmailMsg({ type: 'success', text: data.message || 'Email verified successfully.' })
    } catch {
      setEmailMsg({ type: 'error', text: 'Could not connect to the server.' })
    } finally {
      setBusyKey('')
    }
  }

  async function handleResendEmailVerification() {
    setBusyKey('resend-email')
    setEmailMsg(null)

    try {
      const response = await fetch(`${API}/api/settings/email/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()

      if (!response.ok) {
        setEmailMsg({ type: 'error', text: data.error || 'Could not resend the verification code.' })
        return
      }

      if (data.user) {
        syncUser(data.user)
      }
      setEmailMsg({ type: 'success', text: data.message || 'A new verification code was sent.' })
    } catch {
      setEmailMsg({ type: 'error', text: 'Could not connect to the server.' })
    } finally {
      setBusyKey('')
    }
  }

  async function handleTwoFaToggle(enable) {
    setBusyKey(enable ? 'enable-2fa' : 'disable-2fa')
    setTwoFaMsg(null)

    try {
      const response = await fetch(`${API}/api/settings/${enable ? '2fa/enable' : '2fa/disable'}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: twoFaPassword }),
      })
      const data = await response.json()

      if (!response.ok) {
        setTwoFaMsg({ type: 'error', text: data.error || 'Could not update 2-step verification.' })
        return
      }

      setUser((current) => {
        const next = { ...current, twoFaEnabled: data.twoFaEnabled }
        setSessionUser(next)
        return next
      })
      setTwoFaPassword('')
      setTwoFaMsg({ type: 'success', text: data.message || 'Saved.' })
    } catch {
      setTwoFaMsg({ type: 'error', text: 'Could not connect to the server.' })
    } finally {
      setBusyKey('')
    }
  }

  async function handleSaveCourses() {
    setBusyKey('courses')
    setCoursesMsg(null)

    try {
      const response = await fetch(`${API}/api/settings/courses`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: courseSchoolId ? Number(courseSchoolId) : null,
          courseIds: selectedCourseIds,
          customCourses: [],
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setCoursesMsg({ type: 'error', text: data.error || 'Could not save courses.' })
        return
      }

      if (data.user) {
        syncUser(data.user)
      }
      setCoursesMsg({ type: 'success', text: data.message || 'Courses updated.' })
    } catch {
      setCoursesMsg({ type: 'error', text: 'Could not connect to the server.' })
    } finally {
      setBusyKey('')
    }
  }

  async function handleDeleteAccount(event) {
    event.preventDefault()
    if (!deleteForm.reason || !deleteForm.password) {
      setDeleteMsg({ type: 'error', text: 'Choose a reason and confirm with your password.' })
      return
    }

    setBusyKey('delete-account')
    setDeleteMsg(null)

    try {
      const response = await fetch(`${API}/api/settings/account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deleteForm),
      })
      const data = await response.json()

      if (!response.ok) {
        setDeleteMsg({ type: 'error', text: data.error || 'Could not delete your account.' })
        return
      }

      clearSession()
      navigate('/', { replace: true })
    } catch {
      setDeleteMsg({ type: 'error', text: 'Could not connect to the server.' })
    } finally {
      setBusyKey('')
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#edf0f5', color: '#64748b' }}>
        Loading settings…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/feed" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <LogoMark size={28} />
            <span style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>StudyHub</span>
          </Link>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#94a3b8' }}>Settings</span>
          <div style={{ marginLeft: 'auto' }}>
            <Button secondary onClick={() => signOut().then(() => navigate('/login', { replace: true }))}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 24px 60px', display: 'grid', gridTemplateColumns: '200px 1fr', gap: 28 }}>
        <aside>
          <nav>
            {NAV_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  marginBottom: 4,
                  borderRadius: 10,
                  border: 'none',
                  background: tab === item.id ? '#fff' : 'transparent',
                  color: tab === item.id ? '#0f172a' : '#64748b',
                  fontSize: 14,
                  fontWeight: tab === item.id ? 700 : 500,
                  cursor: 'pointer',
                  boxShadow: tab === item.id ? '0 2px 10px rgba(15, 23, 42, 0.05)' : 'none',
                  fontFamily: 'inherit',
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main>
          {tab === 'profile' && (
            <>
              <SectionCard title="Profile" subtitle="This is the current account state coming from your authenticated session.">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                  {[
                    ['Username', user?.username || '—'],
                    ['Email', user?.email || 'Not set'],
                    ['Email Status', user?.email ? (user.emailVerified ? 'Verified' : 'Verification required') : 'No email on file'],
                    ['Role', user?.role || 'student'],
                    ['Courses', user?._count?.enrollments ?? sessionUser?._count?.enrollments ?? 0],
                    ['Study Sheets', user?._count?.studySheets ?? sessionUser?._count?.studySheets ?? 0],
                  ].map(([label, value]) => (
                    <div key={label} style={{ padding: '14px 16px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {label}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{value}</div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </>
          )}

          {tab === 'security' && (
            <>
              <SectionCard title="Change Password" subtitle="Use a password with at least 8 characters, one capital letter, and one number.">
                <FormField label="Current Password">
                  <Input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} />
                </FormField>
                <FormField label="New Password">
                  <Input type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} />
                </FormField>
                <FormField label="Confirm New Password">
                  <Input type="password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
                </FormField>
                <MsgList msg={passwordMsg} />
                <Button
                  disabled={busyKey === 'password'}
                  onClick={() => {
                    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
                      setPasswordMsg({ type: 'error', text: 'New passwords do not match.' })
                      return
                    }
                    void handlePatch('password', {
                      currentPassword: passwordForm.currentPassword,
                      newPassword: passwordForm.newPassword,
                    }, setPasswordMsg, () => {
                      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
                    })
                  }}
                >
                  {busyKey === 'password' ? 'Saving…' : 'Update Password'}
                </Button>
              </SectionCard>

              <SectionCard title="Change Username" subtitle={`Current username: ${user?.username || sessionUser?.username || 'unknown'}`}>
                <FormField label="New Username">
                  <Input value={usernameForm.newUsername} onChange={(event) => setUsernameForm((current) => ({ ...current, newUsername: event.target.value }))} />
                </FormField>
                <FormField label="Confirm with Password">
                  <Input type="password" value={usernameForm.password} onChange={(event) => setUsernameForm((current) => ({ ...current, password: event.target.value }))} />
                </FormField>
                <MsgList msg={usernameMsg} />
                <Button
                  disabled={busyKey === 'username'}
                  onClick={() => void handlePatch('username', usernameForm, setUsernameMsg, () => {
                    setUsernameForm({ newUsername: '', password: '' })
                  })}
                >
                  {busyKey === 'username' ? 'Saving…' : 'Update Username'}
                </Button>
              </SectionCard>

              {user?.role === 'admin' && !user?.twoFaEnabled && (
                <Message tone="info">
                  Admin tools stay locked until this account enables 2-step verification.
                </Message>
              )}

              <SectionCard title="2-Step Verification" subtitle="Email verification happens before 2FA. Password reset and 2FA both depend on a verified email.">
                {user?.pendingEmailVerification && (
                  <Message tone="info">
                    Finish verifying <strong>{user.pendingEmailVerification.deliveryHint || user.pendingEmailVerification.email}</strong> before you enable 2-step verification.
                  </Message>
                )}
                {!user?.email && (
                  <Message tone="info">Add an email address in the Account tab first.</Message>
                )}
                {user?.email && !user?.emailVerified && !user?.pendingEmailVerification && (
                  <Message tone="info">Your current email still needs verification from the Account tab.</Message>
                )}

                <FormField label="Confirm with Password">
                  <Input type="password" value={twoFaPassword} onChange={(event) => setTwoFaPassword(event.target.value)} />
                </FormField>
                <MsgList msg={twoFaMsg} />
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Button
                    disabled={busyKey === 'enable-2fa' || !twoFaPassword || !user?.emailVerified || Boolean(user?.pendingEmailVerification)}
                    onClick={() => handleTwoFaToggle(true)}
                  >
                    {busyKey === 'enable-2fa' ? 'Enabling…' : user?.twoFaEnabled ? '2FA Enabled' : 'Enable 2-Step Verification'}
                  </Button>
                  {user?.twoFaEnabled && (
                    <Button
                      secondary
                      disabled={busyKey === 'disable-2fa' || !twoFaPassword}
                      onClick={() => handleTwoFaToggle(false)}
                    >
                      {busyKey === 'disable-2fa' ? 'Disabling…' : 'Disable 2-Step Verification'}
                    </Button>
                  )}
                </div>
              </SectionCard>
            </>
          )}

          {tab === 'courses' && (
            <SectionCard title="Courses" subtitle="Choose the courses you want to personalize around.">
              <FormField label="School">
                <select
                  value={courseSchoolId}
                  onChange={(event) => {
                    setCourseSchoolId(event.target.value)
                    setSelectedCourseIds([])
                    setCoursesMsg(null)
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                    color: '#0f172a',
                  }}
                >
                  <option value="">Select a school</option>
                  {catalog.map((school) => (
                    <option key={school.id} value={school.id}>{school.name}</option>
                  ))}
                </select>
              </FormField>

              {catalogLoading && <div style={{ marginBottom: 14, color: '#64748b', fontSize: 13 }}>Loading course catalog…</div>}

              {selectedSchool && (
                <div
                  style={{
                    maxHeight: 320,
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    background: '#f8fafc',
                    marginBottom: 16,
                  }}
                >
                  {(selectedSchool.courses || []).map((course) => {
                    const checked = selectedCourseIds.includes(course.id)
                    return (
                      <label
                        key={course.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '12px 14px',
                          borderBottom: '1px solid #e2e8f0',
                          background: checked ? '#eff6ff' : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedCourseIds((current) => (
                              checked
                                ? current.filter((id) => id !== course.id)
                                : current.length < 10
                                  ? [...current, course.id]
                                  : current
                            ))
                          }}
                        />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{course.code}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>{course.name}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}

              <MsgList msg={coursesMsg} />
              <Button disabled={busyKey === 'courses' || !courseSchoolId} onClick={handleSaveCourses}>
                {busyKey === 'courses' ? 'Saving…' : 'Save Courses'}
              </Button>
            </SectionCard>
          )}

          {tab === 'account' && (
            <>
              <SectionCard title="Email Address" subtitle={user?.email ? `Current email: ${user.email}` : 'Add an email address to unlock recovery and verification.'}>
                {user?.email && (
                  <Message tone={user.emailVerified ? 'success' : 'info'}>
                    {user.emailVerified ? 'Your email is verified.' : 'Email verification is still required.'}
                  </Message>
                )}

                {user?.pendingEmailVerification && (
                  <Message tone="info">
                    Verification is pending for <strong>{user.pendingEmailVerification.deliveryHint || user.pendingEmailVerification.email}</strong>.
                  </Message>
                )}

                <FormField label="New Email">
                  <Input type="email" value={emailForm.email} onChange={(event) => setEmailForm((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" />
                </FormField>
                <FormField label="Confirm with Password">
                  <Input type="password" value={emailForm.password} onChange={(event) => setEmailForm((current) => ({ ...current, password: event.target.value }))} />
                </FormField>
                <MsgList msg={emailMsg} />
                <Button
                  disabled={busyKey === 'email'}
                  onClick={() => void handlePatch('email', emailForm, setEmailMsg, () => {
                    setEmailForm({ email: '', password: '' })
                    setVerificationCode('')
                  })}
                >
                  {busyKey === 'email' ? 'Updating…' : 'Start Email Update'}
                </Button>

                {user?.pendingEmailVerification && (
                  <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #e2e8f0' }}>
                    <FormField label="Verification Code" hint="Enter the 6-digit code from your inbox.">
                      <Input
                        value={verificationCode}
                        onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        inputMode="numeric"
                        maxLength={6}
                        style={{ letterSpacing: '0.35em', textAlign: 'center', fontSize: 22, maxWidth: 220 }}
                      />
                    </FormField>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <Button disabled={busyKey === 'verify-email' || verificationCode.trim().length !== 6} onClick={handleVerifyEmail}>
                        {busyKey === 'verify-email' ? 'Verifying…' : 'Verify Email'}
                      </Button>
                      <Button secondary disabled={busyKey === 'resend-email'} onClick={handleResendEmailVerification}>
                        {busyKey === 'resend-email' ? 'Sending…' : 'Resend Code'}
                      </Button>
                    </div>
                  </div>
                )}
              </SectionCard>

              <SectionCard
                danger
                title="Danger Zone"
                subtitle="Deleting your account is permanent. Your sheets, notes, comments, and profile will be removed."
              >
                <form onSubmit={handleDeleteAccount}>
                  <FormField label="Reason for leaving">
                    <select
                      value={deleteForm.reason}
                      onChange={(event) => setDeleteForm((current) => ({ ...current, reason: event.target.value }))}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: '1px solid #cbd5e1',
                        fontSize: 14,
                        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                        color: '#0f172a',
                      }}
                    >
                      <option value="">Select a reason</option>
                      {DELETION_REASONS.map((reason) => (
                        <option key={reason.value} value={reason.value}>{reason.label}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Additional details (optional)">
                    <textarea
                      value={deleteForm.details}
                      onChange={(event) => setDeleteForm((current) => ({ ...current, details: event.target.value.slice(0, 300) }))}
                      rows={4}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: '1px solid #cbd5e1',
                        fontSize: 14,
                        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                        color: '#0f172a',
                        resize: 'vertical',
                        boxSizing: 'border-box',
                      }}
                    />
                  </FormField>
                  <FormField label="Confirm with Password">
                    <Input type="password" value={deleteForm.password} onChange={(event) => setDeleteForm((current) => ({ ...current, password: event.target.value }))} />
                  </FormField>
                  <MsgList msg={deleteMsg} />
                  <Button danger type="submit" disabled={busyKey === 'delete-account'}>
                    {busyKey === 'delete-account' ? 'Deleting…' : 'Delete My Account'}
                  </Button>
                </form>
              </SectionCard>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
