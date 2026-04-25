# Reference 19 — Supply Chain Security

## Files to Read

- `backend/package.json` — backend dependencies
- `frontend/studyhub-app/package.json` — frontend dependencies
- `CLAUDE.md` §Active Design Refresh Cycle — v2.1 dependency exception rules
- `docs/internal/beta-v2.0.0-release-log.md` — dependency change log

---

## Check 19.1 — npm audit: No HIGH or CRITICAL Vulnerabilities

**Rule:** Run `npm audit` in both workspaces. Any HIGH or CRITICAL finding is a finding.

**Commands:**

```sh
npm --prefix backend audit --audit-level=high
npm --prefix frontend/studyhub-app audit --audit-level=high
```

**Output:** Report all CVEs with severity ≥ HIGH. Include package name, CVE ID, affected version range, and fix version.

---

## Check 19.2 — No Inline postinstall Scripts in New Dependencies

**Rule per CLAUDE.md (forbidden without founder approval):** New dependencies that pull native binaries or postinstall scripts are explicitly forbidden.

**Audit method:**

```sh
npm --prefix backend ls --depth=1 --parseable | xargs -I{} cat {}/package.json 2>/dev/null | grep -l '"postinstall"'
```

Or check `node_modules/<new_package>/package.json` for `scripts.postinstall`.

**High-risk packages:** `sharp`, `canvas`, `puppeteer`, `playwright`, `bcrypt` (native bindings), Capacitor plugins.

---

## Check 19.3 — Dependency Changes Follow CLAUDE.md v2.1 Exception Rules

**Rule per CLAUDE.md:** New dependencies require founder approval except in narrow exception cases.

**Founder-approval required for (flag as HIGH if violated):**

- Major version bumps: React, React Router, Vite, Prisma, Express, Socket.io, any auth/crypto library
- Replacing an existing library with a competitor
- Any package that pulls native binaries or postinstall scripts
- Runtime deps for developer-experience only

**v2.1 exception criteria (verify all are met):**

1. One dependency added at a time
2. Pinned to `~` or `^` range matching repo styling
3. Both `package.json` AND `package-lock.json` updated in same commit
4. No transitive helpers added alongside
5. Logged in `docs/internal/beta-v2.0.0-release-log.md` under `### Dependency changes` with: date, package name + version, why no existing dep solved the need, rollback plan

**Remediation order (check this was followed):**

1. Already in `package.json`? → `npm install` only (no approval needed)
2. <50 LOC of library use AND first-party API exists? → rewrite inline (no new dep)
3. Only viable path? → exception checklist above

---

## Check 19.4 — Lock File Not Hand-Edited

**Rule per CLAUDE.md:** `package-lock.json` must only be regenerated via `npm install`, never hand-edited.

**Audit method:** Review git diff on `package-lock.json` — if `package.json` was not changed in the same commit but `package-lock.json` was, this is suspicious. If individual dependency entries appear to be tweaked (not wholesale regenerated), flag it.

---

## Check 19.5 — Subresource Integrity on External CDN Resources

**Rule:** If any `<script>` or `<link>` tags load from a CDN (not bundled by Vite), they must include `integrity` and `crossorigin` attributes.

**Grep in frontend HTML files:**

```
<script.*src=.*cdn|<link.*href=.*cdn
```

**Expected for any CDN resource:**

```html
<script
  src="https://cdn.example.com/lib.min.js"
  integrity="sha384-..."
  crossorigin="anonymous"
></script>
```

**StudyHub context:** Vite bundles all dependencies — CDN loading should be rare. Any match warrants close inspection.

---

## Check 19.6 — No Direct GitHub/Raw URL Imports

**Rule:** Dependencies must come from the npm registry, not raw GitHub URLs or raw file URLs. GitHub URLs bypass audit, can change silently, and are not version-pinned.

**Grep `package.json` for:**

```
"github:|"https://|"git+|"file:
```

Any match is a finding unless it's a known internal package (e.g., `file:../../package/`).

---

## Severity Reference for Supply Chain Issues

| Issue                                               | OWASP | Severity |
| --------------------------------------------------- | ----- | -------- |
| npm audit: CRITICAL vulnerability in production dep | A06   | CRITICAL |
| npm audit: HIGH vulnerability in production dep     | A06   | HIGH     |
| Major version bump without founder approval         | A06   | HIGH     |
| New dep with postinstall/native binaries            | A06   | HIGH     |
| Dep added without v2.1 exception checklist          | A06   | MEDIUM   |
| `package-lock.json` hand-edited                     | A06   | MEDIUM   |
| CDN resource without SRI                            | A08   | MEDIUM   |
| GitHub URL dependency                               | A06   | MEDIUM   |
| Dep change not logged in release log                | —     | LOW      |
