/**
 * legalVersions.js -- Legal document version constants.
 *
 * Bump CURRENT_TERMS_VERSION when terms are updated.
 * The app compares this against the user's termsAcceptedVersion
 * to determine if re-acceptance is needed.
 */

export const CURRENT_TERMS_VERSION = '2026-04-04'

export const TERMLY_UUIDS = {
  privacy: 'af795fa7-a5b0-41e4-b342-8797a0194d55',
  cookies: '49c5d88c-ee36-4bbb-bde7-6c641a540268',
  terms: '84ea6e72-ac97-4827-ba6d-c34900aea542',
  disclaimer: '55c02c39-21be-41cf-a1aa-a8ae0181e69b',
  dsar: 'af795fa7-a3b0-41e4-b342-8797a0194d55',
}

export const TERMLY_POLICY_BASE = 'https://app.termly.io/policy-viewer/policy.html?policyUUID='
export const TERMLY_DSAR_URL = `https://app.termly.io/dsar/${TERMLY_UUIDS.dsar}`

export const POLICY_URLS = {
  terms: `${TERMLY_POLICY_BASE}${TERMLY_UUIDS.terms}`,
  privacy: `${TERMLY_POLICY_BASE}${TERMLY_UUIDS.privacy}`,
  cookies: `${TERMLY_POLICY_BASE}${TERMLY_UUIDS.cookies}`,
  disclaimer: `${TERMLY_POLICY_BASE}${TERMLY_UUIDS.disclaimer}`,
}
