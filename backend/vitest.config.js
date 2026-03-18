const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    restoreMocks: true,
    clearMocks: true,
  },
})