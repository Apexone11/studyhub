import { Link } from 'react-router-dom'
import { SUPPORT_EMAIL } from '../../config'
import { primaryButtonLink, settingsCardStyle } from './adminConstants'

export default function AdminSettingsTab({ user, htmlKillSwitch, htmlToggleSaving, toggleHtmlUploads }) {
  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 18,
        border: '1px solid #e2e8f0',
        padding: '22px',
      }}
    >
      <h1 style={{ margin: '0 0 10px', fontSize: 22, color: '#0f172a' }}>Admin Settings</h1>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>
        Core account changes now live under the shared settings flow so admin and student verification behavior stay consistent.
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={settingsCardStyle}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>ADMIN EMAIL</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
            {user.email || SUPPORT_EMAIL}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Verification status: {user.emailVerified ? 'verified' : 'verification required'}
          </div>
        </div>
        <div style={settingsCardStyle}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>SECURITY</div>
          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
            Use the main settings page to change email, password, username, 2-step verification, and enrolled courses.
          </div>
        </div>
        <div style={{
          ...settingsCardStyle,
          border: htmlKillSwitch.enabled ? '1px solid var(--sh-success-border, #bbf7d0)' : '1px solid var(--sh-danger-border, #fecaca)',
          background: htmlKillSwitch.enabled ? 'var(--sh-success-bg, #f0fdf4)' : 'var(--sh-danger-bg, #fef2f2)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>HTML UPLOADS KILL-SWITCH</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              fontSize: 14, fontWeight: 700,
              color: htmlKillSwitch.enabled ? 'var(--sh-success, #16a34a)' : 'var(--sh-danger, #dc2626)',
            }}>
              {htmlKillSwitch.loading ? 'Loading…' : htmlKillSwitch.enabled ? 'HTML Uploads Enabled' : 'HTML Uploads Disabled'}
            </div>
            {!htmlKillSwitch.loading && (
              <button
                type="button"
                disabled={htmlToggleSaving || htmlKillSwitch.envOverride === 'disabled' || htmlKillSwitch.envOverride === 'enabled'}
                onClick={() => toggleHtmlUploads(!htmlKillSwitch.enabled)}
                style={{
                  padding: '5px 14px',
                  borderRadius: 8,
                  border: htmlKillSwitch.enabled ? '1px solid var(--sh-danger-border, #fecaca)' : '1px solid var(--sh-success-border, #bbf7d0)',
                  background: 'var(--sh-surface, #fff)',
                  color: htmlKillSwitch.enabled ? 'var(--sh-danger, #dc2626)' : 'var(--sh-success, #16a34a)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: htmlToggleSaving || htmlKillSwitch.envOverride ? 'not-allowed' : 'pointer',
                  opacity: htmlToggleSaving ? 0.6 : 1,
                  fontFamily: 'inherit',
                }}
              >
                {htmlToggleSaving ? 'Saving…' : htmlKillSwitch.enabled ? 'Disable HTML' : 'Enable HTML'}
              </button>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
            {htmlKillSwitch.envOverride
              ? `Environment variable STUDYHUB_HTML_UPLOADS is set to "${htmlKillSwitch.envOverride}" — this overrides the toggle. Change the env var and restart to use the admin toggle.`
              : htmlKillSwitch.enabled
                ? 'HTML sheets go through sanitization + admin review. Disable instantly if you spot abuse.'
                : 'All HTML uploads are blocked. Users will see a message to use Markdown instead.'}
          </div>
          {htmlKillSwitch.error && (
            <div style={{ fontSize: 12, color: 'var(--sh-danger, #dc2626)', marginTop: 6 }}>{htmlKillSwitch.error}</div>
          )}
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
            Source: {htmlKillSwitch.source} {htmlKillSwitch.envOverride ? `(env: ${htmlKillSwitch.envOverride})` : ''}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <Link to="/settings" style={primaryButtonLink}>
          Open account settings
        </Link>
      </div>
    </section>
  )
}
