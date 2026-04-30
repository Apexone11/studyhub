import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..', '..')
const schemaPath = path.join(repoRoot, 'backend', 'prisma', 'schema.prisma')
const migrationPath = path.join(
  repoRoot,
  'backend',
  'prisma',
  'migrations',
  '20260430000002_add_notification_fanout_dedup_index',
  'migration.sql',
)

describe('notification fan-out dedup index', () => {
  it('keeps schema and migration coverage for the dedup lookup', () => {
    const schema = fs.readFileSync(schemaPath, 'utf8')
    const migration = fs.readFileSync(migrationPath, 'utf8')

    expect(schema).toContain(
      '@@index([userId, type, actorId, sheetId, createdAt(sort: Desc)], map: "Notification_fanout_dedup_idx")',
    )
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS "Notification_fanout_dedup_idx"')
    expect(migration).toContain('"userId", "type", "actorId", "sheetId", "createdAt" DESC')
  })
})
