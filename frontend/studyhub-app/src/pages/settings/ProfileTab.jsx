import { useEffect, useState } from 'react'
import AvatarCropModal from '../../components/AvatarCropModal'
import CoverCropModal from '../../components/CoverCropModal'
import { API } from '../../config'
import { readJsonSafely } from '../../lib/http'
import { Button, FormField, Input, Message, SectionCard, Select } from './settingsShared'

const DEFAULT_VISIBILITY = {
  displayName: 'public',
  age: 'private',
  location: 'public',
  socialLinks: 'public',
}

function createEmptyLink() {
  return { label: '', url: '' }
}

function buildFormState(user) {
  return {
    displayName: user?.displayName || '',
    bio: user?.bio || '',
    age: user?.age ?? '',
    location: user?.location || '',
    profileLinks:
      Array.isArray(user?.profileLinks) && user.profileLinks.length > 0
        ? user.profileLinks.map((link) => ({ label: link.label || '', url: link.url || '' }))
        : [createEmptyLink()],
    profileFieldVisibility: {
      ...DEFAULT_VISIBILITY,
      ...(user?.profileFieldVisibility || {}),
    },
  }
}

function ProfileLinkRow({ link, index, onChange, onRemove, disableRemove }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 180px) minmax(0, 1fr) auto',
        gap: 10,
        marginBottom: 10,
      }}
    >
      <Input
        value={link.label}
        placeholder="Instagram"
        maxLength={32}
        onChange={(event) => onChange(index, 'label', event.target.value)}
      />
      <Input
        value={link.url}
        placeholder="https://instagram.com/yourhandle"
        maxLength={240}
        onChange={(event) => onChange(index, 'url', event.target.value)}
      />
      <Button
        type="button"
        secondary
        disabled={disableRemove}
        onClick={() => onRemove(index)}
        style={{ whiteSpace: 'nowrap' }}
      >
        Remove
      </Button>
    </div>
  )
}

export default function ProfileTab({
  user,
  sessionUser,
  onAvatarChange,
  onCoverChange,
  onUserChange,
}) {
  const [showCrop, setShowCrop] = useState(false)
  const [showCoverCrop, setShowCoverCrop] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [coverImgError, setCoverImgError] = useState(false)
  const [removingCover, setRemovingCover] = useState(false)
  const [form, setForm] = useState(() => buildFormState(user))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const avatarUrl = user?.avatarUrl || sessionUser?.avatarUrl
  const coverUrl = user?.coverImageUrl || sessionUser?.coverImageUrl
  const initials = (user?.username || '??').slice(0, 2).toUpperCase()

  useEffect(() => {
    setForm(buildFormState(user))
  }, [user])

  async function handleRemoveCover() {
    setRemovingCover(true)
    try {
      const response = await fetch(`${API}/api/upload/cover`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await readJsonSafely(response, {})
      if (response.ok) {
        if (onCoverChange) onCoverChange(data.coverImageUrl)
      }
    } catch {
      // silent
    } finally {
      setRemovingCover(false)
    }
  }

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updateVisibility(key, value) {
    setForm((current) => ({
      ...current,
      profileFieldVisibility: {
        ...current.profileFieldVisibility,
        [key]: value,
      },
    }))
  }

  function updateProfileLink(index, field, value) {
    setForm((current) => ({
      ...current,
      profileLinks: current.profileLinks.map((link, linkIndex) =>
        linkIndex === index ? { ...link, [field]: value } : link,
      ),
    }))
  }

  function addProfileLink() {
    setForm((current) => ({
      ...current,
      profileLinks: [...current.profileLinks, createEmptyLink()],
    }))
  }

  function removeProfileLink(index) {
    setForm((current) => ({
      ...current,
      profileLinks:
        current.profileLinks.length > 1
          ? current.profileLinks.filter((_, linkIndex) => linkIndex !== index)
          : [createEmptyLink()],
    }))
  }

  async function handleSaveProfile() {
    setSaving(true)
    setMessage(null)

    try {
      const profileLinks = form.profileLinks.filter((link) => link.label.trim() || link.url.trim())

      const response = await fetch(`${API}/api/settings/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          displayName: form.displayName,
          bio: form.bio,
          age: form.age === '' ? null : Number(form.age),
          location: form.location,
          profileLinks,
          profileFieldVisibility: form.profileFieldVisibility,
        }),
      })

      const data = await readJsonSafely(response, {})
      if (!response.ok) {
        setMessage({ tone: 'error', text: data.error || 'Could not save your profile.' })
        return
      }

      const nextUser = data.user || null
      if (nextUser) {
        setForm(buildFormState(nextUser))
        onUserChange?.(nextUser)
      }
      setMessage({ tone: 'success', text: data.message || 'Profile updated successfully.' })
    } catch {
      setMessage({ tone: 'error', text: 'Check your connection and try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <SectionCard title="Cover Image" subtitle="Add a banner image to your profile page.">
        <div
          style={{
            borderRadius: 14,
            overflow: 'hidden',
            border: '1px solid var(--sh-border)',
            marginBottom: 14,
          }}
        >
          {coverUrl && !coverImgError ? (
            <img
              src={coverUrl.startsWith('http') ? coverUrl : `${API}${coverUrl}`}
              alt="Profile cover"
              loading="lazy"
              onError={() => setCoverImgError(true)}
              style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: 120,
                background: 'var(--sh-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--sh-muted)', fontWeight: 600 }}>
                No cover image
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={() => setShowCoverCrop(true)}
            style={{
              padding: '9px 18px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--sh-brand)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {coverUrl ? 'Change cover' : 'Upload cover'}
          </button>
          {coverUrl && (
            <button
              type="button"
              disabled={removingCover}
              onClick={handleRemoveCover}
              style={{
                padding: '9px 18px',
                borderRadius: 10,
                border: '1px solid var(--sh-danger-border)',
                background: 'var(--sh-danger-bg)',
                color: 'var(--sh-danger)',
                fontSize: 13,
                fontWeight: 700,
                cursor: removingCover ? 'not-allowed' : 'pointer',
                opacity: removingCover ? 0.6 : 1,
                fontFamily: 'inherit',
              }}
            >
              {removingCover ? 'Removing\u2026' : 'Remove cover'}
            </button>
          )}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--sh-muted)' }}>
          JPG, PNG, or WebP. Max 8 MB. Cropped to 16:5 banner ratio.
        </p>
      </SectionCard>

      <SectionCard
        title="Profile Photo"
        subtitle="Upload a photo so other students can recognize you."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            data-tutorial="settings-avatar"
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'var(--sh-avatar-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
              border: '2px solid var(--sh-border)',
            }}
          >
            {avatarUrl && !imgError ? (
              <img
                src={avatarUrl.startsWith('http') ? avatarUrl : `${API}${avatarUrl}`}
                alt={user?.username || ''}
                loading="lazy"
                onError={() => setImgError(true)}
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--sh-avatar-text)' }}>
                {initials}
              </span>
            )}
          </div>
          <div>
            <button
              type="button"
              onClick={() => setShowCrop(true)}
              style={{
                padding: '9px 18px',
                borderRadius: 10,
                border: 'none',
                background: 'var(--sh-brand)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
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

      <SectionCard
        title="Profile Details"
        subtitle="Choose what appears on your public profile and what stays visible only to you."
      >
        {message && <Message tone={message.tone}>{message.text}</Message>}

        <FormField label="Display Name" hint="Optional name shown alongside your username.">
          <Input
            value={form.displayName}
            maxLength={60}
            placeholder="Your full name or nickname"
            onChange={(event) => updateField('displayName', event.target.value)}
          />
        </FormField>

        <FormField
          label="Profile Description"
          hint="This description stays visible even when your account is private."
        >
          <textarea
            value={form.bio}
            maxLength={500}
            rows={5}
            placeholder="Tell other students what you study, what you like to share, or what people can expect from your profile."
            onChange={(event) => updateField('bio', event.target.value)}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid var(--sh-input-border)',
              fontSize: 14,
              fontFamily: 'inherit',
              color: 'var(--sh-input-text)',
              background: 'var(--sh-input-bg)',
              outline: 'none',
              boxSizing: 'border-box',
              resize: 'vertical',
              minHeight: 120,
            }}
          />
        </FormField>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          <FormField
            label="Age"
            hint="Optional and stored securely with your private profile data."
          >
            <Input
              type="number"
              min={13}
              max={120}
              value={form.age}
              placeholder="21"
              onChange={(event) => updateField('age', event.target.value)}
            />
          </FormField>

          <FormField label="Location" hint="Optional city, state, or campus.">
            <Input
              value={form.location}
              maxLength={80}
              placeholder="Baltimore, MD"
              onChange={(event) => updateField('location', event.target.value)}
            />
          </FormField>
        </div>

        <SectionCard
          title="Social Links"
          subtitle="Add labeled links so visitors see “Instagram” or “Portfolio” instead of a raw URL."
        >
          {form.profileLinks.map((link, index) => (
            <ProfileLinkRow
              key={`${index}-${link.label}-${link.url}`}
              link={link}
              index={index}
              onChange={updateProfileLink}
              onRemove={removeProfileLink}
              disableRemove={form.profileLinks.length === 1 && !link.label && !link.url}
            />
          ))}

          <Button
            type="button"
            secondary
            onClick={addProfileLink}
            disabled={form.profileLinks.length >= 6}
          >
            Add Link
          </Button>
        </SectionCard>

        <SectionCard
          title="Visibility"
          subtitle="Private accounts still show your profile photo, cover image, and description. These controls apply when your profile content is viewable."
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 14,
            }}
          >
            <FormField label="Display Name Visibility">
              <Select
                value={form.profileFieldVisibility.displayName}
                onChange={(event) => updateVisibility('displayName', event.target.value)}
              >
                <option value="public">Public</option>
                <option value="private">Only me</option>
              </Select>
            </FormField>

            <FormField label="Age Visibility">
              <Select
                value={form.profileFieldVisibility.age}
                onChange={(event) => updateVisibility('age', event.target.value)}
              >
                <option value="public">Public</option>
                <option value="private">Only me</option>
              </Select>
            </FormField>

            <FormField label="Location Visibility">
              <Select
                value={form.profileFieldVisibility.location}
                onChange={(event) => updateVisibility('location', event.target.value)}
              >
                <option value="public">Public</option>
                <option value="private">Only me</option>
              </Select>
            </FormField>

            <FormField label="Social Links Visibility">
              <Select
                value={form.profileFieldVisibility.socialLinks}
                onChange={(event) => updateVisibility('socialLinks', event.target.value)}
              >
                <option value="public">Public</option>
                <option value="private">Only me</option>
              </Select>
            </FormField>
          </div>
        </SectionCard>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="button" onClick={handleSaveProfile} disabled={saving}>
            {saving ? 'Saving...' : 'Save Profile'}
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Profile Info"
        subtitle="This is the current account state coming from your authenticated session."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          {[
            ['Username', user?.username || '\u2014'],
            ['Email', user?.email || 'Not set'],
            [
              'Email Status',
              user?.email
                ? user.emailVerified
                  ? 'Verified'
                  : 'Verification required'
                : 'No email on file',
            ],
            ['Role', user?.role || 'student'],
            ['Courses', user?._count?.enrollments ?? sessionUser?._count?.enrollments ?? 0],
            ['Study Sheets', user?._count?.studySheets ?? sessionUser?._count?.studySheets ?? 0],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: 'var(--sh-soft, #f8fafc)',
                border: '1px solid var(--sh-border, #e2e8f0)',
              }}
            >
              <div
                style={{
                  marginBottom: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--sh-muted, #94a3b8)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {label}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading, #0f172a)' }}>
                {value}
              </div>
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

      {showCoverCrop && (
        <CoverCropModal
          onClose={() => setShowCoverCrop(false)}
          onUploaded={(newUrl) => {
            setCoverImgError(false)
            if (onCoverChange) onCoverChange(newUrl)
          }}
        />
      )}
    </>
  )
}
