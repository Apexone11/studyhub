import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    restoreMocks: true,
    clearMocks: true,
    exclude: ['**/node_modules/**', '**/.claude/worktrees/**'],
  },
})
