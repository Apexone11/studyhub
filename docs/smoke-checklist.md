# StudyHub Release Smoke Checklist

Target: <10 minutes, covers all critical flows. Run on Railway staging or prod after every deploy.

## 1. Signup (email)
- [ ] Navigate to `/register`
- [ ] Fill Account step (username, email, password)
- [ ] Receive verification code (check Resend dashboard if email slow)
- [ ] Enter code on Verify step
- [ ] Redirected to home/feed with session active
- [ ] Sidebar shows username, "Student" role label

## 2. Signup (Google)
- [ ] Click "Sign in with Google" on `/register`
- [ ] Complete Google consent
- [ ] Redirected to home/feed with session active (no course selection step)
- [ ] Profile has Google avatar

## 3. .edu suggestion banner
- [ ] Sign up with a `.edu` email address
- [ ] On `/feed`, suggestion banner appears with matching school
- [ ] Dismiss banner — stays dismissed on reload
- [ ] Sign up with non-.edu email — no suggestion banner appears

## 4. /my-courses
- [ ] Navigate to `/my-courses` from sidebar
- [ ] School search filters list correctly
- [ ] SchoolLogoCard shows logo (if uploaded) or monogram fallback
- [ ] Select a school — course list populates
- [ ] Department filter chips work
- [ ] Course search filters within selected school
- [ ] Add courses — preview panel updates with selections
- [ ] Save — success toast, sidebar course list updates
- [ ] Mobile: page collapses to single column, preview panel below

## 5. Cover image
- [ ] Go to Settings > Profile tab
- [ ] Upload a cover image
- [ ] Navigate to own profile — cover displays correctly
- [ ] Cover persists after page reload
- [ ] If cover removed/missing — fallback gradient shows (no broken image)

## 6. SheetLab: fork + edit + contribute
- [ ] View someone else's published sheet
- [ ] Click "Make your own copy"
- [ ] Redirected to `/sheets/{newId}/lab`
- [ ] Make edits in editor, save changes
- [ ] Click "Contribute Back" — modal opens, submit
- [ ] Original sheet owner sees contribution (or admin review queue gets entry)

## 7. Admin approve/reject
- [ ] Log in as admin, go to `/admin`
- [ ] Navigate to "Sheet Reviews" tab
- [ ] Approve a pending sheet — success toast, list refreshes
- [ ] Reject a sheet with reason — success toast, list refreshes
- [ ] No silent failures on any admin action

## 8. Google OAuth (regression)
- [ ] Open incognito/private window
- [ ] Log in with Google on `/login`
- [ ] Consent screen shows correct app name + scopes (email, profile only)
- [ ] Redirected with session active
- [ ] Settings > Security shows Google linked

## 9. Quick sanity checks
- [ ] `/sheets` — search works, filters work
- [ ] Global search modal (Ctrl+K) — finds sheets, courses, users
- [ ] Profile visibility — private profiles show "Profile not available" to non-classmates
- [ ] `/api/courses/popular` returns 200 (not 500)

---

**Last run:** _(date + result)_
**Runner:** _(name)_
