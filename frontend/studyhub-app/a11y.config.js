/* global module */
// Accessibility quality gates for CI
// Use with: npx axe-cli http://localhost:4173 --config a11y.config.js
module.exports = {
  rules: {
    // WCAG 2.2 AA requirements
    'color-contrast': { enabled: true },
    'keyboard-navigation': { enabled: true },
    'focus-visible': { enabled: true },
    'aria-roles': { enabled: true },
    'img-alt': { enabled: true },
    'label': { enabled: true },
    'link-name': { enabled: true },
    'button-name': { enabled: true },
    'heading-order': { enabled: true },
    'landmark-one-main': { enabled: true },
  },
  thresholds: {
    violations: 0, // Zero tolerance for a11y violations
    incomplete: 5, // Allow some incomplete checks (needs manual review)
  },
}
