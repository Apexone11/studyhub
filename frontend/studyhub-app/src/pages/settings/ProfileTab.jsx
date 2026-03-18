import { SectionCard } from './settingsShared'

export default function ProfileTab({ user, sessionUser }) {
  return (
    <SectionCard title="Profile" subtitle="This is the current account state coming from your authenticated session.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
        {[
          ['Username', user?.username || '\u2014'],
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
  )
}
