# Phase 3 — Sheet Lab Editor Toggle (Rich Text ↔ HTML/Code)

**Target repo:** `studyhub`
**Author:** Planning handoff from Cowork Claude to VS Code Claude
**Goal:** Let authors switch freely between a Rich Text WYSIWYG editor and an HTML/Code editor with live preview, inside a single sheet, with no data loss for round-trips that stay in HTML-space, clear warnings when they don't, and the chosen format persisted via the existing `contentFormat` column.
**Prereqs:** Phase 1 is merged (fork UX, legal docs, Publish→Contribute rename). Phase 2 (fork & contribute end to end) does not need to be merged first; Phase 3 only touches `SheetLabEditor.jsx` and two new files.

Read `CLAUDE.md` before starting. Follow its rules on file splitting (components in `.jsx`, constants in `.js`), CSS custom property tokens, no emojis, modals via `createPortal`, the `/api` prefix, and the Prisma 6 null syntax. This phase has no backend schema changes, but the backend already validates `contentFormat` so you do not need to touch it.

---

## The problem this phase solves

Today's `SheetLabEditor.jsx` has three formats (`markdown`, `html`, `richtext`) but treats Rich Text as a one-way upgrade — once a sheet is in `richtext` mode there is no way to drop to HTML/code mode to hand-write markup, preview it, or fix something the WYSIWYG toolbar cannot express. This is the regression you have been working around.

The flow users want, modeled after Notion's "Toggle code view" and VS Code's WYSIWYG extensions:

1. Author starts in Rich Text and writes normally.
2. Author hits `Switch to HTML` — the TipTap document is serialized to sanitized HTML and displayed in a code editor with syntax highlighting and a live preview pane on the right.
3. Author edits the HTML directly (adds a `<table>`, tweaks an inline `<style>` block, drops in a math equation, whatever).
4. Author hits `Switch to Rich Text` — the HTML is parsed by TipTap. If the HTML contains constructs TipTap cannot represent (e.g., `<script>`, complex `<iframe>`, unknown attributes), show a confirmation modal listing what will be stripped, and let the author either confirm or stay in HTML mode.
5. Round-trip between HTML and Rich Text is lossless for any content that uses only TipTap's supported extensions. Backend stores the chosen `contentFormat`.

Markdown mode is the legacy path. It continues to work, but the toggle itself only covers `richtext ↔ html`. Markdown sheets get a one-time "Upgrade to Rich Text" button (already present) plus a new "Switch to HTML" button that uses `marked` to convert on the way in.

---

## Scope of this phase

1. Replace the current Upgrade button with a first-class `<EditorModeToggle />` component that offers Rich Text and HTML/Code as equal siblings.
2. Add a lossy-round-trip detector that runs before any `html → richtext` switch, using DOMPurify + TipTap's `HTMLParser` behavior.
3. Wire a `ConfirmLossyConversionModal` that lists stripped tags and attributes before confirming the switch.
4. Add a minimal syntax-highlighted HTML code editor with live preview, upgrading the current `<textarea>` path. Use CodeMirror 6 (small, modern, native HTML support).
5. Persist the chosen format through the existing PATCH `/api/sheets/:id` flow (the backend already accepts `contentFormat`; no backend change needed).
6. Keep the markdown path intact; give markdown sheets a one-time conversion affordance to either richtext (existing) or html/code (new) using `marked`.
7. Telemetry + tests.

Out of scope (do not touch): fork & contribute flow, study groups, payments, AI, messaging, legal.

---

## Existing pieces you build on

- `frontend/studyhub-app/src/pages/sheets/lab/SheetLabEditor.jsx` — current editor. You will refactor this into a thin shell that delegates to mode-specific children. It currently handles title, description, save status, autosave, manual save, publish/contribute — all of that stays in the shell.
- `frontend/studyhub-app/src/components/editor/RichTextEditor.jsx` — TipTap WYSIWYG already wired with StarterKit, Underline, Link, Placeholder, Image (no base64), CodeBlockLowlight, and a custom Math extension. Outputs sanitized HTML via `onUpdate`.
- `frontend/studyhub-app/src/components/editor/editorSanitize.js` — `sanitizeOutput(html)` wraps DOMPurify with the project's allowlist. You will extend this file with a `detectLossyConversion(html)` helper for the warning modal.
- `frontend/studyhub-app/src/components/editor/EditorToolbar.jsx` — the WYSIWYG toolbar. No changes needed.
- Backend `normalizeContentFormat` in `backend/src/lib/html/htmlSecurityRules.js` already accepts `markdown`, `html`, `richtext`. No change.
- Backend scan pipeline (`validateHtmlForSubmission` + `detectHtmlFeatures` + `classifyHtmlRisk`) already runs on HTML content during PATCH. No change.
- `marked` v17 is already a dependency and can convert markdown to HTML.

Not installed yet, to add:

- `@codemirror/lang-html` and the CodeMirror 6 core packages: `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/autocomplete`, and `codemirror` (the thin wrapper). Use `npm install --save` in `frontend/studyhub-app/`. Total gzipped cost ~120 KB — acceptable for a page that already loads TipTap.

---

## Step 1 — Extract mode-agnostic shell from `SheetLabEditor.jsx`

Split the current 400-line file into a shell plus mode children. This satisfies CLAUDE.md's "pages own layout, children own rendering" rule and makes the toggle clean.

**File:** `frontend/studyhub-app/src/pages/sheets/lab/SheetLabEditor.jsx` (refactor)

Keep:
- Title / description inputs
- Save status bar
- Draft / Published badge
- Publish/Contribute button
- Manual save button
- Autosave timer, `dirty` state, `beforeunload` warning
- `save()` and `handleTogglePublish()`

Delegate:
- The actual editing surface — move to a new component that receives `content`, `contentFormat`, `onContentChange`, `onFormatChange`, `onManualSave` as props.

**New file:** `frontend/studyhub-app/src/pages/sheets/lab/editor/SheetLabEditorSurface.jsx`

```jsx
import RichTextEditor from '../../../../components/editor/RichTextEditor'
import HtmlCodeEditor from './HtmlCodeEditor'
import MarkdownTextareaEditor from './MarkdownTextareaEditor'
import EditorModeToggle from './EditorModeToggle'

export default function SheetLabEditorSurface({
  content,
  contentFormat,          // 'markdown' | 'html' | 'richtext'
  onContentChange,        // (nextContent) => void
  onFormatChange,         // (nextFormat, nextContent) => void
  disabled,
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <EditorModeToggle
        value={contentFormat}
        onChange={onFormatChange}
        currentContent={content}
      />
      {contentFormat === 'richtext' && (
        <RichTextEditor
          content={content}
          onUpdate={onContentChange}
          placeholder="Start writing your study notes..."
          minHeight={400}
          editable={!disabled}
        />
      )}
      {contentFormat === 'html' && (
        <HtmlCodeEditor
          value={content}
          onChange={onContentChange}
          disabled={disabled}
        />
      )}
      {contentFormat === 'markdown' && (
        <MarkdownTextareaEditor
          value={content}
          onChange={onContentChange}
          disabled={disabled}
        />
      )}
    </div>
  )
}
```

**New file:** `frontend/studyhub-app/src/pages/sheets/lab/editor/MarkdownTextareaEditor.jsx`

Move the existing markdown textarea + plain preview panel out of `SheetLabEditor.jsx` verbatim. Same dark textarea styling, same side-by-side preview, same placeholder. This is a pure cut-and-paste with the props wiring adjusted.

After the refactor, `SheetLabEditor.jsx` should be under 200 lines and read like: state + save + render(`<SheetLabEditorSurface />`).

**Acceptance:** App still builds, existing markdown and richtext flows render identically. HTML mode still uses the old textarea — the upgrade happens in Step 3.

---

## Step 2 — `EditorModeToggle` component

**New file:** `frontend/studyhub-app/src/pages/sheets/lab/editor/EditorModeToggle.jsx`

A segmented control with three pills: `Rich Text`, `HTML / Code`, `Markdown`. Active pill uses `var(--sh-brand-accent)` background, inactive uses `var(--sh-soft)` text. No emojis.

Props:
```
{
  value: 'markdown' | 'html' | 'richtext',
  onChange: (nextFormat, nextContent) => void,
  currentContent: string,
  disabled?: boolean,
}
```

Behavior matrix for each switch:

| From | To | Action |
|---|---|---|
| richtext | html | Pass `currentContent` through unchanged — TipTap already outputs sanitized HTML. Instant. |
| html | richtext | Run `detectLossyConversion(currentContent)`. If the result has any `strippedTags` or `strippedAttributes`, open `ConfirmLossyConversionModal`. Only proceed on confirm. If confirmed, call `sanitizeForTipTap(currentContent)` and pass that to `onChange`. |
| markdown | richtext | Convert with `marked.parse(currentContent)`, then `sanitizeForTipTap`, then `onChange`. |
| markdown | html | Convert with `marked.parse(currentContent)`, then `onChange`. No warning — this is an additive conversion. |
| richtext | markdown | Show a hard confirmation: "Converting back to markdown will lose formatting (headings, lists, links become raw HTML tags). Keep as HTML/Code instead?" with primary button "Stay on HTML/Code", secondary "Convert anyway". If user picks convert, pass the raw HTML through unchanged and switch format — markdown mode will render it as preformatted text, which signals to the user that they need to clean it up. |
| html | markdown | Same as above. |

The modal is `ConfirmLossyConversionModal` from Step 4.

Implementation detail: because the switch may be cancelled, `onChange` must only fire after the confirm resolves. Store the pending target in local state.

**Acceptance:** Clicking each pill either switches immediately (lossless directions) or opens a modal first. Cancel leaves the editor in the previous mode.

---

## Step 3 — CodeMirror-powered `HtmlCodeEditor`

**Install dependencies.** From `frontend/studyhub-app/`:

```
npm install --save codemirror @codemirror/state @codemirror/view @codemirror/commands @codemirror/language @codemirror/autocomplete @codemirror/lang-html
```

**New file:** `frontend/studyhub-app/src/pages/sheets/lab/editor/HtmlCodeEditor.jsx`

Split-pane layout: left is the CodeMirror instance, right is an iframe preview (`sandbox="allow-same-origin"`, `srcDoc={value}`). Mirror the existing HTML textarea styles so nothing looks jarring during Phase 3 rollout.

```jsx
import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { html as htmlLang } from '@codemirror/lang-html'
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'

export default function HtmlCodeEditor({ value, onChange, disabled }) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })

  useEffect(() => {
    if (!hostRef.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        htmlLang(),
        EditorView.lineWrapping,
        EditorView.editable.of(!disabled),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
        }),
      ],
    })
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    return () => { view.destroy(); viewRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // External value change (e.g., mode switch) — replace the doc without losing focus
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      borderRadius: 14,
      overflow: 'hidden',
      border: '1px solid var(--sh-border)',
      minHeight: 400,
    }}>
      <div style={{ position: 'relative', background: '#0f172a' }}>
        <div style={paneHeaderStyle}>HTML / Code</div>
        <div ref={hostRef} style={{ minHeight: 400, height: '100%' }} />
      </div>
      <div style={{ borderLeft: '1px solid var(--sh-border)' }}>
        <div style={paneHeaderStyle}>Preview</div>
        <iframe
          title="html-preview"
          sandbox="allow-same-origin"
          srcDoc={value}
          style={{ width: '100%', minHeight: 400, height: 'calc(100% - 28px)', border: 'none', background: '#fff' }}
        />
      </div>
    </div>
  )
}

const paneHeaderStyle = {
  padding: '6px 12px',
  background: '#1e293b',
  color: '#94a3b8',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderBottom: '1px solid #334155',
}
```

CSS: CodeMirror 6 injects its own styles, but you will want to make sure the dark editor panel reads well. Add a tiny stylesheet next to the component.

**New file:** `frontend/studyhub-app/src/pages/sheets/lab/editor/HtmlCodeEditor.css`

```css
.cm-editor {
  height: 100%;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 12.5px;
  background: #0f172a;
  color: #e2e8f0;
}
.cm-gutters {
  background: #0b1220 !important;
  color: #475569 !important;
  border-right: 1px solid #1e293b !important;
}
.cm-activeLineGutter,
.cm-activeLine {
  background: rgba(56, 189, 248, 0.08) !important;
}
.cm-selectionBackground {
  background: rgba(59, 130, 246, 0.35) !important;
}
```

Import the CSS in the component file. These are the only raw hex values allowed in the phase because they are dark-mode-always editor internals, which CLAUDE.md explicitly calls out as an exception to the token rule.

**Acceptance:** Switching to HTML mode shows a real code editor with gutter line numbers, HTML tag color coding, bracket matching, and autocomplete. The preview iframe updates as you type. `Ctrl+Z` / `Cmd+Z` undo works. Typing triggers autosave exactly like the markdown textarea does.

---

## Step 4 — Lossy-conversion detector + modal

**Extend:** `frontend/studyhub-app/src/components/editor/editorSanitize.js`

Add two exports alongside the existing `sanitizeOutput`:

```js
import DOMPurify from 'dompurify'

// Same allowlist TipTap accepts. Keep in sync with the extensions
// loaded in RichTextEditor.jsx. Update when you add extensions.
const TIPTAP_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li',
  'blockquote',
  'a', 'img',
  'span', 'div',   // spans/divs are kept for math and code block wrappers
]
const TIPTAP_ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'class', 'target', 'rel']

export function sanitizeForTipTap(html) {
  return DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS: TIPTAP_ALLOWED_TAGS,
    ALLOWED_ATTR: TIPTAP_ALLOWED_ATTR,
    KEEP_CONTENT: true,
  })
}

/**
 * Compare raw HTML against TipTap's allowlist and return a report of
 * anything that would be stripped by sanitizeForTipTap.
 * Used by the editor mode toggle to warn the user before converting.
 */
export function detectLossyConversion(html) {
  if (!html) return { strippedTags: [], strippedAttributes: [], lossy: false }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const strippedTags = new Set()
  const strippedAttributes = new Set()
  const walk = (node) => {
    if (node.nodeType !== 1) return
    const tag = node.tagName.toLowerCase()
    if (!TIPTAP_ALLOWED_TAGS.includes(tag)) {
      strippedTags.add(tag)
    } else {
      for (const attr of Array.from(node.attributes)) {
        if (!TIPTAP_ALLOWED_ATTR.includes(attr.name)) {
          strippedAttributes.add(`${tag}[${attr.name}]`)
        }
      }
    }
    for (const child of Array.from(node.children)) walk(child)
  }
  walk(doc.body)
  return {
    strippedTags: Array.from(strippedTags).sort(),
    strippedAttributes: Array.from(strippedAttributes).sort(),
    lossy: strippedTags.size > 0 || strippedAttributes.size > 0,
  }
}
```

**New file:** `frontend/studyhub-app/src/pages/sheets/lab/editor/ConfirmLossyConversionModal.jsx`

Props: `{ open, report, onConfirm, onCancel }`. Render with `createPortal(jsx, document.body)` per CLAUDE.md modal rules — SheetLab tabs sit inside an anime.js animated container so `position: fixed` will otherwise be captured by the transform.

Body copy:

> Switching to Rich Text will remove some HTML that the visual editor cannot represent. You can always switch back to HTML/Code later, but the stripped content will not come back automatically.

Then two bullet-less sections rendered as prose: "Tags that will be removed: `<script>`, `<iframe>`, ..." and "Attributes that will be removed: `div[style]`, `a[onclick]`, ...". Both sections are omitted when empty.

Two buttons: "Stay on HTML/Code" (cancel), "Convert anyway" (confirm, destructive styling — `var(--sh-danger-bg)` background, `var(--sh-danger-text)` text).

**Acceptance:** Pasting `<script>alert(1)</script><div onclick="x">hi</div>` in HTML mode and clicking Rich Text opens the modal and lists both `script` and `div[onclick]`. Clicking Cancel leaves you in HTML mode, content untouched. Clicking Convert anyway drops you into Rich Text with the stripped output.

---

## Step 5 — Wire the shell to the surface

Back in `SheetLabEditor.jsx`, thread `contentFormat` and the new mode-change handler through:

```jsx
const handleFormatChange = (nextFormat, nextContent) => {
  if (nextFormat === activeFormat && nextContent === content) return
  setActiveFormat(nextFormat)
  if (typeof nextContent === 'string' && nextContent !== content) {
    setContent(nextContent)
  }
  setDirty(true)  // force autosave so contentFormat persists
}
```

The existing `save()` already includes `contentFormat` in the PATCH body when it differs from `sheet.contentFormat`, so no backend change is needed. Double-check this by reading `save()` — it's the branch that sets `body.contentFormat`.

Remove the old `handleUpgradeToRichText` one-way button entirely — the toggle replaces it.

**Acceptance:** Switching formats dirty-flags the editor. Autosave fires after 1.5s. The backend PATCH payload contains the new `contentFormat`. Reloading the page keeps the format. Publishing a sheet from HTML mode still goes through the scan pipeline because the backend detects `contentFormat === 'html'`.

---

## Step 6 — Telemetry

Add four new `trackEvent` calls in the toggle / shell, following the style of `sheet_forked`:

- `editor_mode_switched` with `{ sheetId, from, to, lossy: boolean }`
- `editor_mode_lossy_confirmed` with `{ sheetId, strippedTags, strippedAttributes }`
- `editor_mode_lossy_cancelled` with `{ sheetId, strippedTags, strippedAttributes }`
- `editor_mode_markdown_converted` with `{ sheetId, to }` for markdown → html / markdown → richtext

Import `trackEvent` from the same module `useSheetViewer.js` uses (grep if you need to confirm the exact path).

---

## Step 7 — Tests

**Unit — editorSanitize (Vitest).**

**New file:** `frontend/studyhub-app/src/components/editor/editorSanitize.test.js`

Cases:

- `detectLossyConversion('')` returns `{ strippedTags: [], strippedAttributes: [], lossy: false }`.
- `detectLossyConversion('<p>hi</p>')` returns `lossy: false`.
- `detectLossyConversion('<script>x</script>')` returns `lossy: true` with `strippedTags: ['script']`.
- `detectLossyConversion('<div onclick="x">hi</div>')` returns `lossy: true` with `strippedAttributes: ['div[onclick]']`.
- `sanitizeForTipTap('<script>x</script><p>ok</p>')` returns `'<p>ok</p>'`.

**Component — EditorModeToggle (Vitest + React Testing Library).**

**New file:** `frontend/studyhub-app/src/pages/sheets/lab/editor/EditorModeToggle.test.jsx`

Cases:

- Renders three pills; clicking a pill with a lossless switch fires `onChange` immediately with `(nextFormat, currentContent)`.
- Clicking HTML → Rich Text on lossy content opens the modal; `onChange` is not called until confirm.
- Cancel button leaves `onChange` uncalled.
- Markdown → HTML converts via `marked` and fires `onChange` with the parsed HTML.
- Markdown → Rich Text sanitizes the parsed HTML before passing to `onChange`.

**Component — HtmlCodeEditor smoke test.**

**New file:** `frontend/studyhub-app/src/pages/sheets/lab/editor/HtmlCodeEditor.test.jsx`

Cases:

- Renders a host `<div>` and an iframe with `srcDoc` equal to `value`.
- Firing a CodeMirror doc change calls `onChange` with the new doc contents. (You can use `@codemirror/view`'s `EditorView` programmatic dispatch from inside the test after mount.)

**E2E — Playwright.**

**New file:** `frontend/studyhub-app/tests/sheets.editor-toggle.spec.js`

1. Log in, create a sheet in Rich Text mode, type a heading + paragraph.
2. Toggle to HTML/Code, assert the code editor pane appears with `<h1>` and `<p>` in the document.
3. Edit the HTML to add a `<table>`, wait for autosave indicator to read "Saved".
4. Toggle back to Rich Text. Because `<table>` is not in TipTap's allowlist the modal should open; click Convert anyway.
5. Confirm the table content (text inside the cells) survives as flowing paragraphs.
6. Publish the sheet and view it in the public viewer — content renders.

---

## Step 8 — Validation

Run in order:

```
npm --prefix frontend/studyhub-app run lint
npm --prefix frontend/studyhub-app run test
npm --prefix frontend/studyhub-app run build
npm --prefix frontend/studyhub-app run test:e2e -- sheets.editor-toggle.spec.js
```

Expected:

- Lint clean on the new files. Pre-existing warnings elsewhere remain.
- Vitest passes the new unit tests and does not regress the existing `components/editor/*` suites.
- `npm run build` reports a bundle size increase of roughly 100-140 KB gzipped on the Sheet Lab chunk from CodeMirror. This is acceptable.
- E2E passes on the fresh spec.

Append a Phase 3 entry to `docs/beta-v2.0.0-release-log.md`: the new component inventory, the CodeMirror dependency, the detect/confirm flow, the telemetry events, and the bundle-size delta.

---

## File inventory

New files:

- `frontend/studyhub-app/src/pages/sheets/lab/editor/SheetLabEditorSurface.jsx`
- `frontend/studyhub-app/src/pages/sheets/lab/editor/EditorModeToggle.jsx`
- `frontend/studyhub-app/src/pages/sheets/lab/editor/EditorModeToggle.test.jsx`
- `frontend/studyhub-app/src/pages/sheets/lab/editor/HtmlCodeEditor.jsx`
- `frontend/studyhub-app/src/pages/sheets/lab/editor/HtmlCodeEditor.css`
- `frontend/studyhub-app/src/pages/sheets/lab/editor/HtmlCodeEditor.test.jsx`
- `frontend/studyhub-app/src/pages/sheets/lab/editor/MarkdownTextareaEditor.jsx`
- `frontend/studyhub-app/src/pages/sheets/lab/editor/ConfirmLossyConversionModal.jsx`
- `frontend/studyhub-app/src/components/editor/editorSanitize.test.js`
- `frontend/studyhub-app/tests/sheets.editor-toggle.spec.js`

Edited files:

- `frontend/studyhub-app/src/pages/sheets/lab/SheetLabEditor.jsx` (refactored to thin shell, remove the old `Upgrade to Rich Text` button)
- `frontend/studyhub-app/src/components/editor/editorSanitize.js` (add `sanitizeForTipTap`, `detectLossyConversion`)
- `frontend/studyhub-app/package.json` (add CodeMirror deps)
- `frontend/studyhub-app/package-lock.json` (regenerated by npm install)
- `docs/beta-v2.0.0-release-log.md` (append Phase 3 entry)

Do not edit: backend, other Sheet Lab tabs, TipTap extensions, the payments module, the studyGroups module, the messaging module, the AI module, the legal content files.

---

## Design principles to enforce

1. The shell stays under 200 lines after the refactor. Children do the rendering.
2. No new inline hex colors except inside the CodeMirror stylesheet (dark-mode-always editor — CLAUDE.md exception).
3. No emojis anywhere, including in button labels and toast messages.
4. The confirm modal uses `createPortal` because Sheet Lab tabs live inside an anime.js animated container with a CSS transform.
5. The toggle never mutates content without user confirmation for lossy directions.
6. CodeMirror's `EditorView` is destroyed in the effect cleanup to prevent leaks on fast tab switches.
7. External value changes to `HtmlCodeEditor` (e.g., from a mode switch) are dispatched through CodeMirror transactions, not by recreating the editor — recreation kills focus and undo history.
8. Autosave logic in the shell is the single source of truth; children do not call PATCH themselves.
9. `marked.parse` output goes through `sanitizeForTipTap` when the target is Rich Text, but through the raw value when the target is HTML/Code — the user is explicitly asking for the raw HTML in that case and the backend scan pipeline will still gate publish.
10. The markdown textarea path is preserved byte-for-byte in `MarkdownTextareaEditor.jsx` so no existing sheet's rendering changes.

---

## Known edge cases to keep in mind

- **Pasted content from Word or Google Docs.** Users paste HTML with `style="..."` everywhere. In Rich Text mode, TipTap strips it automatically. In HTML mode, the code editor shows it as-is. This is fine and expected — no special handling.
- **Empty content switching.** Switching modes on an empty sheet must not open the lossy modal. Guard with `if (!html.trim()) return { strippedTags: [], strippedAttributes: [], lossy: false }` inside `detectLossyConversion`.
- **Very large HTML.** CodeMirror handles 10k+ lines fine, but the iframe `srcDoc` path re-parses on every keystroke. If the document is larger than 50 KB, debounce the iframe update by 200 ms. Use a `useDeferredValue` or a plain `useEffect` + `setTimeout`.
- **Rich text formats TipTap adds later.** If you extend TipTap with tables or task lists in a future phase, update `TIPTAP_ALLOWED_TAGS` in the same PR. Leaving them out will cause the lossy detector to incorrectly warn on content produced by TipTap itself.
- **Autocomplete popover clipping.** CodeMirror's autocomplete popup can get clipped by the SheetLab tabs container's `overflow: hidden`. If that happens, set `overflow: visible` on the immediate parent of `HtmlCodeEditor` in `SheetLabEditorSurface.jsx` — do not change the page layout.
- **Undo across mode switches.** CodeMirror's undo history is scoped to the CodeMirror instance; TipTap's is scoped to TipTap. After a mode switch, undo does not cross the boundary. This is correct behavior and matches VS Code's WYSIWYG extensions. Mention it in the release log so you remember.

Done. Ship Phase 3.
