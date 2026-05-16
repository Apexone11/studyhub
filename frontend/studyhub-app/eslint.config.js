import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import eslintConfigPrettier from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'playwright-report', 'test-results', 'android']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      eslintConfigPrettier,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // React Compiler-aligned rules from `eslint-plugin-react-hooks@7.x`
      // are kept as warnings rather than errors. The new lints (set-state
      // in effect, manual memoization, refs in render, purity) flag real
      // smells but also fire on legitimate React patterns — derived state
      // synced from props, refs assigned in render for measurement, etc.
      // Treating them as warnings lets the editor surface the signals
      // without breaking CI on patterns that need an intentional staged
      // refactor. The foundational rules (`rules-of-hooks`,
      // `exhaustive-deps`) stay at error severity from the recommended
      // config — those are real bugs.
      //
      // Founder directive 2026-05-14: get CI green so future PRs aren't
      // blocked by inherited noise. The 86 pre-existing warnings are now
      // a tracked debt rather than a CI-breaking error.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  {
    files: ['playwright.config.js', 'tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['src/lib/session-context.jsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
