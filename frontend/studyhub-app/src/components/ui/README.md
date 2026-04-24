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

- **Styling:** CSS Modules only. No inline `style={{}}` except for truly dynamic values (e.g. a user-picked color).
- **Tokens:** every CSS value in a module references `var(--sh-*)`, `var(--radius-*)`, or `var(--space-*)`. No hex, no rgb, no raw spacing px.
- **Ref forwarding:** every interactive component uses `React.forwardRef` so form libraries and focus management work.
- **Prop passthrough:** accept `...rest` and spread it onto the root element. Means `aria-*`, `data-*`, event handlers all just work.
- **Accessibility floor:** visible focus ring on every interactive element. Minimum touch target 40x40px. Correct semantic HTML.
- **Emoji policy:** never in UI chrome. Allowed only in user-generated content.

## Current components

- Button — 4 variants x 3 sizes with hover, focus, active, disabled, loading states.
- Input — text/email/password/search/tel/url with label, hint, error slots.
- Card — base + CardHeader/CardBody/CardFooter, interactive variant.

(More added as the cycle progresses — Modal, Chip, Badge, Avatar on Day 2.)
