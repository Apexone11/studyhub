#!/usr/bin/env node
/**
 * CI guard from roles-and-permissions-plan.md §12.5.
 * Fails if role-label strings "Other" or "Member" sneak back into role-aware UI.
 */

const { readFileSync, readdirSync, statSync } = require('node:fs')
const { join, relative, sep } = require('node:path')

const ROOT = join(__dirname, '..')
const SCAN_ROOTS = [join(ROOT, 'frontend', 'studyhub-app', 'src')]

const WHITELIST_PATHS = [
  'components/ReportModal.jsx',
  'pages/studyGroups/ReportGroupModal.jsx',
  'pages/settings/AccountTab.jsx',
  'pages/settings/components/ModerationAppealModal.jsx',
  'lib/roleLabel.test.js',
  'lib/roleLabel.js',
  'pages/studyGroups/studyGroupsHelpers.js',
  'components/sidebar/AppSidebar.roleLabel.test.jsx',
  'pages/auth/RolePickerPage.test.jsx',
]

const ROLE_CONTEXT = /(accountType|role(?:Label)?)\b/
const BANNED_LABELS = [/'Other'/, /"Other"/, /'Member'/, /"Member"/]

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const s = statSync(full)
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'build') continue
      walk(full, out)
    } else if (/\.(jsx?|tsx?)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

const failures = []

for (const root of SCAN_ROOTS) {
  for (const file of walk(root)) {
    const rel = relative(root, file).split(sep).join('/')
    if (WHITELIST_PATHS.some((w) => rel.endsWith(w))) continue
    const source = readFileSync(file, 'utf8')
    const lines = source.split('\n')
    lines.forEach((line, i) => {
      if (!BANNED_LABELS.some((r) => r.test(line))) return
      const window = lines.slice(Math.max(0, i - 3), i + 4).join('\n')
      if (ROLE_CONTEXT.test(window)) {
        failures.push(`${rel}:${i + 1}  ${line.trim()}`)
      }
    })
  }
}

if (failures.length) {
  console.error('Role-label guard failed. Use roleLabel() and "Self-learner" instead of "Other"/"Member".')
  for (const f of failures) console.error('  ' + f)
  process.exit(1)
}

console.log('Role-label guard: OK')
