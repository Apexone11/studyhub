import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { AUTHOR_SELECT } = require('../src/modules/sheets/sheets.constants')

describe('AUTHOR_SELECT constant', () => {
  it('includes id and username', () => {
    expect(AUTHOR_SELECT.id).toBe(true)
    expect(AUTHOR_SELECT.username).toBe(true)
  })

  it('includes emailVerified', () => {
    expect(AUTHOR_SELECT.emailVerified).toBe(true)
  })

  it('includes isStaffVerified', () => {
    expect(AUTHOR_SELECT.isStaffVerified).toBe(true)
  })
})
