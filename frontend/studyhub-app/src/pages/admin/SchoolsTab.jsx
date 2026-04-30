import { useCallback, useEffect, useRef, useState } from 'react'
import { FONT, tableHeadStyle, tableCell, tableCellStrong } from './adminConstants'
import { showToast } from '../../lib/toast'
import { API } from '../../config'
import { resolveImageUrl } from '../../lib/imageUrls'

function DomainCell({ school, apiJson, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(school.emailDomain || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    const trimmed = value.trim().toLowerCase()
    if (trimmed === (school.emailDomain || '')) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await apiJson(`/api/admin/schools/${school.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailDomain: trimmed || null }),
      })
      onUpdate(school.id, trimmed || null)
      showToast('Domain updated.', 'success')
      setEditing(false)
    } catch (err) {
      showToast(err.message || 'Could not update domain.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <td style={tableCell}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. umd.edu"
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') setEditing(false)
            }}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid var(--sh-input-border)',
              fontSize: 11,
              fontFamily: FONT,
              width: 120,
            }}
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              border: '1px solid var(--sh-brand)',
              background: 'var(--sh-brand)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: FONT,
            }}
          >
            {saving ? '...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(school.emailDomain || '')
              setEditing(false)
            }}
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              border: '1px solid var(--sh-border)',
              background: 'transparent',
              color: 'var(--sh-slate-500)',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: FONT,
            }}
          >
            Cancel
          </button>
        </div>
      </td>
    )
  }

  return (
    <td style={tableCell}>
      <button
        type="button"
        onClick={() => setEditing(true)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: school.emailDomain ? 'var(--sh-slate-600)' : 'var(--sh-slate-300)',
          fontSize: 12,
          fontFamily: FONT,
        }}
      >
        {school.emailDomain || '—'}
      </button>
    </td>
  )
}

export default function SchoolsTab({ apiJson }) {
  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploadingId, setUploadingId] = useState(null)
  const fileInputRef = useRef(null)
  const pendingSchoolId = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiJson('/api/admin/schools')
      setSchools(data.schools || [])
    } catch (err) {
      setError(err.message || 'Could not load schools.')
    } finally {
      setLoading(false)
    }
  }, [apiJson])

  useEffect(() => {
    load()
  }, [load])

  function startUpload(schoolId) {
    pendingSchoolId.current = schoolId
    fileInputRef.current?.click()
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file || !pendingSchoolId.current) return
    const schoolId = pendingSchoolId.current
    pendingSchoolId.current = null
    event.target.value = ''

    if (file.size > 2 * 1024 * 1024) {
      showToast('Logo must be under 2 MB.', 'error')
      return
    }

    setUploadingId(schoolId)
    try {
      const formData = new FormData()
      formData.append('logo', file)

      const response = await fetch(`${API}/api/admin/schools/${schoolId}/logo`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) {
        showToast(data.error || 'Could not upload logo.', 'error')
        return
      }
      setSchools((prev) =>
        prev.map((s) => (s.id === schoolId ? { ...s, logoUrl: data.logoUrl } : s)),
      )
      showToast('Logo uploaded.', 'success')
    } catch {
      showToast('Check your connection and try again.', 'error')
    } finally {
      setUploadingId(null)
    }
  }

  async function removeLogo(schoolId) {
    setUploadingId(schoolId)
    try {
      await apiJson(`/api/admin/schools/${schoolId}/logo`, { method: 'DELETE' })
      setSchools((prev) => prev.map((s) => (s.id === schoolId ? { ...s, logoUrl: null } : s)))
      showToast('Logo removed.', 'success')
    } catch (err) {
      showToast(err.message || 'Could not remove logo.', 'error')
    } finally {
      setUploadingId(null)
    }
  }

  function handleDomainUpdate(schoolId, emailDomain) {
    setSchools((prev) => prev.map((s) => (s.id === schoolId ? { ...s, emailDomain } : s)))
  }

  if (loading)
    return <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>Loading schools...</div>
  if (error) return <div style={{ color: 'var(--sh-danger)', fontSize: 13 }}>{error}</div>

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--sh-muted)' }}>
        {schools.length} schools · Upload logos (JPG, PNG, WebP, SVG, max 2 MB) · Click domain to
        edit
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: FONT }}
        >
          <thead>
            <tr>
              <th style={tableHeadStyle}>Logo</th>
              <th style={tableHeadStyle}>Name</th>
              <th style={tableHeadStyle}>Short</th>
              <th style={tableHeadStyle}>Domain</th>
              <th style={tableHeadStyle}>Location</th>
              <th style={tableHeadStyle}>Courses</th>
              <th style={tableHeadStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {schools.map((school) => {
              const logoUrl = resolveImageUrl(school.logoUrl)
              return (
                <tr key={school.id} style={{ borderBottom: '1px solid var(--sh-border)' }}>
                  {/* Logo */}
                  <td style={{ ...tableCell, width: 64 }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        background: 'var(--sh-soft)',
                        border: '1px solid var(--sh-border)',
                        display: 'grid',
                        placeItems: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt={`${school.short} logo`}
                          loading="lazy"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            padding: 6,
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none'
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--sh-brand)' }}>
                          {(school.short || '??').slice(0, 4)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={tableCellStrong}>{school.name}</td>
                  <td style={tableCell}>{school.short}</td>
                  <DomainCell school={school} apiJson={apiJson} onUpdate={handleDomainUpdate} />
                  <td style={tableCell}>
                    {school.city}
                    {school.state ? `, ${school.state}` : ''}
                  </td>
                  <td style={tableCell}>{school._count?.courses || 0}</td>
                  <td style={tableCell}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => startUpload(school.id)}
                        disabled={uploadingId === school.id}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 700,
                          border: '1px solid var(--sh-brand)',
                          background: 'transparent',
                          color: 'var(--sh-brand)',
                          cursor: 'pointer',
                          fontFamily: FONT,
                        }}
                      >
                        {uploadingId === school.id ? '...' : school.logoUrl ? 'Replace' : 'Upload'}
                      </button>
                      {school.logoUrl && (
                        <button
                          type="button"
                          onClick={() => removeLogo(school.id)}
                          disabled={uploadingId === school.id}
                          style={{
                            padding: '5px 10px',
                            borderRadius: 8,
                            fontSize: 11,
                            fontWeight: 700,
                            border: '1px solid var(--sh-danger-border)',
                            background: 'transparent',
                            color: 'var(--sh-danger)',
                            cursor: 'pointer',
                            fontFamily: FONT,
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
