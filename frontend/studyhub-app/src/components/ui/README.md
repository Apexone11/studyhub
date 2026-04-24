# UI Component Kit

Primitive components for StudyHub. Hand-built, no external library.
Every component follows the conventions locked in
`docs/internal/audits/2026-04-24-day1-component-kit-handoff.md`.

## Adding a new component

1. Create `components/ui/<Name>/`.
2. Write `<Name>.jsx` with `forwardRef` + `...rest` passthrough.
3. Write `<Name>.module.css` using only `--sh-*`, `--radius-*`, `--space-*` tokens.
4. Write `<Name>.test.jsx` covering: render, variants, states, ref forwarding, prop passthrough.
5. Add `export { default as <Name> } from './<Name>/<Name>'` to `components/ui/index.js`.
6. Document the API in the Figma file under the matching component page.

## Conventions (non-negotiable)

- **Styling:** CSS Modules only. No inline `style={{}}` in component JSX except for truly dynamic values (a user-picked color, a runtime-computed width/height on a `<Skeleton>`).
- **Tokens:** every color / radius / spacing value in a module references `var(--sh-*)`, `var(--radius-*)`, or `var(--space-*)`. Carve-outs (documented inline next to their use):
  - Structural pixel values are fine for intrinsic sizing: `min-height` for WCAG touch targets, `width`/`height` for small icon glyphs, `border: 1px`, focus-ring `box-shadow` offsets, spinner diameter. They are not spacing.
  - `backdrop-filter: blur(Npx)` uses a raw px because no blur token exists yet in `index.css`.
  - `color-mix(...)` is used for semi-transparent focus rings; it is the modern CSS equivalent of a token and is accepted.
- **Ref forwarding:** every interactive component uses `React.forwardRef` so form libraries and focus management work.
- **Prop passthrough:** accept `...rest` and spread it onto the root element. `aria-*`, `data-*`, event handlers all work. Props the component owns for accessibility (e.g. `aria-hidden` on a `<Skeleton>`) are set AFTER `...rest` so a consumer can't accidentally undo them.
- **Accessibility floor:**
  - Visible focus ring on every interactive element.
  - Minimum 40x40 touch target.
  - Correct semantic HTML (`<button>` for buttons, `<input>` for inputs).
  - When an interactive surface uses a non-native element (e.g. `<Card interactive as="div">`), wire Enter/Space keyboard activation so keyboard users get parity with mouse users.
  - State that hides content visually (loading spinners, busy states) must keep the label in the accessibility tree — use `opacity: 0` + `pointer-events: none`, not `visibility: hidden`.
- **Emoji policy:** never in UI chrome. Allowed only in user-generated content.

## Current components

- Button — 4 variants x 3 sizes with hover, focus, active, disabled, loading states.
- Input — text/email/password/search/tel/url with label, hint, error slots.
- Card — base + CardHeader/CardBody/CardFooter, interactive variant.

(More added as the cycle progresses — Modal, Chip, Badge, Avatar on Day 2.)
