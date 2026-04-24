# Copilot Instructions

The full review mandate, project context, locked decisions, historical
bug patterns, anti-patterns, and block/approve criteria live in
`.github/instructions/code-review.instructions.md`. That file is the
source of truth for any AI-driven PR review on this repo.

When reviewing or generating code, you must read that file in full
and apply every rule. Do not skim. Do not approve PRs without
running the per-file checklist on every changed file. Do not soften
findings.

If you are generating code (not reviewing): the same project context,
conventions, and locked decisions apply. The historical bug patterns
section is especially important — do not regress what we've already
fixed.
