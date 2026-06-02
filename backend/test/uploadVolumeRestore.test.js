import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

const require = createRequire(import.meta.url)
const {
  runRestorePass,
  isSafeRelativePath,
  isRestoreOnBootEnabled,
} = require('../src/lib/jobs/uploadVolumeRestore')
const { KEY_PREFIX } = require('../src/lib/jobs/uploadVolumeBackup')
const { ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3')

/* A minimal in-memory R2 stand-in. ListObjectsV2 returns the configured
 * pages in order (so pagination can be exercised); GetObject streams the
 * buffer registered for the requested key. */
function makeClient({ pages, contentByKey }) {
  let listCall = 0
  return {
    async send(command) {
      if (command instanceof ListObjectsV2Command) {
        const page = pages[listCall] || { Contents: [], IsTruncated: false }
        listCall += 1
        return page
      }
      if (command instanceof GetObjectCommand) {
        const buf = contentByKey[command.input.Key] ?? Buffer.from('default')
        // AWS SDK v3 returns a Node Readable for Body in a Node runtime; the
        // restore pipes it to disk, so the fake must be a real stream too.
        return { Body: Readable.from([buf]) }
      }
      throw new Error(`unexpected command: ${command?.constructor?.name}`)
    },
  }
}

describe('uploadVolumeRestore', () => {
  let uploadsDir

  beforeEach(() => {
    uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uvr-'))
  })

  afterEach(() => {
    fs.rmSync(uploadsDir, { recursive: true, force: true })
  })

  it('restores objects that are missing locally, preserving relative layout', async () => {
    const client = makeClient({
      pages: [
        {
          Contents: [{ Key: `${KEY_PREFIX}avatars/1.jpg` }, { Key: `${KEY_PREFIX}covers/2.png` }],
          IsTruncated: false,
        },
      ],
      contentByKey: {
        [`${KEY_PREFIX}avatars/1.jpg`]: Buffer.from('avatar-bytes'),
        [`${KEY_PREFIX}covers/2.png`]: Buffer.from('cover-bytes'),
      },
    })

    const summary = await runRestorePass({ uploadsDir, bucket: 'b', client })

    expect(summary).toMatchObject({ scanned: 2, restored: 2, skipped: 0, failed: 0 })
    expect(fs.readFileSync(path.join(uploadsDir, 'avatars', '1.jpg'), 'utf8')).toBe('avatar-bytes')
    expect(fs.readFileSync(path.join(uploadsDir, 'covers', '2.png'), 'utf8')).toBe('cover-bytes')
  })

  it('skips files that already exist (skip-if-exists) and overwrites with force', async () => {
    fs.mkdirSync(path.join(uploadsDir, 'avatars'), { recursive: true })
    fs.writeFileSync(path.join(uploadsDir, 'avatars', '1.jpg'), 'local-newer')

    const pages = [{ Contents: [{ Key: `${KEY_PREFIX}avatars/1.jpg` }], IsTruncated: false }]
    const contentByKey = { [`${KEY_PREFIX}avatars/1.jpg`]: Buffer.from('r2-stale') }

    const safe = await runRestorePass({
      uploadsDir,
      bucket: 'b',
      client: makeClient({ pages, contentByKey }),
    })
    expect(safe).toMatchObject({ restored: 0, skipped: 1 })
    expect(fs.readFileSync(path.join(uploadsDir, 'avatars', '1.jpg'), 'utf8')).toBe('local-newer')

    const forced = await runRestorePass({
      uploadsDir,
      bucket: 'b',
      force: true,
      client: makeClient({ pages, contentByKey }),
    })
    expect(forced).toMatchObject({ restored: 1, skipped: 0 })
    expect(fs.readFileSync(path.join(uploadsDir, 'avatars', '1.jpg'), 'utf8')).toBe('r2-stale')
  })

  it('refuses traversal keys without writing outside the uploads dir', async () => {
    const client = makeClient({
      pages: [
        {
          Contents: [{ Key: `${KEY_PREFIX}../escape.txt` }, { Key: `${KEY_PREFIX}avatars/ok.jpg` }],
          IsTruncated: false,
        },
      ],
      contentByKey: { [`${KEY_PREFIX}avatars/ok.jpg`]: Buffer.from('ok') },
    })

    const summary = await runRestorePass({ uploadsDir, bucket: 'b', client })

    expect(summary).toMatchObject({ restored: 1, failed: 1 })
    expect(fs.existsSync(path.join(path.dirname(uploadsDir), 'escape.txt'))).toBe(false)
  })

  it('walks every page of a paginated listing', async () => {
    const client = makeClient({
      pages: [
        {
          Contents: [{ Key: `${KEY_PREFIX}a.bin` }],
          IsTruncated: true,
          NextContinuationToken: 't',
        },
        { Contents: [{ Key: `${KEY_PREFIX}b.bin` }], IsTruncated: false },
      ],
      contentByKey: {
        [`${KEY_PREFIX}a.bin`]: Buffer.from('a'),
        [`${KEY_PREFIX}b.bin`]: Buffer.from('b'),
      },
    })

    const summary = await runRestorePass({ uploadsDir, bucket: 'b', client })
    expect(summary).toMatchObject({ scanned: 2, restored: 2 })
  })

  it('dry-run counts without writing', async () => {
    const client = makeClient({
      pages: [{ Contents: [{ Key: `${KEY_PREFIX}avatars/1.jpg` }], IsTruncated: false }],
      contentByKey: { [`${KEY_PREFIX}avatars/1.jpg`]: Buffer.from('x') },
    })
    const summary = await runRestorePass({ uploadsDir, bucket: 'b', dryRun: true, client })
    expect(summary).toMatchObject({ restored: 1 })
    expect(fs.existsSync(path.join(uploadsDir, 'avatars', '1.jpg'))).toBe(false)
  })

  it('isSafeRelativePath rejects absolute and parent-traversal paths', () => {
    expect(isSafeRelativePath('avatars/1.jpg')).toBe(true)
    expect(isSafeRelativePath('')).toBe(false)
    expect(isSafeRelativePath('/etc/passwd')).toBe(false)
    expect(isSafeRelativePath('../x')).toBe(false)
    expect(isSafeRelativePath('a/../../x')).toBe(false)
    expect(isSafeRelativePath('a\\..\\b')).toBe(false)
  })

  it('isRestoreOnBootEnabled honours the explicit override before NODE_ENV', () => {
    const prevFlag = process.env.UPLOAD_RESTORE_ON_BOOT
    const prevEnv = process.env.NODE_ENV
    try {
      process.env.UPLOAD_RESTORE_ON_BOOT = 'true'
      expect(isRestoreOnBootEnabled()).toBe(true)
      process.env.UPLOAD_RESTORE_ON_BOOT = 'false'
      process.env.NODE_ENV = 'production'
      expect(isRestoreOnBootEnabled()).toBe(false)
      delete process.env.UPLOAD_RESTORE_ON_BOOT
      process.env.NODE_ENV = 'production'
      expect(isRestoreOnBootEnabled()).toBe(true)
      process.env.NODE_ENV = 'development'
      expect(isRestoreOnBootEnabled()).toBe(false)
    } finally {
      if (prevFlag === undefined) delete process.env.UPLOAD_RESTORE_ON_BOOT
      else process.env.UPLOAD_RESTORE_ON_BOOT = prevFlag
      process.env.NODE_ENV = prevEnv
    }
  })
})
