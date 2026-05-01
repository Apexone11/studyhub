/**
 * legalVersions.js -- Legal document version constants.
 *
 * Bump CURRENT_LEGAL_VERSION when required signup documents are updated.
 *
 * MUST stay in sync with the backend's CURRENT_LEGAL_VERSION (currently
 * declared in backend/src/modules/legal/legal.seed.js). A mismatch causes
 * the Google-OAuth role-picker submit to be rejected with "Please review
 * and accept the latest StudyHub legal documents before continuing." The
 * 2026-04-08 bump on 2026-04-30 closes a 4-day drift that broke onboarding.
 *
 * The Termly embed UUIDs and policy-base URL were removed 2026-04-30
 * along with the iframe-based fallback in `LegalDocumentPage.jsx`. All
 * legal docs now render exclusively from the self-hosted bodyText
 * seeded by `backend/src/modules/legal/content/*.txt`.
 */

export const CURRENT_LEGAL_VERSION = '2026-04-08'
export const CURRENT_TERMS_VERSION = CURRENT_LEGAL_VERSION
export const LEGAL_REQUIRED_SIGNUP_SLUGS = ['terms', 'privacy', 'guidelines']
export const LEGAL_DOCUMENT_LABELS = {
  terms: 'Terms of Use',
  privacy: 'Privacy Policy',
  cookies: 'Cookie Policy',
  guidelines: 'Community Guidelines',
  disclaimer: 'Disclaimer',
}

/**
 * In-app routes that render the self-hosted legal pages. Replaces the
 * old Termly external URLs. Consumers that need a link to "open the
 * Terms / Privacy / Cookie Policy" should point users at these routes
 * — same domain, no third-party embed.
 */
export const POLICY_URLS = {
  terms: '/terms',
  privacy: '/privacy',
  cookies: '/cookies',
  disclaimer: '/disclaimer',
  guidelines: '/guidelines',
}
