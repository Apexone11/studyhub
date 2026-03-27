StudyHub Beta Cycle Template

Document Naming Rule
- Use versioned naming for release logs: `docs/beta-v<MAJOR.MINOR.PATCH>-release-log.md`
- Keep this template at: `docs/beta-cycle-template.md`

Cycle Number and Name
- Cycle X: <title>
- Date: <YYYY-MM-DD>

Goal
- <single clear goal>

Scope (Small, Focused)
- <change 1>
- <change 2>
- <change 3>

Change Classification
- Added:
	- <new feature>
- Changed:
	- <behavior update>
- Fixed:
	- <bug fix>
- Security:
	- <security-related change>

Endpoints/Routes
- <endpoint or route>
- <endpoint or route>

UI Checks
- <visible behavior 1>
- <visible behavior 2>

Security/Integrity Checks
- <validation rule 1>
- <validation rule 2>

Commands
1. npm run beta:bootstrap
2. npm run beta:check
3. npm run beta:down

Cycle-Specific Validation
- <specific test command(s)>
- Include tests for all new features and all touched pages in this cycle.

Validation Results
- <command>: <pass/fail + key metrics>
- <command>: <pass/fail + key metrics>

Deep Scan Summary (Required for auth/security/upload/core logic changes)
- Scan method:
	- <lint/static scan/search patterns/manual review>
- Findings:
	- <finding 1>
	- <finding 2>
- Risk assessment:
	- <none/low/medium/high + rationale>

Artifacts To Review
- beta-diagnostics/feed-network.json
- beta-diagnostics/backend-stack.log
- beta-diagnostics/frontend-console.json
- <any new cycle artifact>

Exit Criteria
- [ ] all targeted tests pass
- [ ] no blocker error in diagnostics
- [ ] no regression in existing core flows
- [ ] all newly changed pages/features have explicit beta tests
- [ ] document updated with validation and deep scan outcomes
- [ ] ready for next cycle

Notes
- <known issue>
- <deferred item>

AI Documentation Protocol (Must Follow)
1. Update the current beta release log in the same session as code changes.
2. Record exact commands executed and their outcomes.
3. Record deferred risks and next actions.
4. Use ISO date format (`YYYY-MM-DD`) consistently.
