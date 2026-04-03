const js = require('@eslint/js')
const globals = require('globals')
const eslintConfigPrettier = require('eslint-config-prettier')

module.exports = [
  {
    ignores: ['node_modules/**', 'uploads/**', 'prisma/migrations/**'],
  },
  js.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },
]