const PROFILE_FIELD_VISIBILITY_KEYS = ['displayName', 'age', 'location', 'socialLinks']
const PROFILE_FIELD_VISIBILITY_VALUES = ['public', 'private']

const DEFAULT_PROFILE_FIELD_VISIBILITY = Object.freeze({
  displayName: 'public',
  age: 'private',
  location: 'public',
  socialLinks: 'public',
})

const MAX_DISPLAY_NAME_LENGTH = 60
const MAX_PROFILE_BIO_LENGTH = 500
const MAX_PROFILE_LOCATION_LENGTH = 80
const MAX_PROFILE_LINKS = 6
const MAX_PROFILE_LINK_LABEL_LENGTH = 32
const MAX_PROFILE_LINK_URL_LENGTH = 240

function sanitizeOptionalText(value, { maxLength, fieldName }) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') throw new Error(`${fieldName} must be a string.`)

  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`)
  }
  return trimmed
}

function sanitizeDisplayName(value) {
  return sanitizeOptionalText(value, {
    maxLength: MAX_DISPLAY_NAME_LENGTH,
    fieldName: 'Display name',
  })
}

function sanitizeBio(value) {
  return sanitizeOptionalText(value, {
    maxLength: MAX_PROFILE_BIO_LENGTH,
    fieldName: 'Bio',
  })
}

function sanitizeLocation(value) {
  return sanitizeOptionalText(value, {
    maxLength: MAX_PROFILE_LOCATION_LENGTH,
    fieldName: 'Location',
  })
}

function sanitizeAge(value) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null

  const parsed = Number(value)
  if (!Number.isInteger(parsed)) throw new Error('Age must be a whole number.')
  if (parsed < 13 || parsed > 120) throw new Error('Age must be between 13 and 120.')
  return parsed
}

function normalizeLinkUrl(rawUrl) {
  if (typeof rawUrl !== 'string') throw new Error('Profile link URL must be a string.')

  let nextUrl = rawUrl.trim()
  if (!nextUrl) throw new Error('Profile link URL is required.')
  if (nextUrl.length > MAX_PROFILE_LINK_URL_LENGTH) {
    throw new Error(`Profile link URL must be ${MAX_PROFILE_LINK_URL_LENGTH} characters or fewer.`)
  }

  if (!/^https?:\/\//i.test(nextUrl)) {
    nextUrl = `https://${nextUrl}`
  }

  let parsed
  try {
    parsed = new URL(nextUrl)
  } catch {
    throw new Error('Profile link URL must be a valid http or https URL.')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Profile link URL must use http or https.')
  }

  return parsed.toString()
}

function sanitizeProfileLinks(rawLinks) {
  if (rawLinks === undefined || rawLinks === null) return []
  if (!Array.isArray(rawLinks)) throw new Error('Profile links must be an array.')
  if (rawLinks.length > MAX_PROFILE_LINKS) {
    throw new Error(`You can add up to ${MAX_PROFILE_LINKS} profile links.`)
  }

  const seen = new Set()
  const normalized = []

  rawLinks.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Profile link ${index + 1} must be an object.`)
    }

    const rawLabel = typeof entry.label === 'string' ? entry.label.trim() : ''
    if (!rawLabel) throw new Error(`Profile link ${index + 1} needs a label.`)
    if (rawLabel.length > MAX_PROFILE_LINK_LABEL_LENGTH) {
      throw new Error(
        `Profile link label must be ${MAX_PROFILE_LINK_LABEL_LENGTH} characters or fewer.`,
      )
    }

    const label = rawLabel.replace(/\s+/g, ' ')
    const url = normalizeLinkUrl(entry.url)
    const dedupeKey = `${label.toLowerCase()}::${url.toLowerCase()}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)

    normalized.push({ label, url })
  })

  return normalized
}

function normalizeProfileLinks(rawLinks) {
  try {
    return sanitizeProfileLinks(rawLinks)
  } catch {
    return []
  }
}

function sanitizeProfileFieldVisibility(rawVisibility) {
  const next = { ...DEFAULT_PROFILE_FIELD_VISIBILITY }
  if (rawVisibility === undefined || rawVisibility === null) return next
  if (typeof rawVisibility !== 'object' || Array.isArray(rawVisibility)) {
    throw new Error('Profile field visibility must be an object.')
  }

  PROFILE_FIELD_VISIBILITY_KEYS.forEach((key) => {
    if (!Object.hasOwn(rawVisibility, key)) return
    const value =
      typeof rawVisibility[key] === 'string' ? rawVisibility[key].trim().toLowerCase() : ''
    if (!PROFILE_FIELD_VISIBILITY_VALUES.includes(value)) {
      throw new Error(`${key} visibility must be public or private.`)
    }
    next[key] = value
  })

  return next
}

function getProfileFieldVisibility(rawVisibility) {
  try {
    return sanitizeProfileFieldVisibility(rawVisibility)
  } catch {
    return { ...DEFAULT_PROFILE_FIELD_VISIBILITY }
  }
}

function canViewProfileField(field, visibility, isOwner) {
  return Boolean(isOwner) || visibility[field] === 'public'
}

function buildProfilePresentation({
  user,
  pii,
  profileFieldVisibility,
  isOwner = false,
  privatePreview = false,
}) {
  const visibility = getProfileFieldVisibility(profileFieldVisibility)
  const bio = typeof user?.bio === 'string' && user.bio.trim() ? user.bio.trim() : null

  return {
    displayName:
      !privatePreview && canViewProfileField('displayName', visibility, isOwner)
        ? typeof user?.displayName === 'string' && user.displayName.trim()
          ? user.displayName.trim()
          : null
        : null,
    bio,
    age:
      !privatePreview &&
      canViewProfileField('age', visibility, isOwner) &&
      Number.isInteger(pii?.age)
        ? pii.age
        : null,
    location:
      !privatePreview && canViewProfileField('location', visibility, isOwner)
        ? typeof pii?.location === 'string' && pii.location.trim()
          ? pii.location.trim()
          : null
        : null,
    profileLinks:
      !privatePreview && canViewProfileField('socialLinks', visibility, isOwner)
        ? normalizeProfileLinks(user?.profileLinks)
        : [],
    profileFieldVisibility: isOwner ? visibility : undefined,
  }
}

module.exports = {
  DEFAULT_PROFILE_FIELD_VISIBILITY,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_PROFILE_BIO_LENGTH,
  MAX_PROFILE_LOCATION_LENGTH,
  MAX_PROFILE_LINKS,
  MAX_PROFILE_LINK_LABEL_LENGTH,
  MAX_PROFILE_LINK_URL_LENGTH,
  PROFILE_FIELD_VISIBILITY_KEYS,
  PROFILE_FIELD_VISIBILITY_VALUES,
  sanitizeDisplayName,
  sanitizeBio,
  sanitizeLocation,
  sanitizeAge,
  sanitizeProfileLinks,
  sanitizeProfileFieldVisibility,
  normalizeProfileLinks,
  getProfileFieldVisibility,
  canViewProfileField,
  buildProfilePresentation,
}
