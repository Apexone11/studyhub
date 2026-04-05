# StudyHub Legal Integration Plan

Date: April 4, 2026
Purpose: Integrate Termly-hosted legal policies into the StudyHub frontend and upgrade the registration/settings experience for legal compliance.

---

## Termly Details

- Website UUID: `f44c5c0c-a4fc-4ca4-980b-89068e5aeb41`
- Consent Banner Script: `<script type="text/javascript" src="https://app.termly.io/resource-blocker/f44c5c0c-a4fc-4ca4-980b-89068e5aeb41?autoBlock=on"></script>`
- Preference Center Link: `<a href="#" class="termly-display-preferences">Consent Preferences</a>`

### Hosted Policy URLs (Termly URL format, auto-updated by Termly's attorneys)

| Policy | URL |
|---|---|
| Privacy Policy | `https://app.termly.io/policy-viewer/policy.html?policyUUID=af795fa7-a5b0-41e4-b342-8797a0194d55` |
| Cookie Policy | `https://app.termly.io/policy-viewer/policy.html?policyUUID=49c5d88c-ee36-4bbb-bde7-6c641a540268` |
| Terms and Conditions | `https://app.termly.io/policy-viewer/policy.html?policyUUID=84ea6e72-ac97-4827-ba6d-c34900aea542` |
| Disclaimer | `https://app.termly.io/policy-viewer/policy.html?policyUUID=55c02c39-21be-41cf-a1aa-a8ae0181e69b` |

---

## Part 1: Registration Page Overhaul

### Current State
- File: `frontend/studyhub-app/src/pages/auth/RegisterStepFields.jsx` (lines 176-186)
- Single checkbox: "I agree to the Terms of Use and Community Guidelines" with plain `<Link>` elements
- Validation in `registerConstants.js` checks `form.termsAccepted` boolean

### New Behavior

Replace the simple checkbox with an interactive legal acceptance flow:

1. The checkbox text should read: "I agree to the Terms of Use, Privacy Policy, and Community Guidelines"
2. When the user clicks the checkbox (or taps the linked text), instead of just toggling, open a **Legal Acceptance Modal** (use `createPortal` to `document.body` per CLAUDE.md -- the register card has `fadeInUp` animation which breaks fixed positioning)
3. The modal contains:
   - A tab bar at the top with three tabs: "Terms of Use", "Privacy Policy", "Community Guidelines"
   - Each tab loads the respective legal document content in a scrollable container
   - The container must be scrolled to the bottom before the "Accept" button becomes enabled (track scroll position with `onScroll` handler checking `scrollTop + clientHeight >= scrollHeight - 20`)
   - A scroll progress indicator (subtle bar or percentage) so users know how far they are
   - Two buttons at the bottom: "Accept" (primary, disabled until scrolled) and "Decline" (secondary)
4. If user clicks "Accept" after scrolling all three documents (track per-tab scroll completion), the checkbox becomes checked and `form.termsAccepted` is set to `true`
5. If user clicks "Decline", the modal closes, the checkbox stays unchecked, and a brief toast or inline message says: "You must accept the Terms of Use, Privacy Policy, and Community Guidelines to create an account."
6. The checkbox should not be directly togglable -- clicking it always opens the modal. If already accepted, clicking it should re-open the modal (allowing re-reading) but keep the accepted state.
7. Store a `termsVersion` field (e.g., `"2026-04-04"`) alongside `termsAccepted` -- send this to the backend on registration so the database records which version of terms the user accepted.

### Implementation Notes
- Create new component: `frontend/studyhub-app/src/pages/auth/LegalAcceptanceModal.jsx`
- Use CSS custom property tokens from `index.css` for all colors (per CLAUDE.md rules)
- The modal should have a max-height of about 70vh with the document content scrollable inside
- Use smooth, clean styling consistent with the existing register page design (Plus Jakarta Sans, card-based layout)
- Tab content can either embed the Termly iframe URLs OR display the existing hardcoded legal content from `TermsPage.jsx`, `PrivacyPage.jsx`, and `GuidelinesPage.jsx`. Recommendation: reuse the existing JSX content from those pages (extract the content into shared components) so it renders natively and matches the app style, rather than embedding an iframe.

### Backend Changes
- Add `termsAcceptedVersion` (String, nullable) field to the User model in `schema.prisma`
- Create migration for the new field
- Update the registration endpoint to accept and store `termsVersion`
- Add an API endpoint `GET /api/users/me/terms-status` that returns the user's accepted terms version
- Add an API endpoint `POST /api/users/me/terms-accept` that records acceptance of a new terms version (for re-acceptance after policy updates)

---

## Part 2: Settings Page -- New "Legal" Tab

### Current State
- File: `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx`
- 8 tabs defined in `NAV_TABS` array (lines 30-39): Profile, Security, Notifications, Privacy, Appearance, Account, Subscription, Moderation

### New Behavior

Add a 9th tab: **"Legal"** (insert between "Subscription" and "Moderation" in the NAV_TABS array)

Create `frontend/studyhub-app/src/pages/settings/LegalTab.jsx` with:

1. A card-based layout showing all four legal documents:
   - Terms of Use (with "Last accepted: [date]" badge)
   - Privacy Policy
   - Cookie Policy
   - Disclaimer
   - Community Guidelines

2. Each card has:
   - Document title
   - "Last updated: [date]" subtitle (from Termly's publish date)
   - "Read Document" button that opens an in-app modal with the full document content (scrollable)
   - For Terms of Use specifically: show whether the user has accepted the current version, and if a newer version exists, show an "Updated -- Review and Accept" badge/button that triggers the same scroll-to-accept flow from registration

3. At the bottom, include:
   - "Consent Preferences" button that triggers Termly's preference center (`class="termly-display-preferences"`)
   - Link to the DSAR form (data subject access request) if Termly provides one, or a mailto link to `privacy@getstudyhub.org`

4. If the user's `termsAcceptedVersion` is older than the current terms version, show a banner at the top of the Legal tab: "Our Terms of Use have been updated. Please review and accept the new terms to continue using all features."

### Re-acceptance Flow for Policy Updates
- When terms are updated, bump the `CURRENT_TERMS_VERSION` constant in a shared config file (e.g., `frontend/studyhub-app/src/lib/legalVersions.js`)
- On app load (in the session context or a top-level effect), compare the user's `termsAcceptedVersion` with `CURRENT_TERMS_VERSION`
- If outdated, show a non-dismissible banner across the app (similar to email verification reminders) linking to Settings > Legal
- The user must scroll through and accept the updated terms to dismiss the banner
- The backend `POST /api/users/me/terms-accept` endpoint records the new version

---

## Part 3: Update Legal Pages (Terms, Privacy, Guidelines, + New Pages)

### Current State
- `frontend/studyhub-app/src/pages/legal/TermsPage.jsx` -- hardcoded Terms of Use (March 2026)
- `frontend/studyhub-app/src/pages/legal/PrivacyPage.jsx` -- hardcoded Privacy Policy (March 2026)
- `frontend/studyhub-app/src/pages/legal/GuidelinesPage.jsx` -- hardcoded Community Guidelines (March 2026)
- All use `LegalPageLayout` wrapper with `LegalSection` components
- `LegalPageLayout.jsx` has a `RELATED_LINKS` array linking to `/terms`, `/privacy`, `/guidelines`
- Footer in layout: "StudyHub - Built by students, for students"

### Changes

#### A. Update `RELATED_LINKS` in `LegalPageLayout.jsx`
Add the new pages to the sidebar navigation:
```js
const RELATED_LINKS = [
  { label: 'Terms of Use', to: '/terms' },
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Cookie Policy', to: '/cookies' },
  { label: 'Community Guidelines', to: '/guidelines' },
  { label: 'Disclaimer', to: '/disclaimer' },
]
```

#### B. Update existing pages with Termly content
The existing hardcoded content in `TermsPage.jsx`, `PrivacyPage.jsx`, and `GuidelinesPage.jsx` was written before the Termly policies were generated. Two approaches (choose one):

**Option A (Recommended): Hybrid approach**
- Keep the existing hardcoded pages as-is for Community Guidelines (Termly doesn't generate these -- they're StudyHub-specific)
- For Terms, Privacy, and Disclaimer: either embed the Termly content via iframe or replace the hardcoded content with the Termly-generated content
- Add a "View full legal document" link at the top that opens the Termly hosted URL in a new tab

**Option B: Iframe embed**
- Replace the `<article>` content area with an iframe pointing to the Termly hosted URL
- Keeps content always in sync with Termly
- Downside: styling mismatch, slower load, doesn't match app design

**Recommendation: Go with Option A.** Keep the native-rendered pages for the best user experience. When terms are updated in Termly, manually sync the key changes to the JSX files. The Termly hosted URLs serve as the canonical/legally-binding versions, linked from the footer.

#### C. Create new pages

1. **CookiePolicyPage.jsx** at route `/cookies`
   - Use `LegalPageLayout` with `tone="green"` or similar
   - Can embed the Termly cookie policy via iframe since cookie policies are fairly standard: `<iframe src="https://app.termly.io/policy-viewer/policy.html?policyUUID=49c5d88c-ee36-4bbb-bde7-6c641a540268" style={{ width: '100%', height: '600px', border: 'none' }} />`
   - OR create a simpler page that just explains "We use cookies" with a link to the full Termly cookie policy

2. **DisclaimerPage.jsx** at route `/disclaimer`
   - Use `LegalPageLayout` with `tone="amber"` or similar
   - Similar approach: either embed Termly iframe or create native content based on the Termly disclaimer

#### D. Add routes in `App.jsx`
```jsx
// Add alongside existing legal routes (around line 327-329)
<Route path="/cookies" element={<CookiePolicyPage />} />
<Route path="/disclaimer" element={<DisclaimerPage />} />
```

#### E. Update the legal page footer
In `LegalPageLayout.jsx`, update the footer to include policy links and the Termly consent preferences trigger:
```jsx
<footer className="legal-footer">
  <span className="legal-footer-brand">StudyHub</span>
  <span className="legal-footer-divider">·</span>
  <span>Built by students, for students</span>
  <div className="legal-footer-links">
    <Link to="/terms">Terms</Link>
    <Link to="/privacy">Privacy</Link>
    <Link to="/cookies">Cookies</Link>
    <Link to="/guidelines">Guidelines</Link>
    <Link to="/disclaimer">Disclaimer</Link>
    <Link to="/data-request">Data Request</Link>
    <a href="#" className="termly-display-preferences">Consent Preferences</a>
  </div>
</footer>
```

---

## Part 4: Consent Banner Integration

### Install the Termly consent banner script

In `frontend/studyhub-app/index.html`, add the Termly script tag in the `<head>` section BEFORE any other scripts:

```html
<script type="text/javascript" src="https://app.termly.io/resource-blocker/f44c5c0c-a4fc-4ca4-980b-89068e5aeb41?autoBlock=on"></script>
```

This will automatically:
- Show a cookie consent banner to new visitors
- Block non-essential cookies until consent is given
- Remember consent preferences

### Preference Center Link
Add the preference center link in:
1. The legal page footer (Part 3E above)
2. The Settings > Legal tab (Part 2)
3. Any main app footer if one is created

The link markup: `<a href="#" className="termly-display-preferences">Consent Preferences</a>`

Note: Since this is a class-based trigger, it works with Termly's JavaScript. In React, use `onClick={(e) => e.preventDefault()}` if the `#` href causes scroll-to-top issues, or just let Termly's script handle it.

---

## Part 4B: DSAR (Data Subject Access Request) Form

### What is it?
Termly provides a DSAR form that allows users to formally request access to, deletion of, or changes to their personal data. This is required under GDPR, CCPA, and several other US state privacy laws.

### Embed Method
Use the HTML iframe embed from Termly. The iframe code (from the Termly DSAR Form page, HTML tab):

```html
<iframe
  src="https://app.termly.io/dsar/af795fa7-a3b0-41e4-b342-8797a0194d55"
  style="width: 100%; height: 600px; border: none;"
  title="Data Subject Access Request Form"
/>
```

### DSAR Settings (already configured in Termly)
The right sidebar on the Termly DSAR page shows these are all set to "Yes":
- GDPR compliance
- Personal info for direct marketing
- CCPA compliance
- CPA (Colorado), CTDPA (Connecticut), VCDPA (Virginia), UCPA (Utah) compliance
- "Do you sell personal information to third parties?" set to "No"

### Integration Points

1. **New page: `DataRequestPage.jsx`** at route `/data-request`
   - Use `LegalPageLayout` with `tone="purple"` or similar
   - Title: "Data Request"
   - Summary: "Submit a request to access, modify, or delete your personal data."
   - Content area: embed the Termly DSAR iframe
   - Add brief explainer text above the iframe: "Under privacy laws including CCPA and GDPR, you have the right to request access to your personal data, ask for corrections, or request deletion. Use the form below to submit your request. We will respond within 24 hours."

2. **Settings > Legal tab** (Part 2)
   - Add a "Data Request" card alongside the policy documents
   - Card description: "Request access to, correction of, or deletion of your personal data"
   - Button: "Submit Data Request" that links to `/data-request`

3. **Settings > Account tab**
   - In the existing account deletion/data section (if one exists), add a link: "Want to request your data or delete your account? Submit a Data Request"
   - Links to `/data-request`

4. **Legal page footer and App footer**
   - Add "Data Request" link alongside the other legal links

5. **Privacy Policy page**
   - In the "User Rights" or contact section, add a link to `/data-request`: "To exercise your privacy rights, submit a request through our Data Request form."

### Route
Add to `App.jsx`:
```jsx
<Route path="/data-request" element={<DataRequestPage />} />
```

### Update `RELATED_LINKS` in `LegalPageLayout.jsx`
```js
const RELATED_LINKS = [
  { label: 'Terms of Use', to: '/terms' },
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Cookie Policy', to: '/cookies' },
  { label: 'Community Guidelines', to: '/guidelines' },
  { label: 'Disclaimer', to: '/disclaimer' },
  { label: 'Data Request', to: '/data-request' },
]
```

---

## Part 5: Global App Footer (New Component)

### Current State
No global footer exists. Legal pages have their own footer in `LegalPageLayout.jsx`, but authenticated app pages (dashboard, sheets, feed, etc.) have no footer.

### New Component
Create `frontend/studyhub-app/src/components/AppFooter.jsx`:

- Minimal, unobtrusive footer at the bottom of authenticated pages
- Contains: copyright line, links to Terms, Privacy, Cookies, Guidelines, Disclaimer, Data Request, Consent Preferences
- Style: subtle text, `var(--sh-slate-400)` color, small font size
- Add this component to the main layout used by authenticated pages (or to individual pages that would benefit from it -- at minimum, the landing/home page)

---

## Part 6: Database Changes

### New Prisma field
In `backend/prisma/schema.prisma`, add to the `User` model:
```prisma
termsAcceptedVersion String?
termsAcceptedAt      DateTime?
```

### Migration
Create `backend/prisma/migrations/YYYYMMDDHHMMSS_add_terms_acceptance_tracking/migration.sql`:
```sql
ALTER TABLE "User" ADD COLUMN "termsAcceptedVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
```

### New API endpoints
In `backend/src/modules/users/` (or a new `backend/src/modules/legal/` module):

1. `GET /api/users/me/terms-status` -- Returns `{ acceptedVersion, acceptedAt, currentVersion }`
2. `POST /api/users/me/terms-accept` -- Body: `{ version }` -- Records acceptance, returns updated status
3. Update the registration endpoint to accept `termsVersion` in the request body and store it

---

## Summary Checklist

### Registration
- [ ] Replace simple checkbox with modal-based legal acceptance flow
- [ ] Create `LegalAcceptanceModal.jsx` component with tabbed document viewer
- [ ] Require scroll-to-bottom on each document tab before enabling Accept
- [ ] Send `termsVersion` to backend on registration
- [ ] Show clear message if user declines

### Settings
- [ ] Add "Legal" tab (9th tab) to SettingsPage
- [ ] Create `LegalTab.jsx` with document cards
- [ ] Show terms acceptance status and version
- [ ] Include Consent Preferences button
- [ ] Show update banner if terms version is outdated

### Legal Pages
- [ ] Update `RELATED_LINKS` in `LegalPageLayout.jsx` to include all 6 pages (+ Data Request)
- [ ] Create `CookiePolicyPage.jsx` at `/cookies`
- [ ] Create `DisclaimerPage.jsx` at `/disclaimer`
- [ ] Create `DataRequestPage.jsx` at `/data-request` with Termly DSAR iframe
- [ ] Add routes in `App.jsx`
- [ ] Update legal page footer with all links + Consent Preferences

### DSAR Form
- [ ] Embed Termly DSAR iframe in `DataRequestPage.jsx`
- [ ] Add "Data Request" card to Settings > Legal tab
- [ ] Add "Data Request" link to Settings > Account tab
- [ ] Add link in Privacy Policy page user rights section

### Consent Banner
- [ ] Add Termly script to `index.html` head
- [ ] Add preference center links in footer and settings
- [ ] Test that the banner appears for new visitors

### Backend
- [ ] Add `termsAcceptedVersion` and `termsAcceptedAt` to User model
- [ ] Create migration SQL
- [ ] Add `/api/users/me/terms-status` endpoint
- [ ] Add `/api/users/me/terms-accept` endpoint
- [ ] Update registration endpoint to store terms version

### App-wide
- [ ] Create `legalVersions.js` constants file with `CURRENT_TERMS_VERSION`
- [ ] Add terms-outdated banner to app shell (similar to email verification banner)
- [ ] Create `AppFooter.jsx` for authenticated pages
- [ ] Re-run Termly site scan after consent banner is installed

---

## File Map (New and Modified Files)

### New Files
- `frontend/studyhub-app/src/pages/auth/LegalAcceptanceModal.jsx`
- `frontend/studyhub-app/src/pages/settings/LegalTab.jsx`
- `frontend/studyhub-app/src/pages/legal/CookiePolicyPage.jsx`
- `frontend/studyhub-app/src/pages/legal/DisclaimerPage.jsx`
- `frontend/studyhub-app/src/pages/legal/DataRequestPage.jsx`
- `frontend/studyhub-app/src/components/AppFooter.jsx`
- `frontend/studyhub-app/src/lib/legalVersions.js`
- `backend/prisma/migrations/YYYYMMDDHHMMSS_add_terms_acceptance_tracking/migration.sql`
- `backend/src/modules/legal/` (routes, controller, service) OR add endpoints to existing users module

### Modified Files
- `frontend/studyhub-app/index.html` -- Add Termly script tag
- `frontend/studyhub-app/src/App.jsx` -- Add `/cookies`, `/disclaimer`, and `/data-request` routes
- `frontend/studyhub-app/src/pages/auth/RegisterStepFields.jsx` -- Replace checkbox with modal trigger
- `frontend/studyhub-app/src/pages/auth/registerConstants.js` -- Update validation
- `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx` -- Add Legal tab
- `frontend/studyhub-app/src/components/LegalPageLayout.jsx` -- Update RELATED_LINKS and footer
- `backend/prisma/schema.prisma` -- Add terms fields to User model
- `backend/src/modules/users/users.routes.js` or new legal module -- New endpoints
