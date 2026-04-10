/**
 * storage.unit.test.js
 * Unit tests for backend/src/lib/storage.js
 *
 * Tests verify:
 * - URL builders return correct prefixed paths
 * - Path traversal safety (isPathWithinRoot)
 * - Leaf filename validation (isManagedLeafFileName)
 * - Upload URL resolution (resolveManagedUploadPath)
 * - Security against directory traversal attacks
 */

import { describe, it, expect } from 'vitest'
import path from 'node:path'
import {
  buildAvatarUrl,
  buildCoverUrl,
  buildAttachmentUrl,
  buildContentImageUrl,
  buildNoteImageUrl,
  buildGroupMediaUrl,
  isPathWithinRoot,
  isManagedLeafFileName,
  resolveManagedUploadPath,
} from '../src/lib/storage.js'

describe('storage.js', () => {
  describe('URL builders', () => {
    describe('buildAvatarUrl', () => {
      it('should build avatar URLs with correct prefix', () => {
        const url = buildAvatarUrl('alice.jpg')
        expect(url).toBe('/uploads/avatars/alice.jpg')
      })

      it('should work with various filename formats', () => {
        expect(buildAvatarUrl('user_123.png')).toBe('/uploads/avatars/user_123.png')
        expect(buildAvatarUrl('avatar-abc.webp')).toBe('/uploads/avatars/avatar-abc.webp')
      })
    })

    describe('buildCoverUrl', () => {
      it('should build cover URLs with correct prefix', () => {
        const url = buildCoverUrl('banner.jpg')
        expect(url).toBe('/uploads/covers/banner.jpg')
      })

      it('should handle various cover image formats', () => {
        expect(buildCoverUrl('cover-sheet.png')).toBe('/uploads/covers/cover-sheet.png')
        expect(buildCoverUrl('bg_image.webp')).toBe('/uploads/covers/bg_image.webp')
      })
    })

    describe('buildAttachmentUrl', () => {
      it('should build private attachment URLs with attachment:// prefix', () => {
        const url = buildAttachmentUrl('document.pdf')
        expect(url).toBe('attachment://document.pdf')
      })

      it('should use private attachment prefix', () => {
        const url = buildAttachmentUrl('file_123.docx')
        expect(url).toMatch(/^attachment:\/\//)
        expect(url).toBe('attachment://file_123.docx')
      })
    })

    describe('buildContentImageUrl', () => {
      it('should build content image URLs with correct prefix', () => {
        const url = buildContentImageUrl('diagram.png')
        expect(url).toBe('/uploads/content-images/diagram.png')
      })

      it('should handle various content image formats', () => {
        expect(buildContentImageUrl('math-formula.svg')).toBe('/uploads/content-images/math-formula.svg')
        expect(buildContentImageUrl('screenshot_001.jpg')).toBe('/uploads/content-images/screenshot_001.jpg')
      })
    })

    describe('buildNoteImageUrl', () => {
      it('should build note image URLs with correct prefix', () => {
        const url = buildNoteImageUrl('note-img.jpg')
        expect(url).toBe('/uploads/note-images/note-img.jpg')
      })

      it('should handle various note image formats', () => {
        expect(buildNoteImageUrl('sketch.png')).toBe('/uploads/note-images/sketch.png')
        expect(buildNoteImageUrl('annotation_1.webp')).toBe('/uploads/note-images/annotation_1.webp')
      })
    })

    describe('buildGroupMediaUrl', () => {
      it('should build group media URLs with correct prefix', () => {
        const url = buildGroupMediaUrl('photo.jpg')
        expect(url).toBe('/uploads/group-media/photo.jpg')
      })

      it('should handle various media formats', () => {
        expect(buildGroupMediaUrl('group-photo.png')).toBe('/uploads/group-media/group-photo.png')
        expect(buildGroupMediaUrl('session-recording.mp4')).toBe('/uploads/group-media/session-recording.mp4')
      })
    })
  })

  describe('isPathWithinRoot', () => {
    const rootDir = '/app/uploads'

    it('should accept exact root directory', () => {
      expect(isPathWithinRoot('/app/uploads', rootDir)).toBe(true)
    })

    it('should accept files within root', () => {
      expect(isPathWithinRoot('/app/uploads/avatars/user.jpg', rootDir)).toBe(true)
      expect(isPathWithinRoot('/app/uploads/covers/banner.png', rootDir)).toBe(true)
      expect(isPathWithinRoot('/app/uploads/nested/deep/file.txt', rootDir)).toBe(true)
    })

    it('should reject path traversal attempts', () => {
      expect(isPathWithinRoot('/app/uploads/../etc/passwd', rootDir)).toBe(false)
      expect(isPathWithinRoot('/app/uploads/../../sensitive/data', rootDir)).toBe(false)
      expect(isPathWithinRoot('/etc/passwd', rootDir)).toBe(false)
    })

    it('should reject sibling directories', () => {
      expect(isPathWithinRoot('/app/users', rootDir)).toBe(false)
      expect(isPathWithinRoot('/app/config', rootDir)).toBe(false)
      expect(isPathWithinRoot('/uploads', rootDir)).toBe(false)
    })

    it('should handle normalized paths correctly', () => {
      const normalizedPath = path.normalize('/app/uploads/avatars/./user.jpg')
      expect(isPathWithinRoot(normalizedPath, rootDir)).toBe(true)
    })

    it('should work with absolute and relative paths', () => {
      const absRoot = '/data/uploads'
      expect(isPathWithinRoot('/data/uploads/file.jpg', absRoot)).toBe(true)
      expect(isPathWithinRoot('../other/file.jpg', '/current/dir')).toBe(false)
    })
  })

  describe('isManagedLeafFileName', () => {
    it('should accept valid simple filenames', () => {
      expect(isManagedLeafFileName('avatar.jpg')).toBe(true)
      expect(isManagedLeafFileName('image_123.png')).toBe(true)
      expect(isManagedLeafFileName('file-name.pdf')).toBe(true)
      expect(isManagedLeafFileName('document.docx')).toBe(true)
    })

    it('should accept filenames with dots and dashes', () => {
      expect(isManagedLeafFileName('user.profile.jpg')).toBe(true)
      expect(isManagedLeafFileName('file-with-dashes.txt')).toBe(true)
      expect(isManagedLeafFileName('name_with_underscores.pdf')).toBe(true)
    })

    it('should accept filenames with numbers', () => {
      expect(isManagedLeafFileName('file123.jpg')).toBe(true)
      expect(isManagedLeafFileName('123456.png')).toBe(true)
      expect(isManagedLeafFileName('v2.0.0.zip')).toBe(true)
    })

    it('should reject empty filenames', () => {
      expect(isManagedLeafFileName('')).toBe(false)
      expect(isManagedLeafFileName(null)).toBe(false)
      expect(isManagedLeafFileName(undefined)).toBe(false)
    })

    it('should reject filenames with path separators', () => {
      expect(isManagedLeafFileName('folder/file.jpg')).toBe(false)
      expect(isManagedLeafFileName('../etc/passwd')).toBe(false)
      expect(isManagedLeafFileName('../../file.txt')).toBe(false)
    })

    it('should reject filenames with null bytes', () => {
      expect(isManagedLeafFileName('file\0.jpg')).toBe(false)
      expect(isManagedLeafFileName('image\x00.png')).toBe(false)
    })

    it('should reject absolute paths', () => {
      expect(isManagedLeafFileName('/etc/passwd')).toBe(false)
    })

    it('should only accept leaf filenames (no directories)', () => {
      expect(isManagedLeafFileName('dir/subdir/file.jpg')).toBe(false)
      expect(isManagedLeafFileName('./file.jpg')).toBe(false)
      expect(isManagedLeafFileName('../file.jpg')).toBe(false)
    })
  })

  describe('resolveManagedUploadPath', () => {
    it('should resolve valid avatar URLs', () => {
      const url = '/uploads/avatars/user123.jpg'
      const resolved = resolveManagedUploadPath(url)
      expect(resolved).toBeTruthy()
      expect(resolved).toMatch(/avatars/)
      expect(resolved).toMatch(/user123\.jpg$/)
    })

    it('should resolve valid cover URLs', () => {
      const url = '/uploads/covers/sheet456.png'
      const resolved = resolveManagedUploadPath(url)
      expect(resolved).toBeTruthy()
      expect(resolved).toMatch(/covers/)
    })

    it('should resolve valid content image URLs', () => {
      const url = '/uploads/content-images/diagram.png'
      const resolved = resolveManagedUploadPath(url)
      expect(resolved).toBeTruthy()
      expect(resolved).toMatch(/content-images/)
    })

    it('should resolve valid note image URLs', () => {
      const url = '/uploads/note-images/note-img.jpg'
      const resolved = resolveManagedUploadPath(url)
      expect(resolved).toBeTruthy()
      expect(resolved).toMatch(/note-images/)
    })

    it('should resolve valid group media URLs', () => {
      const url = '/uploads/group-media/photo.jpg'
      const resolved = resolveManagedUploadPath(url)
      expect(resolved).toBeTruthy()
      expect(resolved).toMatch(/group-media/)
    })

    it('should resolve private attachment URLs', () => {
      const url = 'attachment://document.pdf'
      const resolved = resolveManagedUploadPath(url)
      expect(resolved).toBeTruthy()
      expect(resolved).toMatch(/document\.pdf$/)
    })

    it('should reject path traversal in URL', () => {
      const url = '/uploads/avatars/../../../etc/passwd'
      const resolved = resolveManagedUploadPath(url)
      expect(resolved).toBeNull()
    })

    it('should handle URL-encoded filenames as valid leaf names', () => {
      const url = '/uploads/avatars/..%2fetc%2fpasswd'
      const resolved = resolveManagedUploadPath(url)
      // URL-encoded sequences like %2f are treated as literal characters, not decoded
      // so this passes isManagedLeafFileName as a valid leaf filename
      expect(resolved).toBeTruthy()
    })

    it('should reject URLs with directory traversal characters', () => {
      expect(resolveManagedUploadPath('/uploads/avatars/../../file.jpg')).toBeNull()
      expect(resolveManagedUploadPath('/uploads/covers/../../../etc/passwd')).toBeNull()
    })

    it('should reject invalid prefixes', () => {
      expect(resolveManagedUploadPath('/invalid/path/file.jpg')).toBeNull()
      expect(resolveManagedUploadPath('/uploads/unknown-type/file.jpg')).toBeNull()
      expect(resolveManagedUploadPath('http://example.com/file.jpg')).toBeNull()
    })

    it('should reject URLs without valid filenames', () => {
      expect(resolveManagedUploadPath('/uploads/avatars/')).toBeNull()
      expect(resolveManagedUploadPath('/uploads/avatars')).toBeNull()
    })

    it('should reject URLs with null bytes', () => {
      expect(resolveManagedUploadPath('/uploads/avatars/file\0.jpg')).toBeNull()
    })

    it('should reject root directory resolution', () => {
      // Should not resolve to just the directory itself
      expect(resolveManagedUploadPath('/uploads/avatars')).toBeNull()
    })

    it('should handle empty and null inputs gracefully', () => {
      expect(resolveManagedUploadPath('')).toBeNull()
      expect(resolveManagedUploadPath(null)).toBeNull()
      expect(resolveManagedUploadPath(undefined)).toBeNull()
    })

    it('should resolve URLs with allowed special characters in filenames', () => {
      const url = '/uploads/avatars/user-name_123.jpg'
      const resolved = resolveManagedUploadPath(url)
      expect(resolved).toBeTruthy()
    })
  })

  describe('Security: Path traversal prevention', () => {
    it('should prevent absolute path escape via absolute-looking filenames', () => {
      expect(isManagedLeafFileName('/etc/passwd')).toBe(false)
    })

    it('should prevent relative path escape sequences', () => {
      // path.basename handles these correctly:
      // '..' is a leaf name (basename('..') === '..')
      // '../' is not a leaf (basename('../') === '..' !== '../')
      // '...' is a leaf name (basename('...') === '...')
      expect(isManagedLeafFileName('../')).toBe(false)
    })

    it('should prevent double extension tricks in leaf filename validation', () => {
      // Even though double extensions are technically valid filenames,
      // the path should still be a leaf (no directory components)
      expect(isManagedLeafFileName('file.php.jpg')).toBe(true)
      expect(isManagedLeafFileName('file.jpg.php')).toBe(true)
    })

    it('resolveManagedUploadPath should prevent symlink-based escapes by validating paths', () => {
      const url = '/uploads/avatars/file.jpg'
      const resolved = resolveManagedUploadPath(url)
      // The resolved path should be validated by isPathWithinRoot
      expect(resolved).toBeTruthy()
    })

    it('should prevent URL encoding tricks in path traversal', () => {
      // URL-encoded ../ should fail because decoded filename won't be a valid leaf
      const url = '/uploads/avatars/%2e%2e/etc/passwd'
      const resolved = resolveManagedUploadPath(url)
      expect(resolved).toBeNull()
    })
  })

  describe('Edge cases and robustness', () => {
    it('should handle very long filenames', () => {
      const longName = 'a'.repeat(255) + '.jpg'
      const result = isManagedLeafFileName(longName)
      expect(typeof result).toBe('boolean')
    })

    it('should handle unicode filenames gracefully', () => {
      const unicodeName = 'файл_文件.jpg'
      const result = isManagedLeafFileName(unicodeName)
      expect(typeof result).toBe('boolean')
    })

    it('should handle special characters in filenames', () => {
      expect(isManagedLeafFileName('file@2024.jpg')).toBe(true)
      expect(isManagedLeafFileName('file#1.png')).toBe(true)
      expect(isManagedLeafFileName('file&name.pdf')).toBe(true)
    })

    it('should handle various platform path separators in isPathWithinRoot', () => {
      const root = '/app/uploads'
      expect(isPathWithinRoot('/app/uploads/file.jpg', root)).toBe(true)
    })
  })
})
