import { useState } from 'react'
import AvatarCropModal from '../../components/AvatarCropModal'
import { API } from '../../config'
import { SectionCard } from './settingsShared'

export default function ProfileTab({ user, sessionUser, onAvatarChange }) {
  const [showCrop, setShowCrop] = useState(false)
  const avatarUrl = user?.avatarUrl || sessionUser?.avatarUrl
  const initials = (user?.username || '??').slice(0, 2).toUpperCase()

  return (
    <>
      <SectionCard title="Profile Photo" subtitle="Upload a photo so other students can recognize you.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            data-tutorial="settings-avatar"
            style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'var(--sh-avatar-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, overflow: 'hidden',
              border: '2px solid var(--sh-border)',
            }}
          >
            {avatarUrl
              ? <img src={avatarUrl.startsWith('http') ? avatarUrl : `${API}${avatarUrl}`} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--sh-avatar-text)' }}>{initials}</span>
            }
          </div>
          <div>
            <button
              type="button"
              onClick={() => setShowCrop(true)}
              style={{
                padding: '9px 18px', borderRadius: 10, border: 'none',
                background: 'var(--sh-brand)', color: '#fff',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Upload photo
            </button>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--sh-muted)' }}>
              JPG, PNG, WebP, or GIF. Max 5 MB. Cropped to circle.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Profile Info" subtitle="This is the current account state coming from your authenticated session.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          {[
            ['Username', user?.username || '\u2014'],
            ['Email', user?.email || 'Not set'],
            ['Email Status', user?.email ? (user.emailVerified ? 'Verified' : 'Verification required') : 'No email on file'],
            ['Role', user?.role || 'student'],
            ['Courses', user?._count?.enrollments ?? sessionUser?._count?.enrollments ?? 0],
            ['Study Sheets', user?._count?.studySheets ?? sessionUser?._count?.studySheets ?? 0],
          ].map(([label, value]) => (
            <div key={label} style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--sh-soft, #f8fafc)', border: '1px solid var(--sh-border, #e2e8f0)' }}>
              <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 700, color: 'var(--sh-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {label}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading, #0f172a)' }}>{value}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      {showCrop && (
        <AvatarCropModal
          onClose={() => setShowCrop(false)}
          onUploaded={(newUrl) => {
            if (onAvatarChange) onAvatarChange(newUrl)
          }}
        />
      )}
    </>
  )
}
