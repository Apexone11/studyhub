import { describe, expect, it } from 'vitest'
import {
  VERIFICATION_PURPOSE,
  createOrRefreshLoginChallenge,
  createSignupChallenge,
  mapChallengeForClient,
  resendSignupChallenge,
  sendOrRefreshLoginChallenge,
  verifyChallengeCode,
} from '../src/lib/verification/verificationChallenges'

function createVerificationDb() {
  let rows = []
  let nextId = 1

  const clone = (value) => structuredClone(value)

  function matches(row, where) {
    if (!where) return true
    if (Array.isArray(where.OR)) {
      return where.OR.some((entry) => matches(row, entry))
    }

    return Object.entries(where).every(([key, value]) => {
      if (key === 'OR') return true
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        if ('lt' in value) return new Date(row[key]) < new Date(value.lt)
        if ('not' in value) return row[key] !== value.not
      }
      return row[key] === value
    })
  }

  function applyUpdate(row, data) {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'increment' in value) {
        row[key] = (row[key] || 0) + value.increment
        continue
      }
      row[key] = value
    }
  }

  return {
    verificationChallenge: {
      async create({ data }) {
        const now = new Date()
        const row = {
          id: nextId++,
          attemptCount: 0,
          sendCount: 1,
          lastSentAt: now,
          verifiedAt: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        }
        rows.push(row)
        return clone(row)
      },
      async findFirst({ where, orderBy } = {}) {
        let matchingRows = rows.filter((row) => matches(row, where))
        if (orderBy) {
          const [[field, direction]] = Object.entries(orderBy)
          matchingRows = matchingRows.sort((left, right) => (
            direction === 'desc'
              ? new Date(right[field]) - new Date(left[field])
              : new Date(left[field]) - new Date(right[field])
          ))
        }

        return matchingRows.length > 0 ? clone(matchingRows[0]) : null
      },
      async update({ where, data }) {
        const row = rows.find((entry) => entry.id === where.id)
        if (!row) throw new Error('Verification challenge not found.')

        applyUpdate(row, data)
        row.updatedAt = new Date()
        return clone(row)
      },
      async deleteMany({ where } = {}) {
        const before = rows.length
        rows = rows.filter((row) => !matches(row, where))
        return { count: before - rows.length }
      },
    },
    getRows() {
      return rows.map((row) => clone(row))
    },
  }
}

describe('verificationChallenges', () => {
  it('allows immediate first login verification send when the challenge was created without an email', async () => {
    const db = createVerificationDb()
    const user = {
      id: 501,
      username: 'legacy_user',
      email: null,
    }

    const created = await createOrRefreshLoginChallenge({ user, email: null }, db)

    expect(created.didSend).toBe(false)
    expect(created.code).toBeNull()
    expect(created.challenge.sendCount).toBe(0)

    const sent = await sendOrRefreshLoginChallenge(
      created.challenge.token,
      'legacy_user@studyhub.test',
      db,
    )

    expect(sent.challenge.sendCount).toBe(1)
    expect(sent.challenge.email).toBe('legacy_user@studyhub.test')
    expect(sent.code).toMatch(/^\d{6}$/)
  })

  it('blocks resend while the cooldown window is still active', async () => {
    const db = createVerificationDb()
    const { challenge } = await createSignupChallenge({
      username: 'new_student',
      email: 'new_student@studyhub.test',
      passwordHash: 'hash',
    }, db)

    await expect(resendSignupChallenge(challenge.token, db)).rejects.toMatchObject({
      statusCode: 429,
      message: 'Please wait before requesting another verification code.',
    })
  })

  it('marks a correct signup code as verified and returns client timing metadata', async () => {
    const db = createVerificationDb()
    const { challenge, code } = await createSignupChallenge({
      username: 'new_student',
      email: 'new_student@studyhub.test',
      passwordHash: 'hash',
    }, db)

    const verifiedChallenge = await verifyChallengeCode(
      challenge.token,
      VERIFICATION_PURPOSE.SIGNUP,
      code,
      db,
    )

    const mapped = mapChallengeForClient(verifiedChallenge)

    expect(verifiedChallenge.verifiedAt).toBeTruthy()
    expect(mapped.verificationToken).toBe(challenge.token)
    expect(new Date(mapped.resendAvailableAt).getTime()).toBeGreaterThan(new Date(verifiedChallenge.lastSentAt).getTime())
  })

  it('expires a challenge after too many incorrect verification attempts', async () => {
    const db = createVerificationDb()
    const { challenge } = await createSignupChallenge({
      username: 'new_student',
      email: 'new_student@studyhub.test',
      passwordHash: 'hash',
    }, db)

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(verifyChallengeCode(
        challenge.token,
        VERIFICATION_PURPOSE.SIGNUP,
        '999999',
        db,
      )).rejects.toMatchObject({
        statusCode: 400,
        message: 'Incorrect verification code.',
      })
    }

    await expect(verifyChallengeCode(
      challenge.token,
      VERIFICATION_PURPOSE.SIGNUP,
      '999999',
      db,
    )).rejects.toMatchObject({
      statusCode: 429,
      message: 'Too many incorrect codes. Please start again.',
    })

    expect(db.getRows()).toHaveLength(0)
  })
})
