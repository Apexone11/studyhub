import { Pager } from './AdminWidgets'
import { inputStyle, primaryButton, pillButton } from './adminConstants'

export default function AnnouncementsTab({
  announcementsState,
  announceForm,
  setAnnounceForm,
  announceSaving,
  announceError,
  saveAnnouncement,
  togglePin,
  deleteAnnouncement,
  loadPagedData,
}) {
  return (
    <>
      <form onSubmit={saveAnnouncement} style={{ marginBottom: 18, display: 'grid', gap: 10 }}>
        <input
          value={announceForm.title}
          onChange={(event) => setAnnounceForm((current) => ({ ...current, title: event.target.value }))}
          placeholder="Announcement title"
          style={inputStyle}
        />
        <textarea
          value={announceForm.body}
          onChange={(event) => setAnnounceForm((current) => ({ ...current, body: event.target.value }))}
          placeholder="Announcement body"
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569' }}>
          <input
            type="checkbox"
            checked={announceForm.pinned}
            onChange={(event) => setAnnounceForm((current) => ({ ...current, pinned: event.target.checked }))}
          />
          Pin this announcement
        </label>
        {announceError ? <div style={{ color: '#b91c1c', fontSize: 12 }}>{announceError}</div> : null}
        <button type="submit" disabled={announceSaving} style={primaryButton}>
          {announceSaving ? 'Posting…' : 'Post announcement'}
        </button>
      </form>

      <div style={{ display: 'grid', gap: 10 }}>
        {announcementsState.items.map((record) => (
          <div key={record.id} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 16px', background: record.pinned ? '#fffbeb' : '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                {record.pinned ? (
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', marginBottom: 5 }}>PINNED</div>
                ) : null}
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{record.title}</div>
                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7 }}>{record.body}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
                <button type="button" onClick={() => void togglePin(record.id)} style={pillButton('#eff6ff', '#1d4ed8', '#bfdbfe')}>
                  {record.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button type="button" onClick={() => void deleteAnnouncement(record.id)} style={pillButton('#fef2f2', '#dc2626', '#fecaca')}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Pager page={announcementsState.page} total={announcementsState.total} onChange={(page) => void loadPagedData('announcements', page)} />
    </>
  )
}
