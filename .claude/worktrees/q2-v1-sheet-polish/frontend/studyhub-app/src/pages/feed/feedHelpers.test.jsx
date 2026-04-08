// feedHelpers.test keeps feed-specific attachment and delete rules beside the feed domain helpers.
import { describe, expect, it } from 'vitest'
import {
  attachmentEndpoints,
  attachmentPreviewKind,
  canUserDeletePost,
} from './feedHelpers'

describe('FeedPage helper rules', () => {
  it('allows post deletion for owner or admin only', () => {
    const post = { type: 'post', author: { id: 77 } }

    expect(canUserDeletePost({ id: 77, role: 'student' }, post)).toBe(true)
    expect(canUserDeletePost({ id: 10, role: 'admin' }, post)).toBe(true)
    expect(canUserDeletePost({ id: 10, role: 'student' }, post)).toBe(false)
    expect(canUserDeletePost({ id: 77, role: 'student' }, { type: 'sheet', author: { id: 77 } })).toBe(false)
    expect(canUserDeletePost(null, post)).toBe(false)
  })

  it('maps preview and download endpoints by feed item type', () => {
    expect(attachmentEndpoints({ type: 'post', id: 21, hasAttachment: true })).toMatchObject({
      previewUrl: expect.stringMatching(/\/api\/feed\/posts\/21\/attachment\/preview$/),
      downloadUrl: expect.stringMatching(/\/api\/feed\/posts\/21\/attachment$/),
      fullPreviewPath: '/preview/feed-post/21',
    })

    expect(attachmentEndpoints({ type: 'sheet', id: 44, hasAttachment: true })).toMatchObject({
      previewUrl: expect.stringMatching(/\/api\/sheets\/44\/attachment\/preview$/),
      downloadUrl: expect.stringMatching(/\/api\/sheets\/44\/attachment$/),
      fullPreviewPath: '/preview/sheet/44',
    })

    expect(attachmentEndpoints({ type: 'post', id: 55, hasAttachment: false })).toBeNull()
    expect(attachmentEndpoints({ type: 'announcement', id: 3, hasAttachment: true })).toBeNull()
  })

  it('classifies preview kinds from attachment metadata', () => {
    expect(attachmentPreviewKind({ attachmentType: 'image', attachmentName: 'notes.png' })).toBe('image')
    expect(attachmentPreviewKind({ attachmentType: 'pdf', attachmentName: 'exam.pdf' })).toBe('pdf')
    expect(attachmentPreviewKind({ attachmentType: 'text/plain', attachmentName: 'todo.txt' })).toBe('text')
    expect(attachmentPreviewKind({ attachmentType: 'application/octet-stream', attachmentName: 'archive.zip' })).toBe('document')
  })
})
