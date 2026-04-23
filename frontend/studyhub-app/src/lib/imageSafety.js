/* ═══════════════════════════════════════════════════════════════════════════
 * imageSafety.js — Client-side image safety check (lightweight fallback)
 *
 * Provides pre-upload screening for image attachments. Does NOT use TF.js
 * or ML models. Instead it uses canvas-based heuristics:
 *   1. Image dimension validation
 *   2. File size anomaly detection
 *   3. Skin-tone pixel ratio heuristic (basic, not a classifier)
 *
 * For production NSFW detection, the server-side OpenAI moderation
 * (backend/src/lib/moderationEngine.js) is authoritative.
 * ═══════════════════════════════════════════════════════════════════════════ */

const MAX_WIDTH = 8192
const MAX_HEIGHT = 8192
const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15MB
const SKIN_TONE_THRESHOLD = 0.6 // Flag if >60% skin-tone pixels (very rough heuristic)

/**
 * Run lightweight client-side safety checks on an image file.
 *
 * @param {File} file — browser File object (must be an image)
 * @returns {Promise<{safe: boolean, checks: Array, warnings: string[]}>}
 */
export async function checkImageSafety(file) {
  const results = { safe: true, checks: [], warnings: [] }

  // 1. File size check
  if (file.size > MAX_FILE_SIZE) {
    results.warnings.push('File exceeds maximum size limit')
    results.safe = false
    return results
  }
  results.checks.push({ name: 'fileSize', passed: true })

  // 2. Image dimension check
  try {
    const dimensions = await getImageDimensions(file)
    if (dimensions.width > MAX_WIDTH || dimensions.height > MAX_HEIGHT) {
      results.warnings.push('Image dimensions exceed maximum allowed')
      results.safe = false
      return results
    }
    results.checks.push({ name: 'dimensions', passed: true, data: dimensions })
  } catch {
    results.warnings.push('Could not read image dimensions')
    results.checks.push({ name: 'dimensions', passed: false })
    return results
  }

  // 3. Basic skin-tone heuristic (informational, not authoritative)
  try {
    const skinRatio = await estimateSkinToneRatio(file)
    if (skinRatio > SKIN_TONE_THRESHOLD) {
      results.warnings.push('Image flagged for manual review (high skin-tone ratio)')
      results.checks.push({ name: 'skinTone', passed: false, ratio: skinRatio })
      // Don't block — just flag for server-side review
    } else {
      results.checks.push({ name: 'skinTone', passed: true, ratio: skinRatio })
    }
  } catch {
    // Canvas analysis is best-effort — skip if OffscreenCanvas is unavailable
    results.checks.push({ name: 'skinTone', passed: true, ratio: null })
  }

  return results
}

/**
 * Read natural width/height of an image file via an in-memory <img>.
 */
function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.width, height: img.height })
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      reject(new Error('Image load failed'))
    }
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Sample a down-scaled grid of pixels and estimate what fraction fall in
 * common skin-tone RGB ranges. This is a very rough heuristic — it is NOT
 * a classifier and is not authoritative. It exists to provide an
 * informational signal for the server-side moderation pipeline.
 */
async function estimateSkinToneRatio(file) {
  const img = await createImageBitmap(file)
  const sampleW = Math.min(img.width, 100)
  const sampleH = Math.min(img.height, 100)
  const canvas = new OffscreenCanvas(sampleW, sampleH)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, sampleW, sampleH)
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH)

  let skinPixels = 0
  let totalPixels = 0

  for (let i = 0; i < data.length; i += 16) {
    // Sample every 4th pixel (stride of 16 bytes = 4 channels × 4 pixels)
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    totalPixels++
    // Basic skin-tone detection in RGB space (Peer, 2003 thresholds)
    if (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15 && r - b > 15) {
      skinPixels++
    }
  }

  return totalPixels > 0 ? skinPixels / totalPixels : 0
}

/**
 * Returns true if the given File has an image MIME type.
 */
export function isImageFile(file) {
  return file?.type?.startsWith('image/')
}
