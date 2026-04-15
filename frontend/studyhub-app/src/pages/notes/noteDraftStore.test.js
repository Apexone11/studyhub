import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { draftStore } from './noteDraftStore.js'

describe('noteDraftStore', () => {
  beforeEach(async () => {
    await draftStore._reset()
  })

  it('put then get roundtrips a draft', async () => {
    await draftStore.put('n1', {
      title: 'T',
      content: 'C',
      baseRevision: 5,
      dirtyAt: 1700000000000,
      saveId: 'u1',
    })
    const got = await draftStore.get('n1')
    expect(got.title).toBe('T')
    expect(got.content).toBe('C')
    expect(got.baseRevision).toBe(5)
    expect(got.saveId).toBe('u1')
  })

  it('get returns null when entry missing', async () => {
    expect(await draftStore.get('missing')).toBeNull()
  })

  it('put overwrites existing entry', async () => {
    await draftStore.put('n2', {
      title: 'A',
      content: 'A',
      baseRevision: 0,
      dirtyAt: 0,
      saveId: 'a',
    })
    await draftStore.put('n2', {
      title: 'B',
      content: 'B',
      baseRevision: 1,
      dirtyAt: 1,
      saveId: 'b',
    })
    const got = await draftStore.get('n2')
    expect(got.title).toBe('B')
    expect(got.baseRevision).toBe(1)
  })

  it('delete removes the entry', async () => {
    await draftStore.put('n3', {
      title: 'x',
      content: 'y',
      baseRevision: 0,
      dirtyAt: 0,
      saveId: 'u',
    })
    await draftStore.delete('n3')
    expect(await draftStore.get('n3')).toBeNull()
  })

  it('listPending returns all current drafts with noteId field', async () => {
    await draftStore.put('a', {
      title: 'a',
      content: '',
      baseRevision: 0,
      dirtyAt: 0,
      saveId: 'sa',
    })
    await draftStore.put('b', {
      title: 'b',
      content: '',
      baseRevision: 0,
      dirtyAt: 0,
      saveId: 'sb',
    })
    const all = await draftStore.listPending()
    expect(all.map((d) => d.noteId).sort()).toEqual(['a', 'b'])
  })
})
