import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    restoreMocks: true,
    clearMocks: true,
    exclude: ['**/node_modules/**', '**/.claude/worktrees/**'],
    // bcrypt cost-12 is the project standard, and a few security tests run many
    // hashes/compares in one case (e.g. recoveryCodes hashes all 10 codes +
    // verifies each). Those legitimately take ~5s and were flaking past the
    // 5000ms vitest default ON CI — the chronic red-CI cause. 15s gives crypto
    // tests room while still failing a genuinely-hung test fast. Do NOT use this
    // headroom to paper over a real hang — fix the hang.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
})
