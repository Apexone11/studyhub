# Reference 18 — Frontend Security

## Files to Read

- `frontend/studyhub-app/src/lib/useFetch.js` — fetch hook
- `frontend/studyhub-app/src/pages/shared/pageUtils.js` — `authHeaders()`
- `frontend/studyhub-app/src/config.js` — `API` constant
- `frontend/studyhub-app/src/lib/useSocket.js` — socket connection
- Any component using `dangerouslySetInnerHTML`

---

## Check 18.1 — dangerouslySetInnerHTML Always Uses DOMPurify

**Rule per CLAUDE.md (anti-pattern):** `dangerouslySetInnerHTML` on user-generated content without DOMPurify is XSS. Every use must go through the sanitizer.

**Violation:**

```jsx
// WRONG
<div dangerouslySetInnerHTML={{ __html: post.body }} />
```

**Correct:**

```jsx
// CORRECT
import DOMPurify from 'dompurify'
;<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.body) }} />
```

**Grep for all usages:**

```
dangerouslySetInnerHTML
```

Every match must have `DOMPurify.sanitize(` wrapping the value.

---

## Check 18.2 — No eval, Function(), or setTimeout(string)

**Rule per CLAUDE.md (anti-pattern):** Code evaluation from strings is forbidden.

**Grep:**

```
eval\(|new Function\(|setTimeout\(['"]|setInterval\(['"]
```

Any match is CRITICAL unless it's in a comment or test that explicitly tests for its absence.

---

## Check 18.3 — JWT/Tokens Never in localStorage

**Rule per CLAUDE.md:** JWT and session tokens MUST be in HTTP-only cookies only. `localStorage` access for token storage is forbidden.

**Grep:**

```
localStorage.*token|localStorage.*jwt|localStorage.*session|localStorage\.setItem.*auth
```

**Violation:** `localStorage` tokens are accessible to any JavaScript (including XSS payloads). HTTP-only cookies are not.

---

## Check 18.4 — credentials: 'include' on All Auth Fetches

**Rule per CLAUDE.md (bug pattern #1):** Every fetch to an authenticated endpoint MUST include `credentials: 'include'`. Missing it causes silent 401s on split-origin deployments (beta stack, prod).

**Verify in `useFetch.js`:** The hook defaults to including credentials for authenticated calls.

**Grep for fetches missing credentials:**

```
fetch\(`\$\{API\}.*\`.*\n.*method.*\n(?!.*credentials)
```

Manual review: scan every `fetch(` call that hits `/api/` — verify `credentials: 'include'` is present.

---

## Check 18.5 — All API URLs Use ${API}/api/ Prefix

**Rule per CLAUDE.md (bug #1, historical):** The `API` constant is the backend origin only (e.g., `http://localhost:4000`). Every fetch must append `/api/` — forgetting causes 404 in production.

**Violation:**

```js
// WRONG — missing /api prefix
fetch(`${API}/users/${id}`)
```

**Correct:**

```js
// CORRECT
fetch(`${API}/api/users/${id}`, { credentials: 'include' })
```

**Grep for violations:**

```
\$\{API\}/(?!api/)
```

Each match must be verified — if it's not `/api/...`, it's likely a bug.

---

## Check 18.6 — useFetch transform Not in Dependency Array

**Rule per CLAUDE.md (bug pattern #9):** Inline `transform` functions passed to `useFetch` cause infinite re-renders if placed in `useEffect`/`useCallback` deps — the hook stores `transform` in a `useRef` to guard against this.

**Violation:**

```jsx
// WRONG — new function on each render causes infinite loop
const { data } = useFetch('/api/things', {
  transform: (raw) => raw.map((x) => ({ ...x, computed: compute(x) })),
})
// If `transform` is also in a useEffect dep array → infinite loop
```

**Correct:**

```jsx
// CORRECT — stable reference
const transform = useCallback((raw) => raw.map((x) => ({ ...x })), [])
const { data } = useFetch('/api/things', { transform })
```

Or verify the hook's `useRef` guard is in place so inline functions are safe.

---

## Check 18.7 — Modals Use createPortal Inside Animated Containers

**Rule per CLAUDE.md (bug pattern #7):** anime.js applies `transform` to parent elements. Any `position: fixed` element inside a transformed ancestor becomes positioned relative to that ancestor (not the viewport) → modal clips or misaligns.

**Fix:** All modals must use `createPortal(jsx, document.body)`.

**Grep:**

```
position.*fixed|ReactDOM\.createPortal
```

Find `position: fixed` CSS/inline — verify each modal is rendered via `createPortal`. Find `createPortal` usages — verify `document.body` is the target.

---

## Check 18.8 — No Emoji in UI Chrome

**Rule per CLAUDE.md:** Emoji forbidden in: buttons, headings, labels, toasts, modals, empty states, nav items, tab labels, placeholder text. Allowed only in user-generated content (posts, messages, notes, bios, comments).

**Grep for emoji in component files:**

```
[^\x00-\x7F]
```

in `src/components/` and `src/pages/` — scan for non-ASCII characters in JSX string literals that are UI chrome (not rendering user content).

---

## Check 18.9 — CSS Custom Property Tokens Used for Colors

**Rule per CLAUDE.md:** Inline style colors must use `var(--sh-*)` tokens. Raw hex codes and named colors are forbidden except for:

- `min-height` WCAG touch targets, border widths, icon sizes, focus-ring offsets
- `color: #ffffff` on `.btn--primary` and `.btn--danger`

**Grep for raw hex in inline styles:**

```
style=\{.*#[0-9a-fA-F]\{3,6\}
```

---

## Severity Reference for Frontend Security Issues

| Issue                                          | OWASP | Severity |
| ---------------------------------------------- | ----- | -------- |
| `dangerouslySetInnerHTML` without DOMPurify    | A03   | CRITICAL |
| `eval()` / `Function()` / `setTimeout(string)` | A03   | CRITICAL |
| Token in `localStorage`                        | A02   | CRITICAL |
| Missing `credentials: 'include'`               | A05   | HIGH     |
| Missing `/api/` prefix in fetch URL            | A05   | HIGH     |
| Modal not using `createPortal`                 | A05   | MEDIUM   |
| `useFetch` `transform` in dep array            | A05   | MEDIUM   |
| Emoji in UI chrome                             | —     | LOW      |
| Raw hex color in inline style                  | —     | LOW      |
