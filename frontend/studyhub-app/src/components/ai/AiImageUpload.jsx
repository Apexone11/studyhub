/* ═══════════════════════════════════════════════════════════════════════════
 * AiImageUpload.jsx -- Image upload button and preview for Hub AI.
 *
 * Handles file selection, validation, base64 conversion, and thumbnail preview.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useRef, useEffect, useCallback } from 'react'
import { IconX } from '../Icons'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_IMAGES = 3

/**
 * Convert a File object to { base64, mediaType } for the API.
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // reader.result is "data:image/png;base64,iVBOR..."
      const base64 = reader.result.split(',')[1]
      resolve({ base64, mediaType: file.type })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Paperclip button that opens file picker for image selection.
 */
export function ImageUploadButton({ images, onImagesChange, disabled }) {
  const inputRef = useRef(null)

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const remaining = MAX_IMAGES - images.length
    const toProcess = files.slice(0, remaining)

    const newImages = []
    for (const file of toProcess) {
      if (!ALLOWED_TYPES.includes(file.type)) continue
      if (file.size > MAX_SIZE) continue
      try {
        const imgData = await fileToBase64(file)
        imgData.name = file.name
        imgData.previewUrl = URL.createObjectURL(file)
        newImages.push(imgData)
      } catch {
        // Skip failed conversions
      }
    }

    if (newImages.length > 0) {
      onImagesChange([...images, ...newImages])
    }

    // Reset the input so the same file can be selected again.
    e.target.value = ''
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={disabled || images.length >= MAX_IMAGES}
        title={images.length >= MAX_IMAGES ? `Max ${MAX_IMAGES} images` : 'Attach image'}
        style={{
          background: 'none',
          border: 'none',
          cursor: disabled || images.length >= MAX_IMAGES ? 'not-allowed' : 'pointer',
          padding: '6px 8px',
          color: 'var(--sh-muted)',
          fontSize: 16,
          opacity: disabled || images.length >= MAX_IMAGES ? 0.4 : 1,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </button>
    </>
  )
}

/**
 * Thumbnail strip showing selected images with remove buttons.
 * Revokes blob URLs on removal and on unmount to prevent memory leaks.
 */
export function ImagePreviewStrip({ images, onRemove }) {
  // Revoke all remaining blob URLs when the strip unmounts (e.g. message sent).
  const imagesRef = useRef(images)
  imagesRef.current = images

  useEffect(() => {
    return () => {
      for (const img of imagesRef.current) {
        if (img.previewUrl) URL.revokeObjectURL(img.previewUrl)
      }
    }
  }, [])

  const handleRemove = useCallback((idx) => {
    const removed = images[idx]
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
    onRemove(idx)
  }, [images, onRemove])

  if (images.length === 0) return null

  return (
    <div style={{
      display: 'flex',
      gap: 6,
      padding: '6px 0',
      flexWrap: 'wrap',
    }}>
      {images.map((img, idx) => (
        <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
          <img
            src={img.previewUrl}
            alt={img.name || `Image ${idx + 1}`}
            style={{
              width: 48, height: 48, borderRadius: 8,
              objectFit: 'cover', border: '1px solid var(--sh-border)',
            }}
          />
          <button
            onClick={() => handleRemove(idx)}
            style={{
              position: 'absolute', top: -4, right: -4,
              width: 16, height: 16, borderRadius: '50%',
              background: 'var(--sh-danger)', border: 'none',
              cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              padding: 0,
            }}
          >
            <IconX size={10} style={{ color: '#fff' }} />
          </button>
        </div>
      ))}
      <div style={{ fontSize: 10, color: 'var(--sh-muted)', alignSelf: 'center' }}>
        {images.length}/{MAX_IMAGES}
      </div>
    </div>
  )
}
