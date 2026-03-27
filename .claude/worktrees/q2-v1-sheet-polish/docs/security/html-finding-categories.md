# HTML Security Finding Categories

Reference for all finding categories emitted by the StudyHub HTML security scanner.

Each category groups related findings under a human-readable label. The scanner assigns a severity per finding and the risk classifier uses the combined findings to determine the sheet's risk tier.

---

## Tier 0 → 1 Categories (Feature Detection)

These categories are detected by `detectHtmlFeatures()`. Their presence alone escalates a sheet from Tier 0 (Clean) to Tier 1 (Flagged).

### `suspicious-tag` — Suspicious Tags

| Severity | Trigger |
|----------|---------|
| medium | HTML contains `<script>`, `<iframe>`, `<object>`, `<embed>`, `<meta>`, `<base>`, or `<form>` tags |

These tags are common in interactive HTML but can also be used for malicious purposes. Tier 1 sheets are published with a warning badge and scripts disabled in preview.

### `inline-handler` — Inline Event Handlers

| Severity | Trigger |
|----------|---------|
| medium | HTML contains `on*=` attributes (`onclick`, `onload`, `onerror`, `onmouseover`, etc.) |

Inline event handlers can execute JavaScript without `<script>` tags. Detected via regex across all HTML attributes.

### `dangerous-url` — Dangerous URLs

| Severity | Trigger |
|----------|---------|
| medium | `href` or `src` attributes contain `javascript:`, `vbscript:`, or `data:` URL schemes |

These URL schemes can execute code when a user clicks a link or when a resource loads.

### `validation` — Structural Issues

| Severity | Trigger |
|----------|---------|
| high | Empty HTML content or content exceeding 350,000 characters |

Validation-only findings (no other categories present) result in Tier 1.

---

## Tier 2 Categories (Behavioral Analysis)

These categories are detected by `detectHighRiskBehaviors()` and `scanInlineJsRisk()`. Their presence escalates a sheet to Tier 2 (High Risk), routing it to the admin review queue.

### `js-risk` — Risky JavaScript

| Severity | Trigger |
|----------|---------|
| high | Inline scripts containing network APIs or eval/obfuscation patterns |

**Network patterns:** `fetch()`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon()`, `EventSource`, `importScripts()`

**Eval/obfuscation patterns:** `eval()`, `Function()` constructor, `setTimeout`/`setInterval` with string args, `atob()`, hex escapes (`\x`), unicode obfuscation (`\u00`), `document.cookie`, `document.domain`

### `obfuscation` — Code Obfuscation

| Severity | Trigger |
|----------|---------|
| high | 3+ `String.fromCharCode` calls OR 10+ total hex/unicode escape sequences (`\x`, `\u`) |

Heavy obfuscation is a strong signal of intentionally hidden behavior. Often combined with other malicious categories.

### `redirect` — Page Redirects

| Severity | Trigger |
|----------|---------|
| high | `window.location` assignment patterns: `.href=`, `.replace()`, `.assign()`, or direct assignment |

Redirects can send users to phishing pages or malicious external sites.

### `exfiltration` — Data Exfiltration

| Severity | Trigger |
|----------|---------|
| high | `<form>` element with external `action=` URL (http/https) |

Forms that submit data to external domains can capture user input without consent.

### `keylogging` — Keylogging

| Severity | Trigger |
|----------|---------|
| high | Key event listener (`keydown`, `keypress`, `keyup`) combined with storage/network API (`localStorage`, `fetch`, `XMLHttpRequest`, `sendBeacon`) |

Both conditions must be present — a key listener alone is insufficient. The combination suggests keystroke capture and exfiltration.

### `crypto-miner` — Crypto Mining

| Severity | Trigger |
|----------|---------|
| high | Known miner signatures (`CryptoNight`, `coinhive`, `coin-hive`, `jsecoin`) OR `WebAssembly.instantiate` combined with mining keywords (`hash`, `nonce`, `mining`, `worker`) |

Crypto mining consumes user device resources without consent. When combined with obfuscation, escalates to Tier 3.

---

## Tier 3 Triggers (Quarantine)

These conditions escalate a sheet to Tier 3 (Quarantined). Preview is disabled and only admins can access the content.

### `credential-capture` — Credential Capture

| Severity | Trigger |
|----------|---------|
| **critical** | External form (`action=http/https`) with password or sensitive input fields (`type=password`, or name matching `password`, `credit`, `card`, `ssn`, `cvv`, `pin`, `secret`, `token`) |

This is the only category that can independently trigger Tier 3 via its `critical` severity.

### Compound Tier 3 Triggers

| Condition | Result |
|-----------|--------|
| Any `critical` severity finding | Tier 3 |
| 3+ distinct high-severity behavior categories | Tier 3 |
| `crypto-miner` + `obfuscation` detected together | Tier 3 |

---

## Special Categories

### `av` — Antivirus Detection

| Severity | Trigger |
|----------|---------|
| critical | ClamAV or future AV engine flags the content |

Reserved for future AV/CDR pipeline integration. When triggered, always Tier 3.

### `system` — System

| Severity | Trigger |
|----------|---------|
| varies | Internal scanner errors or system-level events |

Catch-all for unexpected conditions. Should not appear in normal operation.

---

## Severity Scale

| Severity | Color | Meaning |
|----------|-------|---------|
| critical | Red | Active threat — immediate quarantine |
| high | Red | Dangerous pattern — requires admin review |
| medium | Amber | Suspicious feature — published with warning |

---

## Source Files

- `CATEGORY_LABELS`: `backend/src/lib/htmlSecurityScanner.js` (lines 240–254)
- `detectHtmlFeatures`: `backend/src/lib/htmlSecurityScanner.js`
- `detectHighRiskBehaviors`: `backend/src/lib/htmlSecurityScanner.js`
- `scanInlineJsRisk`: `backend/src/lib/htmlSecurityRules.js`
- `classifyHtmlRisk`: `backend/src/lib/htmlSecurityScanner.js`
- `generateRiskSummary` / `generateTierExplanation`: `backend/src/lib/htmlSecurityScanner.js`
