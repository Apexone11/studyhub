import { describe, expect, it } from 'vitest'
import { extractMentionUsernames } from '../src/lib/mentions'

describe('extractMentionUsernames', () => {
  it('does not leak regexp state across repeated calls', () => {
    expect(extractMentionUsernames('Hello @Alpha and @Beta')).toEqual(['alpha', 'beta'])
    expect(extractMentionUsernames('Follow up with @Gamma')).toEqual(['gamma'])
  })
})