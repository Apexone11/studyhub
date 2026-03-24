/**
 * CoverCropModal — Rectangular crop + upload modal for profile cover images.
 *
 * Uses react-easy-crop for drag/zoom cropping with a 16:5 aspect ratio.
 * Outputs a cropped JPEG blob and uploads to POST /api/upload/cover.
 */
import { useCallback, useState } from 'react'
import Cropper from 'react-easy-crop'
import { API } from '../config'
import { readJsonSafely, getApiErrorMessage } from '../lib/http'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
const MAX_FILE_SIZE = 8 * 1024 * 1024 // 8 MB (client-side pre-check)
const ASPECT = 16 / 5

function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', (err) => reject(err))
    img.crossOrigin = 'anonymous'
    img.src = url
  })
}

async function getCroppedBlob(imageSrc, pixelCrop) {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y,
    pixelCrop.width, pixelCrop.height,
    0, 0,
    pixelCrop.width, pixelCrop.height,
  )
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
}

export default function CoverCropModal({ onClose, onUploaded }) {
  const [imageSrc, setImageSrc] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const onCropComplete = useCallback((_area, areaPixels) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_SIZE) {
      setError('File must be 8 MB or smaller.')
      return
    }

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG, or WebP).')
      return
    }

    setError('')
    const reader = new FileReader()
    reader.addEventListener('load', () => setImageSrc(reader.result))
    reader.readAsDataURL(file)
  }

  async function handleUpload() {
    if (!croppedAreaPixels || !imageSrc) return

    setUploading(true)
    setError('')

    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels)
      const formData = new FormData()
      formData.append('cover', blob, 'cover.jpg')

      const response = await fetch(`${API}/api/upload/cover`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      const data = await readJsonSafely(response, {})

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Failed to upload cover image.'))
      }

      if (onUploaded) onUploaded(data.coverImageUrl)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to upload cover image.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--sh-heading)', fontFamily: FONT }}>
            Upload Cover Image
          </h2>
          <button type="button" onClick={onClose} style={closeBtnStyle}>Cancel</button>
        </div>

        {!imageSrc ? (
          <div style={dropZoneStyle}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>
              <i className="fa-solid fa-panorama" style={{ color: 'var(--sh-muted)' }} />
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--sh-muted)', lineHeight: 1.6 }}>
              Choose a wide photo for your profile banner
            </p>
            <label style={selectBtnStyle}>
              Select image
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelect} style={{ display: 'none' }} />
            </label>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--sh-muted)' }}>
              JPG, PNG, or WebP. Max 8 MB. Cropped to 16:5.
            </p>
          </div>
        ) : (
          <>
            <div style={{ position: 'relative', width: '100%', height: 220, borderRadius: 12, overflow: 'hidden', background: 'var(--sh-soft)' }}>
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={ASPECT}
                cropShape="rect"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--sh-muted)', fontWeight: 700 }}>Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                style={{ flex: 1 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <label style={{ ...selectBtnStyle, background: 'var(--sh-soft)', color: 'var(--sh-text)', border: '1px solid var(--sh-border)' }}>
                Change image
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelect} style={{ display: 'none' }} />
              </label>
              <button
                type="button"
                disabled={uploading}
                onClick={handleUpload}
                style={{
                  padding: '10px 22px', borderRadius: 10, border: 'none',
                  background: 'var(--sh-brand)', color: '#fff',
                  fontSize: 13, fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer',
                  opacity: uploading ? 0.6 : 1, fontFamily: FONT,
                }}
              >
                {uploading ? 'Uploading\u2026' : 'Save'}
              </button>
            </div>
          </>
        )}

        {error && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger-border)', color: 'var(--sh-danger)', fontSize: 12 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 1200,
  background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20,
}

const modalStyle = {
  width: 'min(92vw, 520px)',
  background: 'var(--sh-surface)',
  borderRadius: 18,
  border: '1px solid var(--sh-border)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  padding: 24,
  fontFamily: FONT,
}

const closeBtnStyle = {
  padding: '6px 14px', borderRadius: 8,
  border: '1px solid var(--sh-border)', background: 'var(--sh-soft)',
  color: 'var(--sh-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  fontFamily: FONT,
}

const dropZoneStyle = {
  padding: '40px 24px',
  textAlign: 'center',
  borderRadius: 14,
  border: '2px dashed var(--sh-border)',
  background: 'var(--sh-soft)',
}

const selectBtnStyle = {
  display: 'inline-block',
  padding: '9px 20px', borderRadius: 10, border: 'none',
  background: 'var(--sh-brand)', color: '#fff',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
  fontFamily: FONT,
}
