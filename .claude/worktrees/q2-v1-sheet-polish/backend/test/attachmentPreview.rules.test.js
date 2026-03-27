import { describe, expect, it } from 'vitest'
import { inferPreviewMimeType, previewKindForMime } from '../src/lib/attachmentPreview'

describe('attachmentPreview rules', () => {
  it('infers expected mime types for preview endpoints', () => {
    expect(inferPreviewMimeType('C:/tmp/file.pdf', 'file.pdf', 'pdf')).toBe('application/pdf')
    expect(inferPreviewMimeType('C:/tmp/file.png', 'file.png', 'image')).toBe('image/png')
    expect(inferPreviewMimeType('C:/tmp/file.json', 'file.json', 'text/plain')).toBe('application/json; charset=utf-8')
    expect(inferPreviewMimeType('C:/tmp/file.bin', 'file.bin', '')).toBe('application/octet-stream')
  })

  it('maps mime types to preview render kinds', () => {
    expect(previewKindForMime('image/png')).toBe('image')
    expect(previewKindForMime('application/pdf')).toBe('pdf')
    expect(previewKindForMime('text/plain; charset=utf-8')).toBe('text')
    expect(previewKindForMime('application/octet-stream')).toBe('document')
  })
})
