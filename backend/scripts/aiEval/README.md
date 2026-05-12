# Hub AI eval harness

Minimal regression net for the Hub AI `SYSTEM_PROMPT`. Run this **before**
shipping any prompt edit so you don't ship a regression blind.

## What it does

`runEval.js` reads `fixtures.json`, calls Anthropic once per fixture with the
live `SYSTEM_PROMPT` from `backend/src/modules/ai/ai.constants.js`, evaluates
each fixture's assertions against the model's response, and writes a
PASS/FAIL Markdown report to `results/<ISO-timestamp>.md`. Exits `0` if every
fixture passes, `1` if any fixture fails.

## How to run

```powershell
# from repo root
npm --prefix backend run ai:eval
```

Requirements:

- `ANTHROPIC_API_KEY` must be set (the script loads `backend/.env`).
- This **costs real money** — roughly 10–20 cents per full 12-fixture run on
  Sonnet 4. **DO NOT** wire this to CI. It is a manual gate.

Workflow:

1. Edit `backend/src/modules/ai/ai.constants.js#SYSTEM_PROMPT`.
2. Run `npm --prefix backend run ai:eval`.
3. Open the newest file under `backend/scripts/aiEval/results/`.
4. If the run failed, decide whether the failure is a real regression or a
   fixture that needs updating. Fix one or the other.
5. Re-run until green, then commit the prompt change.

## How to add a fixture

Append an entry to the `fixtures` array in `fixtures.json`. The minimum shape
is:

```json
{
  "id": "13-some-new-check",
  "category": "concept_explanation",
  "description": "One-line human description of what this is testing.",
  "userMessage": "The exact user prompt to send.",
  "assertions": [
    { "type": "includes", "value": "something the answer must contain", "label": "human label" }
  ]
}
```

### Available assertion types

| `type`        | `value`      | Notes                                                   |
| ------------- | ------------ | ------------------------------------------------------- |
| `includes`    | substring    | Case-insensitive by default                             |
| `notIncludes` | substring    | Case-insensitive by default                             |
| `matches`     | regex source | Case-insensitive by default; `value` is fed to `RegExp` |
| `notMatches`  | regex source | Case-insensitive by default                             |
| `minLength`   | integer      | Response length floor                                   |
| `maxLength`   | integer      | Response length ceiling                                 |

Set `"caseSensitive": true` on an assertion to disable the default
case-insensitive matching.

### Optional fixture fields

- `history`: array of prior `{ role: 'user' | 'assistant', content: '...' }`
  turns sent before the `userMessage`. Use for follow-up / context fixtures.
- Every fixture's `id` is the stable key — keep it stable across edits so
  result files diff cleanly.

### Fixture authoring rules

- **One fixture, one behaviour.** If a single fixture has 10 assertions
  across 5 unrelated behaviours, a single random model variation flips the
  whole thing red and you don't learn anything. Split into fixtures of 2–4
  closely related assertions.
- **Don't assert exact strings the model is free to vary.** Use regex
  alternations or substrings. `assertion.value` of `"mitochondria is the"`
  will flap; `"mitochondri"` (substring covering both "mitochondria" and
  "mitochondrion") is sturdy.
- **Negative assertions are gold.** "Did NOT output the banned filler
  phrase," "did NOT emit `<script>`," "did NOT echo the SSN" — these catch
  the regressions that matter.
- **Sheet generation needs the `html` fence assertion.** Without
  `\`\`\`html`the frontend's`AiSheetPreview.jsx` won't detect the sheet,
  and the user just sees raw HTML in chat.
- **Avoid PII or sensitive content in fixtures.** Fixtures get committed to
  the repo and live in audit reports. Use obvious dummy strings
  (`studenttest@example.com`, `(555) 123-4567`, etc.).

## What this harness does NOT do

- **It does not test the vision path with real images.** Fixture `12-…`
  describes an image in text as a stub. A genuine vision regression still
  needs a manual smoke against `/api/ai/messages` with a real image
  attachment.
- **It does not test the SSE streaming layer.** It calls
  `client.messages.create` (non-streaming) for simpler assertion logic. If
  you change anything in `ai.service.js#streamMessage`, smoke that path
  separately.
- **It does not test rate-limit / quota / spend-ceiling enforcement.** Those
  live in `ai.service.js` + `ai.spendCeiling.js` and have their own unit
  tests.
- **It does not enforce a baseline.** Today each run stands alone; we don't
  diff against a "last known good" file. Gap #3 in the research loop
  (`docs/internal/audits/2026-05-11-research-loop-1-ai-sheet-gaps.md`)
  describes the full eval roadmap (LLM-as-judge, baseline diffing); this
  harness is the minimum-viable subset.

## When to extend it

If a future SYSTEM_PROMPT edit introduces a new declared capability, add a
fixture that exercises that capability. If a prompt-injection variant gets
past us in production, add a fixture for it so the next attempt fails the
eval before merge.
