/* ═══════════════════════════════════════════════════════════════════════════
 * AnnouncementsTab.jsx — Admin announcements management with media support
 *
 * Features:
 *   - Large textarea with character counter (25,000 max)
 *   - Image upload (up to 5 images, 10 MB each)
 *   - Pin/unpin and delete controls
 *   - Pagination
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useRef } from 'react'
import { API } from '../../config'
import { Pager } from './AdminWidgets'
import { inputStyle, primaryButton, pillButton } from './adminConstants'

const MAX_BODY = 25000
const MAX_TITLE = 200
const MAX_IMAGES = 5
const MAX_IMAGE_SIZE = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

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
  const [images, setImages] = useState([])
  const [imageError, setImageError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const bodyLen = (announceForm.body || '').length
  const bodyPct = bodyLen / MAX_BODY

  function handleImageSelect(e) {
    const files = Array.from(e.target.files || [])
    setImageError('')

    const remaining = MAX_IMAGES - images.length
    if (files.length > remaining) {
      setImageError(`You can add up to ${remaining} more image${remaining === 1 ? '' : 's'}.`)
      return
    }

    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setImageError(`${file.name}: unsupported format. Use JPEG, PNG, GIF, or WebP.`)
        return
      }
      if (file.size > MAX_IMAGE_SIZE) {
        setImageError(`${file.name}: exceeds 10 MB limit.`)
        return
      }
    }

    const newImages = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      name: file.name,
    }))
    setImages((prev) => [...prev, ...newImages])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeImage(index) {
    setImages((prev) => {
      const removed = prev[index]
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setUploading(true)

    // Create the announcement via the parent hook
    await saveAnnouncement(e)

    // Upload images if present and announcement was created successfully
    if (images.length > 0) {
      try {
        // Get the newest announcement to attach images
        const listRes = await fetch(`${API}/api/admin/announcements?page=1`, {
          credentials: 'include',
        })
        if (listRes.ok) {
          const listData = await listRes.json()
          const newest = listData.announcements?.[0]
          if (newest) {
            const formData = new FormData()
            images.forEach((img) => formData.append('images', img.file))
            await fetch(`${API}/api/announcements/${newest.id}/images`, {
              method: 'POST',
              credentials: 'include',
              body: formData,
            })
            await loadPagedData('announcements', 1)
          }
        }
      } catch {
        // Image upload failed -- announcement was still created
      }
    }

    // Clean up
    images.forEach((img) => {
      if (img.preview) URL.revokeObjectURL(img.preview)
    })
    setImages([])
    setUploading(false)
  }

  return (
    <>
      <form onSubmit={handleSubmit} style={{ marginBottom: 18, display: 'grid', gap: 12 }}>
        <input
          value={announceForm.title}
          onChange={(e) => setAnnounceForm((cur) => ({ ...cur, title: e.target.value }))}
          placeholder="Announcement title"
          maxLength={MAX_TITLE}
          style={inputStyle}
        />

        {/* Body textarea with character counter */}
        <div style={{ position: 'relative' }}>
          <textarea
            value={announceForm.body}
            onChange={(e) => setAnnounceForm((cur) => ({ ...cur, body: e.target.value }))}
            placeholder="Write your announcement here. Supports long-form content for release notes, updates, and reports."
            rows={12}
            maxLength={MAX_BODY}
            style={{
              ...inputStyle,
              resize: 'vertical',
              minHeight: 200,
              lineHeight: 1.7,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              right: 12,
              fontSize: 11,
              color: bodyPct > 0.9 ? 'var(--sh-danger-text)' : 'var(--sh-muted)',
              fontWeight: bodyPct > 0.9 ? 600 : 400,
              pointerEvents: 'none',
            }}
          >
            {bodyLen.toLocaleString()} / {MAX_BODY.toLocaleString()}
          </div>
        </div>

        {/* Image upload */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={images.length >= MAX_IMAGES}
              style={{
                ...pillButton('var(--sh-soft)', 'var(--sh-text)', 'var(--sh-border)'),
                opacity: images.length >= MAX_IMAGES ? 0.5 : 1,
                cursor: images.length >= MAX_IMAGES ? 'not-allowed' : 'pointer',
              }}
            >
              Attach Images ({images.length}/{MAX_IMAGES})
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
          </div>

          {imageError && (
            <div style={{ color: 'var(--sh-danger-text)', fontSize: 12, marginBottom: 8 }}>
              {imageError}
            </div>
          )}

          {images.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {images.map((img, i) => (
                <div key={i} style={{ position: 'relative', width: 80, height: 80 }}>
                  <img
                    src={img.preview}
                    alt={img.name}
                    style={{
                      width: 80,
                      height: 80,
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '1px solid var(--sh-border)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: '1px solid var(--sh-border)',
                      background: 'var(--sh-surface)',
                      color: 'var(--sh-danger-text)',
                      fontSize: 12,
                      lineHeight: '18px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                    aria-label={`Remove ${img.name}`}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: 'var(--sh-muted)',
          }}
        >
          <input
            type="checkbox"
            checked={announceForm.pinned}
            onChange={(e) => setAnnounceForm((cur) => ({ ...cur, pinned: e.target.checked }))}
          />
          Pin this announcement
        </label>

        {announceError && (
          <div style={{ color: 'var(--sh-danger-text)', fontSize: 12 }}>{announceError}</div>
        )}

        <button type="submit" disabled={announceSaving || uploading} style={primaryButton}>
          {uploading ? 'Uploading images...' : announceSaving ? 'Posting...' : 'Post Announcement'}
        </button>
      </form>

      {/* Announcements list */}
      <div style={{ display: 'grid', gap: 10 }}>
        {announcementsState.items.length === 0 && (
          <div className="admin-empty">No announcements yet.</div>
        )}
        {announcementsState.items.map((record) => (
          <div
            key={record.id}
            style={{
              border: '1px solid var(--sh-border)',
              borderRadius: 14,
              padding: '14px 16px',
              background: record.pinned ? 'var(--sh-warning-bg)' : 'var(--sh-surface)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {record.pinned && (
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--sh-warning-text)',
                      marginBottom: 5,
                    }}
                  >
                    PINNED
                  </div>
                )}
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: 'var(--sh-heading)',
                    marginBottom: 6,
                  }}
                >
                  {record.title}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--sh-muted)',
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                    maxHeight: 200,
                    overflow: 'hidden',
                  }}
                >
                  {record.body}
                </div>
                {record.body?.length > 500 && (
                  <div style={{ fontSize: 11, color: 'var(--sh-brand)', marginTop: 4 }}>
                    {record.body.length.toLocaleString()} characters total
                  </div>
                )}
                {record.media?.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {record.media
                      .filter((m) => m.type === 'image')
                      .map((m) => (
                        <img
                          key={m.id}
                          src={m.url}
                          alt=""
                          style={{
                            width: 60,
                            height: 60,
                            objectFit: 'cover',
                            borderRadius: 6,
                            border: '1px solid var(--sh-border)',
                          }}
                        />
                      ))}
                    {record.media.some((m) => m.type === 'video') && (
                      <div
                        style={{
                          width: 60,
                          height: 60,
                          borderRadius: 6,
                          border: '1px solid var(--sh-border)',
                          background: 'var(--sh-soft)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          color: 'var(--sh-muted)',
                          fontWeight: 600,
                        }}
                      >
                        Video
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'start', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => void togglePin(record.id)}
                  style={pillButton(
                    'var(--sh-info-bg)',
                    'var(--sh-info-text)',
                    'var(--sh-info-border)',
                  )}
                >
                  {record.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteAnnouncement(record.id)}
                  style={pillButton(
                    'var(--sh-danger-bg)',
                    'var(--sh-danger-text)',
                    'var(--sh-danger-border)',
                  )}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Pager
        page={announcementsState.page}
        total={announcementsState.total}
        onChange={(page) => void loadPagedData('announcements', page)}
      />
    </>
  )
}
